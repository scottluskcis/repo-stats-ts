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
