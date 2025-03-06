import { Octokit } from 'octokit';
import { createAuthConfig } from './auth';
import { createLogger } from './logger';
import { createOctokit } from './octokit';

interface Arguments {
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
}

export async function run(opts: Arguments): Promise<void> {
  const logger = createLogger(opts.verbose);
  logger.info('Starting the application...');

  logger.debug('Creating auth config from environment variables...');
  const authConfig = createAuthConfig({ ...opts, logger: logger });

  logger.debug('Creating octokit instance...');
  const octokit = createOctokit(
    authConfig,
    opts.baseUrl,
    opts.proxyUrl,
    logger,
  );

  logger.debug('Getting all repos for org...');
  const repos_iterator = getAllReposForOrg({
    org: opts.orgName,
    per_page: opts.batchSize || 100,
    octokit,
  });

  let repoCount = 0;
  let batchCount = 0;
  const batchSize = opts.batchSize || 100;

  for await (const repo of repos_iterator) {
    logger.debug(`Repo: ${repo}`);
    repoCount++;

    if (repoCount % batchSize === 0) {
      batchCount++;
      logger.info(
        `Processed batch ${batchCount} (${repoCount} repositories so far)`,
      );
    }
  }

  // Log final batch if there are remaining items
  if (repoCount % batchSize !== 0) {
    batchCount++;
    logger.info(
      `Processed final batch ${batchCount} (total repositories: ${repoCount})`,
    );
  }

  logger.debug('Finished getting all repos for org.');
  logger.info(
    `Completed processing ${batchCount} batches (${repoCount} total repositories)`,
  );
  logger.info('Stopping the application...');
}

const octokit_headers = {
  'X-GitHub-Api-Version': '2022-11-28',
};

// get the repos for the org
async function* getAllReposForOrg({
  org,
  per_page,
  octokit,
}: {
  org: string;
  per_page: number;
  octokit: Octokit;
}): AsyncGenerator<string> {
  const iterator = await octokit.paginate.iterator(
    octokit.rest.repos.listForOrg,
    {
      org,
      type: 'all',
      per_page: per_page,
      page: 1,
      headers: octokit_headers,
    },
  );

  for await (const { data: repos } of iterator) {
    for (const repo of repos) {
      yield repo.name;
    }
  }
}
