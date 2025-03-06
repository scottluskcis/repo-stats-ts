import { Octokit } from 'octokit';
import { createAuthConfig } from './auth';
import { createLogger } from './logger';
import { createOctokit, listReposForOrg } from './octokit';
import { Logger } from './types';
import { createBatchFiles } from './batch-files';

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

const _init = (opts: Arguments): { logger: Logger; octokit: Octokit } => {
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

  return { logger, octokit };
};

export async function run(opts: Arguments): Promise<void> {
  const { logger, octokit } = _init(opts);

  logger.debug('Getting all repos for org...');
  const reposIterator = listReposForOrg({
    org: opts.orgName,
    per_page: opts.batchSize || 100,
    octokit,
  });

  logger.debug('Creating batch files...');
  await createBatchFiles({
    org: opts.orgName,
    iterator: reposIterator,
    batchSize: opts.batchSize || 100,
    outputFolder: `${opts.outputPath || './'}/batch_files`,
    logger,
  });

  logger.info('Stopping the application...');
}
