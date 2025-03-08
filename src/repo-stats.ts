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
  Logger,
  PullRequestsConnection,
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
    per_page: 10, // opts.pageSize || 100,
    octokit,
  });

  const repo_stats: RepoStatsResult[] = [];

  let count = 0;
  for await (const repo of reposIterator) {
    logger.info(`Processing repository: ${repo.name}`);
    count++;

    // analyze issue details
    const issueStats = await analyzeIssues({
      owner: repo.owner.login,
      repo: repo.name,
      per_page: opts.pageSize || 100,
      issues: repo.issues,
      octokit: octokit,
      logger: logger,
    });

    // analyze pull request details
    const prStats = await analyzePullRequests({
      owner: repo.owner.login,
      repo: repo.name,
      per_page: opts.pageSize || 100,
      pullRequests: repo.pullRequests,
      octokit: octokit,
      logger: logger,
    });

    // map to object that will be sent to output
    repo_stats.push(
      mapToRepoStatsResult(repo, issueStats, prStats, opts.orgName),
    );

    if (count > 30) {
      logger.info('Processed 100 repositories, stopping...');
      break;
    }
  }
}

function mapToRepoStatsResult(
  repo: RepositoryStats,
  issueStats: {
    totalIssuesCount: number;
    issueEventCount: number;
    issueCommentCount: number;
  },
  prStats: {
    prReviewCommentCount: number;
    commitCommentCount: number;
  },
  orgName: string,
): RepoStatsResult {
  return {
    Org_Name: orgName,
    Repo_Name: repo.name,
    Is_Empty: repo.isEmpty,
    Last_Push: repo.pushedAt,
    Last_Update: repo.updatedAt,
    isFork: repo.isFork,
    isArchived: repo.isArchived,
    Disk_Size_kb: repo.diskUsage,
    Repo_Size_mb: convertKbToMb(repo.diskUsage),
    Record_Count: calculateRecordCount(repo),
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
    Migration_Issue: null, // analyze
    Created: repo.createdAt,
  };
}

function convertKbToMb(valueInKb: number): number {
  if (!Number.isFinite(valueInKb)) {
    throw new Error(`Invalid input: ${valueInKb} is not a number`);
  }

  return Math.floor(valueInKb / 1024);
}

function calculateRecordCount(repo: RepositoryStats): number {
  // Placeholder for record count calculation logic
  return 0;
}

async function analyzeIssues({
  owner,
  repo,
  per_page,
  issues,
  octokit,
  logger, // Add logger parameter
}: {
  owner: string;
  repo: string;
  per_page: number;
  issues: IssuesConnection;
  octokit: Octokit;
  logger: Logger;
}): Promise<{
  totalIssuesCount: number;
  issueEventCount: number;
  issueCommentCount: number;
}> {
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
}): Promise<{
  prReviewCommentCount: number;
  commitCommentCount: number;
  issueEventCount: number;
  issueCommentCount: number;
  prReviewCount: number;
}> {
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
         EVENT_CT: ${eventCount}
         COMMENT_CT: ${commentCount}
         COMMIT_CT: ${commitCount}`,
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
           EVENT_CT: ${eventCount}
           COMMENT_CT: ${commentCount}
           COMMIT_CT: ${commitCount}`,
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
