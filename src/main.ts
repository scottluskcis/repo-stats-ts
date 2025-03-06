import { Octokit } from 'octokit';
import { createAuthConfig } from './auth';
import { createLogger } from './logger';
import { createOctokit, generateAppToken, listReposForOrg } from './octokit';
import { Logger } from './types';
import { createBatchFiles, getBatchFileNames } from './batch-files';
import { checkGhRepoStatsInstalled, runRepoStats } from './repo-stats';

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
  createBatchFiles?: boolean;
}

const _init = async (
  opts: Arguments,
): Promise<{ logger: Logger; octokit: Octokit; appToken: string }> => {
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

  const appToken = await generateAppToken({ octokit });

  return { logger, octokit, appToken };
};

export async function run(opts: Arguments): Promise<void> {
  const { logger, octokit, appToken } = await _init(opts);

  logger.debug('Getting all repos for org...');
  const reposIterator = listReposForOrg({
    org: opts.orgName,
    per_page: opts.batchSize || 100,
    octokit,
  });

  const batchFilesFolder = `${opts.outputPath || './'}/batch_files`;
  if (opts.createBatchFiles) {
    logger.debug('Creating batch files...');
    await createBatchFiles({
      org: opts.orgName,
      iterator: reposIterator,
      batchSize: opts.batchSize || 100,
      outputFolder: batchFilesFolder,
      logger,
    });
  }

  logger.debug('Processing all batch files...');
  await runRepoStatsForBatches({
    outputFolder: batchFilesFolder,
    logger,
    opts,
    appToken,
  });

  logger.info('Stopping the application...');
}

async function runRepoStatsForBatches({
  outputFolder,
  logger,
  opts,
  appToken,
}: {
  outputFolder: string;
  logger: Logger;
  opts: Arguments;
  appToken: string;
}): Promise<void> {
  if (!checkGhRepoStatsInstalled()) {
    logger.error('gh repo-stats is not installed. Please install it first.');
    return;
  } else {
    logger.info('gh repo-stats is installed.');
  }

  const fileNames = await getBatchFileNames(outputFolder);
  logger.info(`Found ${fileNames.length} batch files.`);

  for (const fileName of fileNames) {
    const filePath = `${outputFolder}/${fileName}`;

    logger.info(`Processing file: ${fileName}`);
    runRepoStats(filePath, opts.orgName, appToken, 5, 10);

    //const rows = await processBatchFile(filePath);
    //logger.info(`Processed ${rows.length} rows from ${fileName}.`);
    // You can do more with the rows here
  }
}
