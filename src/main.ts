import { OctokitClient } from './service.js';
import { createOctokit } from './octokit.js';
import {
  Arguments,
  IssuesConnection,
  IssueStatsResult,
  Logger,
  PullRequestsConnection,
  PullRequestStatsResult,
  RepositoryStats,
  RepoStatsResult,
  ProcessedPageState,
  RepoProcessingResult,
} from './types.js';
import { createLogger, logInitialization } from './logger.js';
import { createAuthConfig } from './auth.js';
import { stringify } from 'csv-stringify/sync';
import { appendFileSync, existsSync, writeFileSync } from 'fs';
import { withRetry, RetryConfig } from './retry.js';
import {
  generateRepoStatsFileName,
  convertKbToMb,
  checkIfHasMigrationIssues,
  formatElapsedTime,
} from './utils.js';

const _init = async (
  opts: Arguments,
): Promise<{
  logger: Logger;
  client: OctokitClient;
}> => {
  const logger = createLogger(opts.verbose);
  logInitialization.start(logger);

  logInitialization.auth(logger);
  const authConfig = createAuthConfig({ ...opts, logger: logger });

  logInitialization.octokit(logger);
  const octokit = createOctokit(
    authConfig,
    opts.baseUrl,
    opts.proxyUrl,
    logger,
  );

  const client = new OctokitClient(octokit);

  return {
    logger,
    client,
  };
};

export async function run(opts: Arguments): Promise<void> {
  const { logger, client } = await _init(opts);
  const startTime = new Date();
  logger.info(`Started processing at: ${startTime.toISOString()}`);

  const processedState: ProcessedPageState = {
    cursor: null,
    processedRepos: new Set<string>(),
    lastSuccessfulCursor: null,
    lastProcessedRepo: null,
  };

  const retryConfig: RetryConfig = {
    maxAttempts: opts.retryMaxAttempts || 3,
    initialDelayMs: opts.retryInitialDelay || 1000,
    maxDelayMs: opts.retryMaxDelay || 30000,
    backoffFactor: opts.retryBackoffFactor || 2,
  };

  let retryCount = 0;

  await withRetry(
    async () => {
      const result = await processRepositories({
        client,
        logger,
        opts,
        processedState,
      });

      const endTime = new Date();
      const elapsedTime = formatElapsedTime(startTime, endTime);

      logger.info(
        `Completed processing ${result.processedCount} repositories. ` +
          `Last cursor: ${result.cursor}, ` +
          `Last repo: ${processedState.lastProcessedRepo}\n` +
          `Start time: ${startTime.toISOString()}\n` +
          `End time: ${endTime.toISOString()}\n` +
          `Total elapsed time: ${elapsedTime}\n` +
          `Total retry attempts: ${retryCount}`,
      );
      return result;
    },
    retryConfig,
    (state) => {
      retryCount++;
      logger.warn(
        `Retry attempt ${state.attempt}: Failed while processing repositories. ` +
          `Current cursor: ${processedState.cursor}, ` +
          `Last successful cursor: ${processedState.lastSuccessfulCursor}, ` +
          `Last processed repo: ${processedState.lastProcessedRepo}, ` +
          `Processed repos count: ${processedState.processedRepos.size}, ` +
          `Error: ${state.error?.message}\n` +
          `Elapsed time so far: ${formatElapsedTime(startTime, new Date())}`,
      );
    },
  );
}

