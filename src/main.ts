import { Octokit } from 'octokit';
import { createAuthConfig } from './auth';
import { createLogger } from './logger';
import { createOctokit, generateAppToken, listReposForOrg } from './octokit';
import { Logger } from './types';
import {
  createBatchFiles,
  ensureOutputDirectoriesExist,
  getBatchFileNames,
  moveFile,
  readReposFromFile,
  appendReposToRetryFile,
} from './file-utils';
import {
  checkGhRepoStatsInstalled,
  getProcessedRepos,
  runRepoStats,
} from './repo-stats';
import { get } from 'http';

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
): Promise<{
  logger: Logger;
  octokit: Octokit;
  appToken: string;
  batchFilesFolder: string;
  processedFilesFolder: string;
}> => {
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

  logger.debug('Generating ocotokit app token...');
  const appToken = await generateAppToken({ octokit });

  logger.debug('Ensuring output directories exist...');
  const batchFilesFolder = `${opts.outputPath || './'}/batch_files`;
  const processedFilesFolder = `${opts.outputPath || './'}/processed_files`;
  ensureOutputDirectoriesExist(
    [batchFilesFolder, processedFilesFolder],
    logger,
  );

  return { logger, octokit, appToken, batchFilesFolder, processedFilesFolder };
};

export async function run(opts: Arguments): Promise<void> {
  const { logger, octokit, appToken, batchFilesFolder, processedFilesFolder } =
    await _init(opts);

  logger.debug('Getting all repos for org...');
  const reposIterator = listReposForOrg({
    org: opts.orgName,
    per_page: opts.batchSize || 100,
    octokit,
  });

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
    processedFilesFolder,
  });

  logger.info('Stopping the application...');
}

async function identifyFailedRepos({
  filePath,
  orgName,
  outputPath,
  logger,
}: {
  filePath: string;
  orgName: string;
  outputPath?: string;
  logger: Logger;
}): Promise<void> {
  logger.info('Identifying repos that failed...');
  const to_process = await readReposFromFile(filePath);
  const processed_so_far = await getProcessedRepos(orgName);

  const unprocessedRepos = to_process.filter(
    (repo) => !processed_so_far.includes(repo),
  );

  if (unprocessedRepos.length > 0) {
    const retryFilePath = `${outputPath || './'}/items_to_retry.csv`;
    await appendReposToRetryFile(unprocessedRepos, retryFilePath);
    logger.info(`Appended ${unprocessedRepos.length} repos to retry file.`);
  }
}

async function runRepoStatsForBatches({
  outputFolder,
  logger,
  opts,
  appToken,
  processedFilesFolder,
}: {
  outputFolder: string;
  logger: Logger;
  opts: Arguments;
  appToken: string;
  processedFilesFolder: string;
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
    const { success, error, output } = await runRepoStats(
      filePath,
      opts.orgName,
      appToken,
      5,
      10,
    );

    if (success) {
      logger.info(`Successfully processed file: ${fileName}`);
      moveFile(filePath, processedFilesFolder);
    } else {
      logger.error(`Failed to process file: ${fileName}`);
      logger.error(`Error: ${error?.message}`);

      await identifyFailedRepos({
        filePath,
        orgName: opts.orgName,
        outputPath: opts.outputPath,
        logger,
      });
    }
  }

  const processed = await getProcessedRepos(opts.orgName);
  logger.info(`Processed repos: ${processed.length}`);
}
