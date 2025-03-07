import { Octokit } from 'octokit/dist-types/octokit';
import { createOctokit, getOrgRepoStats, getRepoIssues } from './octokit';
import {
  Arguments,
  IssuesConnection,
  Logger,
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
    });

    // analyze pull request details

    // map to object that wil be sent to output
    repo_stats.push(mapToRepoStatsResult(repo, issueStats, opts.orgName));

    if (count > 100) {
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
    Repo_Size_mb: convertKbToMb(repo.diskUsage),
    Record_Count: calculateRecordCount(repo),
    Collaborator_Count: repo.collaborators.totalCount,
    Protected_Branch_Count: repo.branchProtectionRules.totalCount,
    PR_Review_Count: 0, // analyze PRs
    Commit_Comment_Count: repo.commitComments.totalCount,
    Milestone_Count: repo.milestones.totalCount,
    PR_Count: repo.pullRequests.totalCount,
    PR_Review_Comment_Count: 0, // analyze PR reviews
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
}: {
  owner: string;
  repo: string;
  per_page: number;
  issues: IssuesConnection;
  octokit: Octokit;
}): Promise<{
  totalIssuesCount: number;
  issueEventCount: number;
  issueCommentCount: number;
}> {
  if (issues.totalCount <= 0) {
    return { totalIssuesCount: 0, issueEventCount: 0, issueCommentCount: 0 };
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
    const cursor = issues.pageInfo.endCursor;
    for await (const issue of getRepoIssues({
      owner,
      repo,
      per_page,
      octokit,
      cursor,
    })) {
      issueEventCount += issue.timeline.totalCount - issue.comments.totalCount;
      issueCommentCount += issue.comments.totalCount;
    }
  }

  return { totalIssuesCount, issueEventCount, issueCommentCount };
}