async function processRepositories({
  client,
  logger,
  opts,
  processedState,
}: {
  client: OctokitClient;
  logger: Logger;
  opts: Arguments;
  processedState: ProcessedPageState;
}): Promise<RepoProcessingResult> {
  logger.debug(`Starting/Resuming from cursor: ${processedState.cursor}`);

  const reposIterator = client.getOrgRepoStats(
    opts.orgName,
    opts.pageSize || 10,
    processedState.cursor || processedState.lastSuccessfulCursor,
  );

  const fileName = generateRepoStatsFileName(opts.orgName);
  logger.info(`Results will be saved to file: ${fileName}`);

  let processedCount = 0;

  for await (const result of processRepoStats({
    reposIterator,
    client,
    logger,
    extraPageSize: opts.extraPageSize || 50,
    processedState,
  })) {
    try {
      // Skip if already processed in previous attempt
      if (processedState.processedRepos.has(result.Repo_Name)) {
        logger.debug(
          `Skipping already processed repository: ${result.Repo_Name}`,
        );
        continue;
      }

      await writeResultToCsv(result, fileName, logger);
      processedState.processedRepos.add(result.Repo_Name);
      processedState.lastProcessedRepo = result.Repo_Name;
      processedState.lastSuccessfulCursor = processedState.cursor;
      processedCount++;

      // Check rate limits after configured interval
      if (processedCount % (opts.rateLimitCheckInterval || 10) === 0) {
        const rateLimitReached = await checkAndHandleRateLimits({
          client,
          logger,
          processedCount,
        });

        if (rateLimitReached) {
          throw new Error(
            'Rate limit reached. Processing will be paused until limits reset.',
          );
        }
      }
    } catch (error) {
      logger.error(`Failed processing repo ${result.Repo_Name}: ${error}`);
      // On error, restore cursor to last successful position
      processedState.cursor = processedState.lastSuccessfulCursor;
      throw error;
    }
  }

  return {
    cursor: processedState.lastSuccessfulCursor,
    processedRepos: processedState.processedRepos,
    processedCount,
    isComplete: true,
  };
}

async function* processRepoStats({
  reposIterator,
  client,
  logger,
  extraPageSize,
  processedState,
}: {
  reposIterator: AsyncGenerator<RepositoryStats, void, unknown>;
  client: OctokitClient;
  logger: Logger;
  extraPageSize: number;
  processedState: ProcessedPageState;
}): AsyncGenerator<RepoStatsResult> {
  for await (const repo of reposIterator) {
    // Update cursor from repo's pageInfo
    if (repo.pageInfo?.endCursor) {
      processedState.cursor = repo.pageInfo.endCursor;
      logger.debug(`Updated cursor to: ${processedState.cursor}`);
    }

    // Run issue and PR analysis concurrently
    const [issueStats, prStats] = await Promise.all([
      analyzeIssues({
        owner: repo.owner.login,
        repo: repo.name,
        per_page: extraPageSize,
        issues: repo.issues,
        client,
        logger,
      }),
      analyzePullRequests({
        owner: repo.owner.login,
        repo: repo.name,
        per_page: extraPageSize,
        pullRequests: repo.pullRequests,
        client,
        logger,
      }),
    ]);

    const result = mapToRepoStatsResult(
      repo,
      issueStats,
      prStats,
      repo.owner.login,
    );
    yield result;
  }
}

async function checkAndHandleRateLimits({
  client,
  logger,
  processedCount,
}: {
  client: OctokitClient;
  logger: Logger;
  processedCount: number;
}): Promise<boolean> {
  logger.debug(
    `Checking rate limits after processing ${processedCount} repositories`,
  );
  const rateLimits = await client.checkRateLimits();

  if (
    rateLimits.graphQLRemaining === 0 ||
    rateLimits.apiRemainingRequest === 0
  ) {
    const limitType =
      rateLimits.graphQLRemaining === 0 ? 'GraphQL' : 'REST API';
    logger.warn(
      `${limitType} rate limit reached after processing ${processedCount} repositories`,
    );

    if (rateLimits.messageType === 'error') {
      logger.error(rateLimits.message);
      throw new Error(
        `${limitType} rate limit exceeded and maximum retries reached`,
      );
    }

    logger.warn(rateLimits.message);
    logger.info(`GraphQL remaining: ${rateLimits.graphQLRemaining}`);
    logger.info(`REST API remaining: ${rateLimits.apiRemainingRequest}`);

    return true; // indicates rate limit was reached
  } else {
    logger.info(
      `GraphQL remaining: ${rateLimits.graphQLRemaining}, REST API remaining: ${rateLimits.apiRemainingRequest}`,
    );
  }

  return false; // indicates rate limit was not reached
}

