import {
  fetch as undiciFetch,
  ProxyAgent,
  RequestInfo as undiciRequestInfo,
  RequestInit as undiciRequestInit,
} from 'undici';
import { Octokit, RequestError } from 'octokit';
import { paginateGraphQL } from '@octokit/plugin-paginate-graphql';
import { throttling } from '@octokit/plugin-throttling';
import { Logger, LoggerFn, RepositoryStats } from './types';
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
}: {
  org: string;
  per_page: number;
  octokit: Octokit;
}): AsyncGenerator<RepositoryStats, void, unknown> {
  const IS_EMPTY_FLAG = 'isEmpty';

  const iterator = await octokit.graphql.paginate.iterator(
    `query($login: String!, $pageSize: Int!, $endCursor: String) {
      organization(login: $login) {
        repositories(first: $pageSize, after: $endCursor, orderBy: {field: NAME, direction: ASC}) {
          totalDiskUsage
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
    }`,
    {
      login: org,
      pageSize: per_page,
    },
  );

  for await (const response of iterator) {
    const repos = response.organization.repositories.nodes;
    for (const repo of repos) {
      yield repo;
    }
  }
}
