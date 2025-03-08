import {
  fetch as undiciFetch,
  ProxyAgent,
  RequestInfo as undiciRequestInfo,
  RequestInit as undiciRequestInit,
} from 'undici';
import { Octokit, RequestError } from 'octokit';
import { paginateGraphQL } from '@octokit/plugin-paginate-graphql';
import { throttling } from '@octokit/plugin-throttling';
import {
  IssuesResponse,
  IssueStats,
  Logger,
  LoggerFn,
  PullRequestNode,
  RateLimitCheck,
  RateLimitResponse,
  RateLimitResult,
  RepositoryStats,
} from './types';
import { AuthConfig } from './auth';
import { components } from '@octokit/openapi-types/types';

const OctokitWithPlugins = Octokit.plugin(paginateGraphQL).plugin(throttling);

interface OnRateLimitOptions {
  method: string;
  url: string;
}

export const createOctokit = (
  authConfig: AuthConfig,
  baseUrl: string,
  proxyUrl: string | undefined,
  logger: Logger,
  // We allow `any` here because we want to be able to pass in a mocked version of `fetch` -
  // plus this `any` aligns with Octokit's typings.
  //
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fetch?: any,
): Octokit => {
  const customFetch = (url: undiciRequestInfo, options: undiciRequestInit) => {
    return undiciFetch(url, {
      ...options,
      dispatcher: proxyUrl ? new ProxyAgent(proxyUrl) : undefined,
    });
  };

  const wrappedWarn: LoggerFn = (message: string, meta: unknown) => {
    // Suppress automatic warning from @octokit/request about the tag protections API being deprecated
    // (https://github.com/octokit/request.js/blob/712d2208a285ff11d7f3ca8362ca53289fd7bc82/src/fetch-wrapper.ts#L63-L74)
    if (message.includes('https://gh.io/tag-protection-sunset')) return;
    logger.warn(message, meta);
  };

  const octokit = new OctokitWithPlugins({
    auth: authConfig.auth,
    authStrategy: authConfig.authStrategy,
    baseUrl,
    request: {
      fetch: fetch || customFetch,
      log: { ...logger, warn: wrappedWarn },
    },
    retry: {
      enabled: false,
    },
    throttle: {
      onRateLimit: (retryAfter: any, options: any) => {
        const { method, url } = options as OnRateLimitOptions;

        logger.warn(
          `Primary rate limit exceeded for request \`${method} ${url}\` - retrying after ${retryAfter} seconds`,
        );

        return true;
      },
      onSecondaryRateLimit: (retryAfter: any, options: any) => {
        const { method, url } = options as OnRateLimitOptions;

        logger.warn(
          `Secondary rate limit exceeded for request \`${method} ${url}\` - retrying after ${retryAfter} seconds`,
        );

        return true;
      },
    },
  });

  octokit.hook.after('request', async (response: any, options: any) => {
    logger.debug(`${options.method} ${options.url}: ${response.status}`);
  });

  octokit.hook.error('request', async (error: any, options: any) => {
    if (error instanceof RequestError) {
      logger.debug(
        `${options.method} ${options.url}: ${error.status} - ${error.message}`,
      );
    } else {
      logger.debug(
        `${options.method} ${options.url}: ${error.name} - ${error.message}`,
      );
    }

    throw error;
  });

  return octokit;
};

const octokit_headers = {
  'X-GitHub-Api-Version': '2022-11-28',
};

export type RepositoryType = components['schemas']['repository'];

// get the repos for the org
export async function* listReposForOrg({
  org,
  per_page,
  octokit,
}: {
  org: string;
  per_page: number;
  octokit: Octokit;
}): AsyncGenerator<RepositoryType, void, unknown> {
  const iterator = await octokit.paginate.iterator(
    octokit.rest.repos.listForOrg,
    {
      org,
      type: 'all',
      per_page: per_page,
      page: 1,
      headers: octokit_headers,
    },
  );

  for await (const { data: repos } of iterator) {
    for (const repo of repos) {
      yield repo;
    }
  }
}

export async function generateAppToken({
  octokit,
}: {
  octokit: Octokit;
}): Promise<string> {
  const appToken = await octokit.auth({
    type: 'installation',
  });
  process.env.GH_TOKEN = appToken.token;
  return appToken.token;
}

export async function* getOrgRepoStats({
  org,
  per_page,
  octokit,
  cursor = null,
}: {
  org: string;
  per_page: number;
  octokit: Octokit;
  cursor?: string | null;
}): AsyncGenerator<RepositoryStats, void, unknown> {
  const IS_EMPTY_FLAG = 'isEmpty';

  const query = `
    query orgRepoStats($login: String!, $pageSize: Int!, $cursor: String) {
      organization(login: $login) {
        repositories(first: $pageSize, after: $cursor, orderBy: {field: NAME, direction: ASC}) {
          pageInfo {
            endCursor
            hasNextPage
          }
          nodes {
            branches: refs(refPrefix:"refs/heads/") {
              totalCount
            }
            branchProtectionRules {
              totalCount
            }
            commitComments {
              totalCount
            }
            collaborators {
              totalCount
            }
            createdAt
            diskUsage
            discussions {
              totalCount
            }
            hasWikiEnabled
            ${IS_EMPTY_FLAG}
            isFork
            isArchived
            issues(first: $pageSize) {
              totalCount
              pageInfo {
                endCursor
                hasNextPage
              }
              nodes {
                timeline {
                  totalCount
                }
                comments {
                  totalCount
                }
              }
            }
            milestones {
              totalCount
            }
            name
            owner {
              login
            }
            projects {
              totalCount
            }
            pullRequests(first: $pageSize) {
              totalCount
              pageInfo {
                endCursor
                hasNextPage
              }
              nodes {
                comments {
                  totalCount
                }
                commits {
                  totalCount
                }
                number
                reviews(first: $pageSize) {
                  totalCount
                  pageInfo {
                    endCursor
                    hasNextPage
                  }
                  nodes {
                    comments {
                      totalCount
                    }
                  }
                }
                timeline {
                  totalCount
                }
              }
            }
            pushedAt
            releases {
              totalCount
            }
            tags: refs(refPrefix: "refs/tags/") {
              totalCount
            }
            updatedAt
            url
          }
        }
      }
    }`;

  const iterator = await octokit.graphql.paginate.iterator(query, {
    login: org,
    pageSize: per_page,
    cursor, // Use provided cursor or null for first page
  });

  for await (const response of iterator) {
    const repos = response.organization.repositories.nodes;
    for (const repo of repos) {
      yield repo;
    }
  }
}

