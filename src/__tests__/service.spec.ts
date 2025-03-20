import { Octokit } from 'octokit';
import { OctokitClient } from '../service.js';

// Setup mocks
jest.mock('octokit');

describe('OctokitClient', () => {
  // Mock Octokit instances and responses
  let mockOctokit: any;
  let client: OctokitClient;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create a more flexible mock structure using plain objects
    mockOctokit = {
      rest: {
        repos: {
          listForOrg: jest.fn(),
        },
      },
      auth: jest.fn(),
      graphql: jest.fn(),
      paginate: {
        iterator: jest.fn(),
      },
      request: jest.fn(),
    };
    
    // Add paginate to graphql mock
    mockOctokit.graphql.paginate = {
      iterator: jest.fn(),
    };

    // Create client with our mock
    client = new OctokitClient(mockOctokit as unknown as Octokit);
  });

  describe('generateAppToken', () => {
    it('should generate a valid token from GitHub app', async () => {
      // Arrange
      const mockToken = 'test-token-1234';
      const mockAuthResponse = {
        type: 'token',
        token: mockToken,
        tokenType: 'installation',
        expiresAt: '2025-03-21T00:00:00Z',
      };
      mockOctokit.auth.mockResolvedValue(mockAuthResponse);

      // Save original process.env.GH_TOKEN to restore later
      const originalToken = process.env.GH_TOKEN;

      try {
        // Act
        const result = await client.generateAppToken();

        // Assert
        expect(result).toBe(mockToken);
        expect(process.env.GH_TOKEN).toBe(mockToken);
        expect(mockOctokit.auth).toHaveBeenCalledWith({
          type: 'installation',
        });
      } finally {
        // Restore original env var
        process.env.GH_TOKEN = originalToken;
      }
    });

    it('should handle authentication errors', async () => {
      // Arrange
      const errorMessage = 'Authentication failed';
      mockOctokit.auth.mockRejectedValue(new Error(errorMessage));

      // Act & Assert
      await expect(client.generateAppToken()).rejects.toThrow(errorMessage);
    });
  });

  describe('listReposForOrg', () => {
    it('should yield repositories from paginated API results', async () => {
      // Arrange
      const mockRepos = [
        { name: 'repo1', id: 1 },
        { name: 'repo2', id: 2 },
      ];
      
      // Setup paginate iterator to return mock repos
      mockOctokit.paginate.iterator.mockReturnValue({
        async *[Symbol.asyncIterator]() {
          yield { data: mockRepos };
        },
      });

      // Act
      const result = [];
      for await (const repo of client.listReposForOrg('testorg', 10)) {
        result.push(repo);
      }

      // Assert
      expect(result).toEqual(mockRepos);
      expect(mockOctokit.paginate.iterator).toHaveBeenCalledWith(
        mockOctokit.rest.repos.listForOrg,
        {
          org: 'testorg',
          type: 'all',
          per_page: 10,
          page: 1,
          headers: {
            'X-GitHub-Api-Version': '2022-11-28',
          },
        }
      );
    });

    it('should handle empty response', async () => {
      // Arrange
      mockOctokit.paginate.iterator.mockReturnValue({
        async *[Symbol.asyncIterator]() {
          yield { data: [] };
        },
      });

      // Act
      const result = [];
      for await (const repo of client.listReposForOrg('testorg', 10)) {
        result.push(repo);
      }

      // Assert
      expect(result).toEqual([]);
    });

    it('should handle multiple pages of results', async () => {
      // Arrange
      const page1 = [{ name: 'repo1', id: 1 }];
      const page2 = [{ name: 'repo2', id: 2 }];
      
      mockOctokit.paginate.iterator.mockReturnValue({
        async *[Symbol.asyncIterator]() {
          yield { data: page1 };
          yield { data: page2 };
        },
      });

      // Act
      const result = [];
      for await (const repo of client.listReposForOrg('testorg', 10)) {
        result.push(repo);
      }

      // Assert
      expect(result).toEqual([...page1, ...page2]);
    });
  });

  describe('getOrgRepoStats', () => {
    it('should yield repository stats from GraphQL API', async () => {
      // Arrange
      const mockRepos = [
        { name: 'repo1', owner: { login: 'testorg' }, diskUsage: 1000 },
        { name: 'repo2', owner: { login: 'testorg' }, diskUsage: 2000 },
      ];
      
      const mockPageInfo = {
        endCursor: 'cursor123',
        hasNextPage: false,
        startCursor: 'start123',
      };
      
      mockOctokit.graphql.paginate.iterator.mockReturnValue({
        async *[Symbol.asyncIterator]() {
          yield {
            organization: {
              repositories: {
                nodes: mockRepos,
                pageInfo: mockPageInfo,
              },
            },
          };
        },
      });

      // Act
      const result = [];
      for await (const repo of client.getOrgRepoStats('testorg', 10)) {
        result.push(repo);
      }

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ ...mockRepos[0], pageInfo: mockPageInfo });
      expect(result[1]).toEqual({ ...mockRepos[1], pageInfo: mockPageInfo });
      expect(mockOctokit.graphql.paginate.iterator).toHaveBeenCalledWith(
        expect.any(String),
        {
          login: 'testorg',
          pageSize: 10,
          cursor: null,
        }
      );
    });

    it('should pass cursor when provided', async () => {
      // Arrange
      const cursor = 'testcursor123';
      mockOctokit.graphql.paginate.iterator.mockReturnValue({
        async *[Symbol.asyncIterator]() {
          yield {
            organization: {
              repositories: {
                nodes: [],
                pageInfo: {
                  endCursor: null,
                  hasNextPage: false,
                },
              },
            },
          };
        },
      });

      // Act
      for await (const _ of client.getOrgRepoStats('testorg', 10, cursor)) {
        // Just iterate to trigger the API call
      }

      // Assert
      expect(mockOctokit.graphql.paginate.iterator).toHaveBeenCalledWith(
        expect.any(String),
        {
          login: 'testorg',
          pageSize: 10,
          cursor,
        }
      );
    });
  });

  describe('getRepoStats', () => {
    it('should fetch repository stats for a single repo', async () => {
      // Arrange
      const mockRepoResponse = {
        repository: {
          name: 'testrepo',
          owner: { login: 'testorg' },
          diskUsage: 1000,
          branches: { totalCount: 5 },
          issues: {
            totalCount: 10,
            nodes: [],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      };
      
      mockOctokit.graphql.mockResolvedValue(mockRepoResponse);

      // Act
      const result = await client.getRepoStats('testorg', 'testrepo', 10);

      // Assert
      expect(result).toEqual({
        ...mockRepoResponse.repository,
        pageInfo: {
          endCursor: null,
          hasNextPage: false,
          startCursor: null,
        },
      });
      expect(mockOctokit.graphql).toHaveBeenCalledWith(
        expect.any(String),
        {
          owner: 'testorg',
          name: 'testrepo',
          pageSize: 10,
        }
      );
    });

    it('should handle GraphQL errors', async () => {
      // Arrange
      const errorMessage = 'GraphQL error: Resource not found';
      mockOctokit.graphql.mockRejectedValue(new Error(errorMessage));

      // Act & Assert
      await expect(client.getRepoStats('testorg', 'nonexistent', 10))
        .rejects.toThrow(errorMessage);
    });
  });

  describe('getRepoIssues', () => {
    it('should yield issues from paginated results', async () => {
      // Arrange
      const mockIssues = [
        { comments: { totalCount: 5 }, timeline: { totalCount: 10 } },
        { comments: { totalCount: 2 }, timeline: { totalCount: 7 } },
      ];
      
      mockOctokit.graphql.paginate.iterator.mockReturnValue({
        async *[Symbol.asyncIterator]() {
          yield {
            repository: {
              issues: {
                nodes: mockIssues,
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          };
        },
      });

      // Act
      const result = [];
      for await (const issue of client.getRepoIssues('testorg', 'testrepo', 10)) {
        result.push(issue);
      }

      // Assert
      expect(result).toEqual(mockIssues);
      expect(mockOctokit.graphql.paginate.iterator).toHaveBeenCalledWith(
        expect.any(String),
        {
          owner: 'testorg',
          repo: 'testrepo',
          pageSize: 10,
          cursor: null,
        }
      );
    });
  });

  describe('getRepoPullRequests', () => {
    it('should yield pull requests from paginated results', async () => {
      // Arrange
      const mockPRs = [
        { 
          number: 1, 
          comments: { totalCount: 5 }, 
          commits: { totalCount: 3 },
          timeline: { totalCount: 10 },
          reviews: { totalCount: 2, nodes: [] },
        },
        { 
          number: 2, 
          comments: { totalCount: 7 }, 
          commits: { totalCount: 5 },
          timeline: { totalCount: 15 },
          reviews: { totalCount: 3, nodes: [] },
        },
      ];
      
      mockOctokit.graphql.paginate.iterator.mockReturnValue({
        async *[Symbol.asyncIterator]() {
          yield {
            repository: {
              pullRequests: {
                nodes: mockPRs,
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          };
        },
      });

      // Act
      const result = [];
      for await (const pr of client.getRepoPullRequests('testorg', 'testrepo', 10)) {
        result.push(pr);
      }

      // Assert
      expect(result).toEqual(mockPRs);
      expect(mockOctokit.graphql.paginate.iterator).toHaveBeenCalledWith(
        expect.any(String),
        {
          owner: 'testorg',
          repo: 'testrepo',
          pageSize: 10,
          cursor: null,
        }
      );
    });
  });

  describe('checkRateLimits', () => {
    it('should return rate limit information when available', async () => {
      // Arrange
      mockOctokit.request.mockResolvedValue({
        data: {
          resources: {
            core: { remaining: 5000 },
            graphql: { remaining: 5000 },
          },
        },
        headers: {},
        status: 200,
        url: 'https://api.github.com/rate_limit',
        retryCount: 0
      });

      // Act
      const result = await client.checkRateLimits();

      // Assert
      expect(result.apiRemainingRequest).toBe(5000);
      expect(result.graphQLRemaining).toBe(5000);
      expect(result.messageType).toBe('info');
      expect(result.message).toContain('Rate limits remaining');
    });

    it('should handle low rate limits', async () => {
      // Arrange
      mockOctokit.request.mockResolvedValue({
        data: {
          resources: {
            core: { remaining: 100 },
            graphql: { remaining: 0 }, // No GraphQL calls remaining
          },
        },
        headers: {},
        status: 200,
        url: 'https://api.github.com/rate_limit',
        retryCount: 0
      });

      jest.spyOn(global, 'setTimeout').mockImplementation((cb: any) => {
        cb();
        return {} as any;
      });

      // Act
      const result = await client.checkRateLimits(1, 1);

      // Assert
      expect(result.graphQLRemaining).toBe(0);
      expect(result.messageType).toBe('warning');
      expect(result.message).toContain('We have run out of GraphQL calls and need to sleep');
    });

    it('should handle rate limit APIs being disabled', async () => {
      // Arrange
      mockOctokit.request.mockResolvedValue({
        data: {
          message: 'Rate limiting is not enabled.',
        },
        headers: {},
        status: 200,
        url: 'https://api.github.com/rate_limit',
        retryCount: 0
      });

      // Act
      const result = await client.checkRateLimits();

      // Assert
      expect(result.graphQLRemaining).toBe(9999999999);
      expect(result.apiRemainingRequest).toBe(9999999999);
      expect(result.message).toBe('API rate limiting is not enabled.');
    });

    it('should handle errors in rate limit API', async () => {
      // Arrange
      mockOctokit.request.mockRejectedValue(new Error('API error'));

      // Act
      const result = await client.checkRateLimits();

      // Assert
      expect(result.messageType).toBe('error');
      expect(result.message).toBe('API error');
    });

    it('should return error when max retries exceeded', async () => {
      // Arrange
      mockOctokit.request.mockResolvedValue({
        data: {
          resources: {
            core: { remaining: 100 },
            graphql: { remaining: 0 }, // No GraphQL calls remaining
          },
        },
        headers: {},
        status: 200,
        url: 'https://api.github.com/rate_limit',
        retryCount: 0
      });

      // Mock setTimeout to skip waiting
      const mockSetTimeout = jest.spyOn(global, 'setTimeout').mockImplementation((cb: any) => {
        cb();
        return {} as any;
      });

      // Act
      await client.checkRateLimits(1, 1); // 1ms sleep, 1 max retry
      
      // We need to call it a second time to exceed max retries
      mockSetTimeout.mockClear();
      const finalResult = await client.checkRateLimits(1, 1);

      // Assert
      expect(finalResult.messageType).toBe('warning');
      expect(finalResult.message).toContain('We have run out of GraphQL calls and need to sleep');
    });
  });
});