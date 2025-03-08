import { Octokit } from 'octokit/dist-types/octokit';
import {
  createOctokit,
  getOrgRepoStats,
  getRepoIssues,
  getRepoPullRequests,
} from './octokit';
import {
  Arguments,
  IssuesConnection,
  IssueStatsResult,
  Logger,
  PullRequestsConnection,
  PullRequestStatsResult,
  RepositoryStats,
  RepoStatsResult,
} from './types';
import { createLogger, logInitialization } from './logger';
import { createAuthConfig } from './auth';

const _init = async (
  opts: Arguments,
): Promise<{
  logger: Logger;
  octokit: Octokit;
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

  return {
    logger,
    octokit,
  };
};

export async function run(opts: Arguments): Promise<void> {
  const { logger, octokit } = await _init(opts);

  logger.debug('Fetching repositories for organization...');
  const reposIterator = getOrgRepoStats({
    org: opts.orgName,
    per_page: opts.pageSize || 100,
    octokit,
  });

  let count = 0;
  for await (const result of processRepoStats({
    reposIterator,
    octokit,
    logger,
    pageSize: opts.pageSize || 100,
  })) {
    logger.info(`Processed repository: ${result.Repo_Name}`);
    await writeResultToCsv(result, logger);
    count++;

    if (count > 30) {
      logger.info('Processed 30 repositories, stopping...');
      break;
    }
  }
}

async function* processRepoStats({
  reposIterator,
  octokit,
  logger,
  pageSize,
}: {
  reposIterator: AsyncGenerator<RepositoryStats, void, unknown>;
  octokit: Octokit;
  logger: Logger;
  pageSize: number;
}): AsyncGenerator<RepoStatsResult> {
  for await (const repo of reposIterator) {
    logger.info(`Processing repository: ${repo.name}`);

    // Run issue and PR analysis concurrently
    const [issueStats, prStats] = await Promise.all([
      analyzeIssues({
        owner: repo.owner.login,
        repo: repo.name,
        per_page: pageSize,
        issues: repo.issues,
        octokit: octokit,
        logger: logger,
      }),
      analyzePullRequests({
        owner: repo.owner.login,
        repo: repo.name,
        per_page: pageSize,
        pullRequests: repo.pullRequests,
        octokit: octokit,
        logger: logger,
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

async function writeResultToCsv(
  result: RepoStatsResult,
  logger: Logger,
): Promise<void> {
  // TODO: Implement CSV writing logic
  logger.debug(`Writing result for repository: ${result.Repo_Name}`);
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

function convertKbToMb(valueInKb: number): number {
  if (!Number.isFinite(valueInKb)) {
    throw new Error(`Invalid input: ${valueInKb} is not a number`);
  }

  return Math.floor(valueInKb / 1024);
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

function checkIfHasMigrationIssues({
  repoSizeMb,
  totalRecordCount,
}: {
  repoSizeMb: number;
  totalRecordCount: number;
}): boolean {
  if (totalRecordCount >= 60000) {
    return true;
  }
  if (repoSizeMb > 1500) {
    return true;
  }
  return false;
}

async function analyzeIssues({
  owner,
  repo,
  per_page,
  issues,
  octokit,
  logger,
}: {
  owner: string;
  repo: string;
  per_page: number;
  issues: IssuesConnection;
  octokit: Octokit;
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
      for await (const issue of getRepoIssues({
        owner,
        repo,
        per_page,
        octokit,
        cursor,
      })) {
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
  octokit,
  logger,
}: {
  owner: string;
  repo: string;
  per_page: number;
  pullRequests: PullRequestsConnection;
  octokit: Octokit;
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
    for await (const pr of getRepoPullRequests({
      owner,
      repo,
      per_page,
      octokit,
      cursor,
    })) {
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
