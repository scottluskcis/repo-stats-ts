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
  maxRetryAttempts?: number;
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

  logger.debug('Getting batch file names...');
  let fileNames = await getBatchFileNames(batchFilesFolder);
  const maxAttempts = opts.maxRetryAttempts || 3;

  const results: ProcessingResult[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (fileNames.length === 0) {
      logger.info('No files to process.');
      break;
    }

    logger.info(
      `Processing batch files (Attempt ${attempt}/${maxAttempts})...`,
    );
    const result = await runRepoStatsForBatches({
      outputFolder: batchFilesFolder,
      logger,
      opts,
      appToken,
      processedFilesFolder,
      failedFilesFolder,
      fileNames,
    });

    results.push(result);

    if (result.filesToRetry.length === 0) {
      logger.info('All files processed successfully.');
      break;
    }

    if (attempt === maxAttempts) {
      logger.error(
        `Reached maximum number of retry attempts (${maxAttempts}). ${result.filesToRetry.length} files still need processing.`,
      );
      break;
    }

    logger.info(
      `Attempt ${attempt}: ${result.filesToRetry.length} files need to be retried.`,
    );
    fileNames = result.filesToRetry;
  }

  // Aggregate results
  const finalResults = results.reduce(
    (acc, curr) => ({
      successCount: acc.successCount + curr.successCount,
      failureCount: acc.failureCount + curr.failureCount,
      filesToRetry: curr.filesToRetry,
    }),
    { successCount: 0, failureCount: 0, filesToRetry: [] as string[] },
  );

  logger.info('Final processing results:');
  logger.info(`- Successfully processed: ${finalResults.successCount} files`);
  logger.info(`- Failed to process: ${finalResults.failureCount} files`);
  logger.info(
    `- Files requiring retry: ${finalResults.filesToRetry.length} files`,
  );
  logger.info(`- Total attempts made: ${results.length}`);

  logger.info('Stopping the application...');
}

interface ProcessingResult {
  successCount: number;
  failureCount: number;
  filesToRetry: string[];
}

async function runRepoStatsForBatches({
  outputFolder,
  logger,
  opts,
  appToken,
  processedFilesFolder,
  failedFilesFolder,
  fileNames,
}: {
  outputFolder: string;
  logger: Logger;
  opts: Arguments;
  appToken: string;
  processedFilesFolder: string;
  failedFilesFolder: string;
  fileNames: string[];
}): Promise<ProcessingResult> {
  if (!checkGhRepoStatsInstalled()) {
    logger.error('gh repo-stats is not installed. Please install it first.');
    return { successCount: 0, failureCount: 0, filesToRetry: [] };
  }

  logger.info('gh repo-stats is installed.');
  logger.info(`Found ${fileNames.length} batch files.`);

  let successCount = 0;
  let failureCount = 0;
  const filesToRetry: string[] = [];

  for (const fileName of fileNames) {
    const filePath = `${outputFolder}/${fileName}`;

    logger.info(`Processing file: ${fileName}`);
    const { success, error } = fileName.endsWith('batch_3.csv')
      ? { success: false, error: new Error('test case') }
      : await runRepoStats(filePath, opts.orgName, appToken, 5, 10);

    if (success) {
      logger.info(`Successfully processed file: ${fileName}`);
      moveFile(filePath, processedFilesFolder);
      successCount++;
    } else {
      logger.error(`Failed to process file: ${fileName}`);
      logger.error(`Error: ${error?.message}`);

      logger.debug('Identifying failed repos...');
      const retryFile = await handleFailedProcessing({
        filePath,
        fileName,
        orgName: opts.orgName,
        processedFilesFolder,
        outputFolder,
        failedFilesFolder,
        logger,
      });

      if (retryFile) {
        filesToRetry.push(retryFile);
      }
      failureCount++;
    }
  }

  const processed = await getProcessedRepos(opts.orgName);
  logger.info(`Processed repos: ${processed.length}`);

  return { successCount, failureCount, filesToRetry };
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
}): Promise<string | undefined> {
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

  let retryFileName: string | undefined;
  if (unprocessedRepos.length > 0) {
    retryFileName = await writeReposToRetryFile(
      unprocessedRepos,
      fileName,
      outputFolder,
    );
    logger.info(`Created retry file for ${fileName}`);
  }

  await moveFile(filePath, failedFilesFolder);
  logger.info(`Moved original file to failed files folder: ${fileName}`);

  return retryFileName;
}
