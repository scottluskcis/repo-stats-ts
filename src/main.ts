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
  writeReposToProcessedFile,
  writeReposToRetryFile,
} from './file-utils';
import {
  checkGhRepoStatsInstalled,
  getProcessedRepos,
  runRepoStats,
} from './repo-stats';

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
  failedFilesFolder: string;
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
  const failedFilesFolder = `${opts.outputPath || './'}/failed_files`;

  ensureOutputDirectoriesExist(
    [batchFilesFolder, processedFilesFolder, failedFilesFolder],
    logger,
  );

  return {
    logger,
    octokit,
    appToken,
    batchFilesFolder,
    processedFilesFolder,
    failedFilesFolder,
  };
};

export async function run(opts: Arguments): Promise<void> {
  const {
    logger,
    octokit,
    appToken,
    batchFilesFolder,
    processedFilesFolder,
    failedFilesFolder,
  } = await _init(opts);

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
    failedFilesFolder,
  });

  logger.info('Stopping the application...');
}

async function runRepoStatsForBatches({
  outputFolder,
  logger,
  opts,
  appToken,
  processedFilesFolder,
  failedFilesFolder,
}: {
  outputFolder: string;
  logger: Logger;
  opts: Arguments;
  appToken: string;
  processedFilesFolder: string;
  failedFilesFolder: string;
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
    const { success, error } = fileName.endsWith('batch_3.csv')
      ? { success: false, error: new Error('test case') }
      : await runRepoStats(filePath, opts.orgName, appToken, 5, 10);

    if (success) {
      logger.info(`Successfully processed file: ${fileName}`);
      moveFile(filePath, processedFilesFolder);
    } else {
      logger.error(`Failed to process file: ${fileName}`);
      logger.error(`Error: ${error?.message}`);

      logger.debug('Identifying failed repos...');
      await handleFailedProcessing({
        filePath,
        fileName,
        orgName: opts.orgName,
        processedFilesFolder,
        outputFolder,
        failedFilesFolder,
        logger,
      });
    }
  }

  const processed = await getProcessedRepos(opts.orgName);
  logger.info(`Processed repos: ${processed.length}`);
}

async function identifyFailedRepos({
  filePath,
  orgName,
}: {
  filePath: string;
  orgName: string;
}): Promise<{
  unprocessedRepos: string[];
  processedRepos: string[];
  totalRepos: number;
  countMatches: boolean;
}> {
  const to_process = await readReposFromFile(filePath);
  const processed_so_far = await getProcessedRepos(orgName);

  const unprocessedRepos = to_process.filter(
    (repo) => !processed_so_far.includes(repo),
  );

  const processedRepos = to_process.filter((repo) =>
    processed_so_far.includes(repo),
  );

  const totalRepos = unprocessedRepos.length + processedRepos.length;
  const countMatches = totalRepos === to_process.length;

  return { unprocessedRepos, processedRepos, totalRepos, countMatches };
}

async function handleFailedProcessing({
  filePath,
  fileName,
  orgName,
  processedFilesFolder,
  outputFolder,
  failedFilesFolder,
  logger,
}: {
  filePath: string;
  fileName: string;
  orgName: string;
  processedFilesFolder: string;
  outputFolder: string;
  failedFilesFolder: string;
  logger: Logger;
}): Promise<void> {
  const { processedRepos, unprocessedRepos } = await identifyFailedRepos({
    filePath,
    orgName,
  });

  if (processedRepos.length > 0) {
    await writeReposToProcessedFile(
      processedRepos,
      fileName,
      processedFilesFolder,
    );
    logger.info(`Created processed repos file for ${fileName}`);
  }

  if (unprocessedRepos.length > 0) {
    await writeReposToRetryFile(unprocessedRepos, fileName, outputFolder);
    logger.info(`Created retry file for ${fileName}`);
  }

  await moveFile(filePath, failedFilesFolder);
  logger.info(`Moved original file to failed files folder: ${fileName}`);
}
