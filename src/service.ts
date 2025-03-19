import { Octokit } from 'octokit';
import { components } from '@octokit/openapi-types';
import {
  AuthResponse,
  IssuesResponse,
  IssueStats,
  PullRequestNode,
  RateLimitCheck,
  RateLimitResponse,
  RateLimitResult,
  RepositoryStats,
} from './types.js';

type Repository = components['schemas']['repository'];

export class OctokitClient {
  private readonly octokit_headers = {
    'X-GitHub-Api-Version': '2022-11-28',
  };

  constructor(private readonly octokit: Octokit) {}

  async generateAppToken(): Promise<string> {
    const appToken = (await this.octokit.auth({
      type: 'installation',
    })) as AuthResponse;
    process.env.GH_TOKEN = appToken.token;
    return appToken.token;
  }

  async *listReposForOrg(
    org: string,
    per_page: number,
  ): AsyncGenerator<components['schemas']['repository'], void, unknown> {
    const iterator = this.octokit.paginate.iterator(
      this.octokit.rest.repos.listForOrg,
      {
        org,
        type: 'all',
        per_page: per_page,
        page: 1,
        headers: this.octokit_headers,
      },
    );

    for await (const { data: repos } of iterator) {
      for (const repo of repos) {
        yield repo as Repository;
      }
    }
  }

  // all repos in an org
  async *getOrgRepoStats(
    org: string,
    per_page: number,
    cursor: string | null = null,
  ): AsyncGenerator<RepositoryStats, void, unknown> {
    const query = `
      query orgRepoStats($login: String!, $pageSize: Int!, $cursor: String) {
        organization(login: $login) {
          repositories(first: $pageSize, after: $cursor, orderBy: {field: NAME, direction: ASC}) {
            pageInfo {
              endCursor
              hasNextPage
              startCursor
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

    const iterator = this.octokit.graphql.paginate.iterator(query, {
      login: org,
      pageSize: per_page,
      cursor,
    });

    for await (const response of iterator) {
      const repos = response.organization.repositories.nodes;
      const pageInfo = response.organization.repositories.pageInfo;

      for (const repo of repos) {
        yield { ...repo, pageInfo };
      }
    }
  }

  // individual repo stats
  async getRepoStats(
    owner: string,
    repo: string,
    per_page: number,
  ): Promise<RepositoryStats> {
    const query = `
      query repoStats($owner: String!, $name: String!, $pageSize: Int!) {
        repository(owner: $owner, name: $name) {
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
      }`;

    const response = await this.octokit.graphql<any>(query, {
      owner,
      name: repo,
      pageSize: per_page,
    });

    // Create a pageInfo object to maintain consistency with getOrgRepoStats
    const pageInfo = {
      endCursor: null,
      hasNextPage: false,
      startCursor: null,
    };

    return { ...response.repository, pageInfo };
  }

  async *getRepoIssues(
    owner: string,
    repo: string,
    per_page: number,
    cursor: string | null = null,
  ): AsyncGenerator<IssueStats, void, unknown> {
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

    const iterator = this.octokit.graphql.paginate.iterator<IssuesResponse>(
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

  async *getRepoPullRequests(
    owner: string,
    repo: string,
    per_page: number,
    cursor: string | null = null,
  ): AsyncGenerator<PullRequestNode, void, unknown> {
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

    const iterator = this.octokit.graphql.paginate.iterator(query, {
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

  async checkRateLimits(
    sleepSeconds = 60,
    maxRetries = 5,
  ): Promise<RateLimitResult> {
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
      const rateLimitCheck = await this.getRateLimitData();

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

        await new Promise((resolve) =>
          setTimeout(resolve, sleepSeconds * 1000),
        );
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

  private async getRateLimitData(): Promise<RateLimitCheck | null> {
    const response = await this.octokit.request('GET /rate_limit');
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
}