async function writeResultToCsv(
  result: RepoStatsResult,
  fileName: string,
  logger: Logger,
): Promise<void> {
  try {
    const isNewFile = !existsSync(fileName);

    // Define columns in specific order matching mapToRepoStatsResult
    const columns = [
      'Org_Name',
      'Repo_Name',
      'Is_Empty',
      'Last_Push',
      'Last_Update',
      'isFork',
      'isArchived',
      'Disk_Size_kb',
      'Repo_Size_mb',
      'Record_Count',
      'Collaborator_Count',
      'Protected_Branch_Count',
      'PR_Review_Count',
      'PR_Review_Comment_Count',
      'Commit_Comment_Count',
      'Milestone_Count',
      'PR_Count',
      'Project_Count',
      'Branch_Count',
      'Release_Count',
      'Issue_Count',
      'Issue_Event_Count',
      'Issue_Comment_Count',
      'Tag_Count',
      'Discussion_Count',
      'Has_Wiki',
      'Full_URL',
      'Migration_Issue',
      'Created',
    ];

    if (isNewFile) {
      logger.info(`Creating new CSV file: ${fileName}`);
      // Write header for new files
      const headerRow = stringify([columns], { header: false });
      writeFileSync(fileName, headerRow);
    }

    // Always append the data row
    const csvRow = stringify([result], {
      header: false,
      columns: columns,
    });
    appendFileSync(fileName, csvRow);

    logger.debug(
      `Successfully wrote result for repository: ${result.Repo_Name}`,
    );
  } catch (error) {
    logger.error(
      `Failed to write CSV for repository ${result.Repo_Name}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    throw error;
  }
}

function mapToRepoStatsResult(
  repo: RepositoryStats,
  issueStats: IssueStatsResult,
  prStats: PullRequestStatsResult,
  orgName: string,
): RepoStatsResult {
  const repoSizeMb = convertKbToMb(repo.diskUsage);
  const totalRecordCount = calculateRecordCount(repo, issueStats, prStats);
  const hasMigrationIssues = checkIfHasMigrationIssues({
    repoSizeMb,
    totalRecordCount,
  });
  return {
    Org_Name: orgName,
    Repo_Name: repo.name,
    Is_Empty: repo.isEmpty,
    Last_Push: repo.pushedAt,
    Last_Update: repo.updatedAt,
    isFork: repo.isFork,
    isArchived: repo.isArchived,
    Disk_Size_kb: repo.diskUsage,
    Repo_Size_mb: repoSizeMb,
    Record_Count: totalRecordCount,
    Collaborator_Count: repo.collaborators.totalCount,
    Protected_Branch_Count: repo.branchProtectionRules.totalCount,
    PR_Review_Count: repo.pullRequests.totalCount,
    PR_Review_Comment_Count: prStats.prReviewCommentCount,
    Commit_Comment_Count: repo.commitComments.totalCount,
    Milestone_Count: repo.milestones.totalCount,
    PR_Count: repo.pullRequests.totalCount,
    Project_Count: repo.projects.totalCount,
    Branch_Count: repo.branches.totalCount,
    Release_Count: repo.releases.totalCount,
    Issue_Count: issueStats.totalIssuesCount,
    Issue_Event_Count: issueStats.issueEventCount,
    Issue_Comment_Count: issueStats.issueCommentCount,
    Tag_Count: repo.tags.totalCount,
    Discussion_Count: repo.discussions.totalCount,
    Has_Wiki: repo.hasWikiEnabled,
    Full_URL: repo.url,
    Migration_Issue: hasMigrationIssues,
    Created: repo.createdAt,
  };
}

function calculateRecordCount(
  repo: RepositoryStats,
  issueStats: IssueStatsResult,
  prStats: PullRequestStatsResult,
): number {
  const counts = [
    repo.collaborators.totalCount,
    repo.branchProtectionRules.totalCount,
    repo.pullRequests.totalCount,
    repo.milestones.totalCount,
    issueStats.totalIssuesCount,
    repo.pullRequests.totalCount,
    prStats.prReviewCommentCount,
    repo.commitComments.totalCount,
    issueStats.issueCommentCount,
    issueStats.issueEventCount,
    repo.releases.totalCount,
    repo.projects.totalCount,
  ];

  const allRecordCount = counts.reduce((sum, count) => sum + count, 0);
  return allRecordCount;
}

async function analyzeIssues({
  owner,
  repo,
  per_page,
  issues,
  client,
  logger,
}: {
  owner: string;
  repo: string;
  per_page: number;
  issues: IssuesConnection;
  client: OctokitClient;
  logger: Logger;
}): Promise<IssueStatsResult> {
  logger.debug(`Analyzing issues for repository: ${repo}`);

  if (issues.totalCount <= 0) {
    logger.debug(`No issues found for repository: ${repo}`);
    return {
      totalIssuesCount: 0,
      issueEventCount: 0,
      issueCommentCount: 0,
    };
  }

  const totalIssuesCount = issues.totalCount;

  // Initialize counts from first page of results
  const initialCounts = issues.nodes.reduce(
    (acc, issue) => ({
      comments: acc.comments + issue.comments.totalCount,
      timeline: acc.timeline + issue.timeline.totalCount,
    }),
    { comments: 0, timeline: 0 },
  );

  let issueCommentCount = initialCounts.comments;
  let issueEventCount = initialCounts.timeline - initialCounts.comments;

  // Process additional pages if they exist
  if (
    issues.totalCount > 0 &&
    issues.pageInfo.hasNextPage &&
    issues.pageInfo.endCursor != null
  ) {
    logger.debug(`More pages of issues found for repository: ${repo}`);
    const cursor = issues.pageInfo.endCursor;

    try {
      for await (const issue of client.getRepoIssues(
        owner,
        repo,
        per_page,
        cursor,
      )) {
        issueEventCount +=
          issue.timeline.totalCount - issue.comments.totalCount;
        issueCommentCount += issue.comments.totalCount;
      }
    } catch (error) {
      logger.error(
        `Error retrieving additional issues for ${owner}/${repo}. ` +
          `Consider reducing page size. Error: ${error}`,
        error,
      );
      throw error;
    }
  } else {
    logger.debug(`Gathered all issues from repository: ${repo}`);
  }

  return {
    totalIssuesCount,
    issueEventCount,
    issueCommentCount,
  };
}

async function analyzePullRequests({
  owner,
  repo,
  per_page,
  pullRequests,
  client,
  logger,
}: {
  owner: string;
  repo: string;
  per_page: number;
  pullRequests: PullRequestsConnection;
  client: OctokitClient;
  logger: Logger;
}): Promise<PullRequestStatsResult> {
  if (pullRequests.totalCount <= 0) {
    return {
      prReviewCommentCount: 0,
      commitCommentCount: 0,
      issueEventCount: 0,
      issueCommentCount: 0,
      prReviewCount: 0,
    };
  }

  let issueEventCount = 0;
  let issueCommentCount = 0;
  let prReviewCount = 0;
  let prReviewCommentCount = 0;
  let commitCommentCount = 0;

  // Process first page
  for (const pr of pullRequests.nodes) {
    const eventCount = pr.timeline.totalCount;
    const commentCount = pr.comments.totalCount;
    const reviewCount = pr.reviews.totalCount;
    const commitCount = pr.commits.totalCount;

    // Check for potential issues with event counts
    const redundantEventCount =
      commentCount + (commitCount > 250 ? 250 : commitCount);
    if (redundantEventCount > eventCount) {
      logger.warn(
        `Warning: More redundant events than timeline events for PR ${pr.number}!
         eventCount: ${eventCount}
         commentCount: ${commentCount}
         commitCount: ${commitCount}`,
      );
    }

    issueEventCount += eventCount - redundantEventCount;
    issueCommentCount += commentCount;
    prReviewCount += reviewCount;
    prReviewCommentCount += pr.reviews.nodes.reduce(
      (sum, review) => sum + review.comments.totalCount,
      0,
    );
    commitCommentCount += commitCount;
  }

  // Process additional pages if they exist
  if (
    pullRequests.totalCount > 0 &&
    pullRequests.pageInfo.hasNextPage &&
    pullRequests.pageInfo.endCursor != null
  ) {
    const cursor = pullRequests.pageInfo.endCursor;
    for await (const pr of client.getRepoPullRequests(
      owner,
      repo,
      per_page,
      cursor,
    )) {
      const eventCount = pr.timeline.totalCount;
      const commentCount = pr.comments.totalCount;
      const reviewCount = pr.reviews.totalCount;
      const commitCount = pr.commits.totalCount;

      const redundantEventCount =
        commentCount + (commitCount > 250 ? 250 : commitCount);
      if (redundantEventCount > eventCount) {
        logger.warn(
          `Warning: More redundant events than timeline events for PR ${pr.number}!
           eventCount: ${eventCount}
           commentCount: ${commentCount}
           commitCount: ${commitCount}`,
        );
      }

      issueEventCount += eventCount - redundantEventCount;
      issueCommentCount += commentCount;
      prReviewCount += reviewCount;
      prReviewCommentCount += pr.reviews.nodes.reduce(
        (sum, review) => sum + review.comments.totalCount,
        0,
      );
      commitCommentCount += commitCount;
    }
  }

  return {
    prReviewCommentCount,
    commitCommentCount,
    issueEventCount,
    issueCommentCount,
    prReviewCount,
  };
}
