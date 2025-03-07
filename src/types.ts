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