export async function* getRepoIssues({
  owner,
  repo,
  per_page,
  octokit,
  cursor = null,
}: {
  owner: string;
  repo: string;
  per_page: number;
  octokit: Octokit;
  cursor?: string | null;
}): AsyncGenerator<IssueStats, void, unknown> {
  const query = `
    query repoIssues($owner: String!, $repo: String!, $pageSize: Int!, $cursor: String) {
      repository(owner: $owner, name: $repo) {
        issues(first: $pageSize, after: $cursor) {
          pageInfo {
            endCursor
            hasNextPage
          }
          nodes {
            timeline {
              totalCount
            }
            comments {
              totalCount
            }
          }
        }
      }
    }`;

  const iterator = await octokit.graphql.paginate.iterator<IssuesResponse>(
    query,
    {
      owner,
      repo,
      pageSize: per_page,
      cursor,
    },
  );

  for await (const response of iterator) {
    const issues = response.repository.issues.nodes;
    for (const issue of issues) {
      yield issue;
    }
  }
}

export async function* getRepoPullRequests({
  owner,
  repo,
  per_page,
  octokit,
  cursor = null,
}: {
  owner: string;
  repo: string;
  per_page: number;
  octokit: Octokit;
  cursor?: string | null;
}): AsyncGenerator<PullRequestNode, void, unknown> {
  const query = `
    query repoPullRequests($owner: String!, $repo: String!, $pageSize: Int!, $cursor: String) {
      repository(owner: $owner, name: $repo) {
        pullRequests(first: $pageSize, after: $cursor) {
          pageInfo {
            endCursor
            hasNextPage
          }
          nodes {
            number
            timeline {
              totalCount
            }
            comments {
              totalCount
            }
            commits {
              totalCount
            }
            reviews(first: $pageSize) {
              totalCount
              nodes {
                comments {
                  totalCount
                }
              }
            }
          }
        }
      }
    }`;

  const iterator = await octokit.graphql.paginate.iterator(query, {
    owner,
    repo,
    pageSize: per_page,
    cursor,
  });

  for await (const response of iterator) {
    const prs = response.repository.pullRequests.nodes;
    for (const pr of prs) {
      yield pr;
    }
  }
}

async function getRateLimitData(
  octokit: Octokit,
): Promise<RateLimitCheck | null> {
  const response = await octokit.request('GET /rate_limit');
  const rateLimitData = response.data as RateLimitResponse;

  if (rateLimitData.message === 'Rate limiting is not enabled.') {
    return {
      graphQLRemaining: 9999999999,
      coreRemaining: 9999999999,
      message: 'API rate limiting is not enabled.',
    };
  }

  return {
    graphQLRemaining: rateLimitData.resources?.graphql.remaining || 0,
    coreRemaining: rateLimitData.resources?.core.remaining || 0,
    message: '',
  };
}

export async function checkRateLimits({
  octokit,
  sleepSeconds = 60,
  maxRetries = 5,
}: {
  octokit: Octokit;
  sleepSeconds?: number;
  maxRetries?: number;
}): Promise<RateLimitResult> {
  const result: RateLimitResult = {
    apiRemainingRequest: 0,
    apiRemainingMessage: '',
    graphQLRemaining: 0,
    graphQLMessage: '',
    message: '',
    messageType: 'info',
  };

  try {
    let sleepCounter = 0;
    const rateLimitCheck = await getRateLimitData(octokit);

    if (!rateLimitCheck) {
      throw new Error('Failed to get rate limit data');
    }

    result.graphQLRemaining = rateLimitCheck.graphQLRemaining;
    result.apiRemainingRequest = rateLimitCheck.coreRemaining;

    if (rateLimitCheck.message) {
      result.apiRemainingMessage = rateLimitCheck.message;
      result.graphQLMessage = rateLimitCheck.message;
      result.message = rateLimitCheck.message;
      return result;
    }

    if (rateLimitCheck.graphQLRemaining === 0) {
      sleepCounter++;
      const warningMessage = `We have run out of GraphQL calls and need to sleep! Sleeping for ${sleepSeconds} seconds before next check`;

      if (sleepCounter > maxRetries) {
        result.message = `Exceeded maximum retry attempts of ${maxRetries}`;
        result.messageType = 'error';
        return result;
      }

      result.message = warningMessage;
      result.messageType = 'warning';
      result.graphQLMessage = warningMessage;

      await new Promise((resolve) => setTimeout(resolve, sleepSeconds * 1000));
    } else {
      const message = `Rate limits remaining: ${rateLimitCheck.graphQLRemaining.toLocaleString()} GraphQL points ${rateLimitCheck.coreRemaining.toLocaleString()} REST calls`;
      result.message = message;
      result.messageType = 'info';
      result.graphQLMessage = message;
    }
  } catch (error) {
    result.message =
      error instanceof Error
        ? error.message
        : 'Failed to get valid response back from GitHub API!';
    result.messageType = 'error';
  }

  return result;
}
