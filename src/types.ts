// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LoggerFn = (message: string, meta?: any) => unknown;
export interface Logger {
  debug: LoggerFn;
  info: LoggerFn;
  warn: LoggerFn;
  error: LoggerFn;
}

export interface Arguments {
  accessToken?: string;
  baseUrl: string;
  orgName: string;
  outputPath: string | undefined;
  proxyUrl: string | undefined;
  skipArchived: boolean;
  verbose: boolean;
  appId?: string | undefined;
  privateKey?: string | undefined;
  privateKeyFile?: string | undefined;
  appInstallationId?: string | undefined;
  batchSize?: number;
  createBatchFiles?: boolean;
  maxRetryAttempts?: number;
  retryDelaySeconds?: number;
  pageSize?: number;
  extraPageSize?: number;
}

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
  Is_Empty?: boolean;
  Last_Push: string;
  Last_Update: string;
  isFork: boolean;
  isArchived: boolean;
  Disk_Size_kb: number;
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
  Migration_Issue?: boolean | null;
  Created?: string | null;
}
