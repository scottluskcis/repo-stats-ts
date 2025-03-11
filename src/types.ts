// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LoggerFn = (message: string, meta?: any) => unknown;
export interface Logger {
  debug: LoggerFn;
  info: LoggerFn;
  warn: LoggerFn;
  error: LoggerFn;
}

export interface Arguments {
  // context
  orgName: string;

  // octokit
  baseUrl: string;
  proxyUrl: string | undefined;
  pageSize?: number;
  extraPageSize?: number;

  // logging
  verbose: boolean;

  // auth
  accessToken?: string;
  appId?: string | undefined;
  privateKey?: string | undefined;
  privateKeyFile?: string | undefined;
  appInstallationId?: string | undefined;

  // rate limit check
  rateLimitCheckInterval?: number;

  // retry - exponential backoff
  retryMaxAttempts?: number;
  retryInitialDelay?: number;
  retryMaxDelay?: number;
  retryBackoffFactor?: number;
  retrySuccessThreshold?: number;

  resumeFromLastSave?: boolean;
}

export type AuthResponse = {
  type: string;
  token: string;
  tokenType?: string;
};

export interface ProcessingSummary {
  initiallyProcessed: number;
  totalRetried: number;
  totalSuccess: number;
  totalFailures: number;
  remainingUnprocessed: number;
  totalAttempts: number;
}

export interface ProcessingResult {
  successCount: number;
  failureCount: number;
  filesToRetry: string[];
}

export interface IdentifyFailedReposResult {
  unprocessedRepos: string[];
  processedRepos: string[];
  totalRepos: number;
  countMatches: boolean;
}

export interface PageInfo {
  endCursor: string | null;
  hasNextPage: boolean;
}

export interface TotalCount {
  totalCount: number;
}

export interface TimelineItem {
  timeline: TotalCount;
  comments: TotalCount;
}

export interface IssuesConnection {
  totalCount: number;
  pageInfo: PageInfo;
  nodes: TimelineItem[];
}

export interface PullRequestReview {
  comments: TotalCount;
}

export interface PullRequestNode {
  comments: TotalCount;
  commits: TotalCount;
  number: number;
  reviews: {
    totalCount: number;
    pageInfo: PageInfo;
    nodes: PullRequestReview[];
  };
  timeline: TotalCount;
}

export interface PullRequestsConnection {
  totalCount: number;
  pageInfo: PageInfo;
  nodes: PullRequestNode[];
}

export interface RepositoryOwner {
  login: string;
}

export interface RepositoryStats {
  pageInfo: PageInfo;
  branches: TotalCount;
  branchProtectionRules: TotalCount;
  commitComments: TotalCount;
  collaborators: TotalCount;
  createdAt: string;
  diskUsage: number;
  discussions: TotalCount;
  hasWikiEnabled: boolean;
  isEmpty: boolean;
  isFork: boolean;
  isArchived: boolean;
  issues: IssuesConnection;
  milestones: TotalCount;
  name: string;
  owner: RepositoryOwner;
  projects: TotalCount;
  pullRequests: PullRequestsConnection;
  pushedAt: string;
  releases: TotalCount;
  tags: TotalCount;
  updatedAt: string;
  url: string;
}

export interface IssueStats {
  totalCount: number;
  timeline: {
    totalCount: number;
  };
  comments: {
    totalCount: number;
  };
}

export interface IssuesResponse {
  repository: {
    issues: {
      pageInfo: {
        endCursor: string;
        hasNextPage: boolean;
      };
      nodes: IssueStats[];
    };
  };
}

export interface PullRequestResponse {
  repository: {
    pullRequests: {
      pageInfo: {
        endCursor: string;
        hasNextPage: boolean;
      };
      nodes: PullRequestNode[];
    };
  };
}

export interface IssueStatsResult {
  totalIssuesCount: number;
  issueEventCount: number;
  issueCommentCount: number;
}

export interface PullRequestStatsResult {
  prReviewCommentCount: number;
  commitCommentCount: number;
  issueEventCount: number;
  issueCommentCount: number;
  prReviewCount: number;
}

export interface RepoStatsResult {
  Org_Name: string;
  Repo_Name: string;
  Is_Empty: boolean;
  Last_Push: string;
  Last_Update: string;
  isFork: boolean;
  isArchived: boolean;
  Repo_Size_mb: number;
  Record_Count: number;
  Collaborator_Count: number;
  Protected_Branch_Count: number;
  PR_Review_Count: number;
  Milestone_Count: number;
  Issue_Count: number;
  PR_Count: number;
  PR_Review_Comment_Count: number;
  Commit_Comment_Count: number;
  Issue_Comment_Count: number;
  Issue_Event_Count: number;
  Release_Count: number;
  Project_Count: number;
  Branch_Count: number;
  Tag_Count: number;
  Discussion_Count: number;
  Has_Wiki: boolean;
  Full_URL: string;
  Migration_Issue: boolean;
  Created: string;
}

export interface RateLimitCheck {
  graphQLRemaining: number;
  coreRemaining: number;
  message: string;
}

export interface RateLimitResponse {
  message?: string;
  resources?: {
    graphql: {
      remaining: number;
    };
    core: {
      remaining: number;
    };
  };
}

export interface RateLimitResult {
  apiRemainingRequest: number;
  apiRemainingMessage: string;
  graphQLRemaining: number;
  graphQLMessage: string;
  message: string;
  messageType: 'error' | 'info' | 'warning';
}

export interface RetryState {
  attempt: number;
  successCount: number;
  retryCount: number;
  lastProcessedRepo?: string | null;
  error?: Error;
}

export interface RetryableOperation<T> {
  execute: () => Promise<T>;
  onRetry?: (state: RetryState) => void;
  onSuccess?: (result: T) => void;
  shouldRetry?: (error: Error) => boolean;
}

export interface ProcessedPageState {
  completedSuccessfully: boolean;
  outputFileName: string | null;
  currentCursor: string | null;
  lastSuccessfulCursor: string | null;
  lastProcessedRepo: string | null;
  lastUpdated: string | null;
  processedRepos: string[];
}

export interface RepoProcessingResult {
  cursor: string | null;
  processedRepos: string[];
  processedCount: number;
  isComplete: boolean;
  successCount: number;
  retryCount: number;
}
