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
  logger.info('Initializing repo-stats-queue application...');

  logger.debug('Creating auth config...');
  const authConfig = createAuthConfig({ ...opts, logger: logger });

  logger.debug('Initializing octokit client...');
  const octokit = createOctokit(
    authConfig,
    opts.baseUrl,
    opts.proxyUrl,
    logger,
  );

  logger.debug('Generating app token...');
  const appToken = await generateAppToken({ octokit });

  logger.debug('Setting up output directories...');
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

  logger.debug('Fetching repositories for organization...');
  const reposIterator = listReposForOrg({
    org: opts.orgName,
    per_page: opts.batchSize || 100,
    octokit,
  });

  if (opts.createBatchFiles) {
    logger.info('Creating batch files for processing...');
    await createBatchFiles({
      org: opts.orgName,
      iterator: reposIterator,
      batchSize: opts.batchSize || 100,
      outputFolder: batchFilesFolder,
      logger,
    });
  }

  logger.debug('Reading batch files...');
  let fileNames = await getBatchFileNames(batchFilesFolder);
  const maxAttempts = opts.maxRetryAttempts || 3;

  if (fileNames.length === 0) {
    logger.info('No batch files found for processing');
    return;
  }

  logger.info(`Starting batch processing with ${fileNames.length} files`);
  const results: ProcessingResult[] = [];
  let totalRetried = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    logger.info(`Processing attempt ${attempt} of ${maxAttempts}`);

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
    if (attempt > 1) {
      totalRetried += result.successCount;
    }

    if (result.filesToRetry.length === 0) {
      logger.info('✓ All files processed successfully');
      break;
    }

    if (attempt === maxAttempts) {
      logger.warn(
        `⚠ Maximum retry attempts (${maxAttempts}) reached. ${result.filesToRetry.length} files remain unprocessed`,
      );
      break;
    }

    logger.info(
      `⟳ ${result.filesToRetry.length} files scheduled for retry in next attempt`,
    );
    fileNames = result.filesToRetry;
  }

  const finalResults = results.reduce(
    (acc, curr) => ({
      successCount: acc.successCount + curr.successCount,
      failureCount: acc.failureCount + curr.failureCount,
      filesToRetry: curr.filesToRetry,
    }),
    { successCount: 0, failureCount: 0, filesToRetry: [] as string[] },
  );

  logger.info('Processing Summary:');
  logger.info(`✓ Initially processed: ${results[0]?.successCount || 0} files`);
  if (totalRetried > 0) {
    logger.info(`✓ Successfully retried: ${totalRetried} files`);
  }
  logger.info(
    `✓ Total successfully processed: ${finalResults.successCount} files`,
  );
  logger.info(
    `✗ Failed to process: ${finalResults.failureCount} files that were attempted to be retried`,
  );
  if (finalResults.filesToRetry.length > 0) {
    logger.warn(
      `⚠ Unprocessed files remaining: ${finalResults.filesToRetry.length}`,
    );
  }
  logger.debug(`Total processing attempts: ${results.length}`);
  logger.info('Completed repo-stats-queue processing');
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
    logger.error(
      '❌ gh repo-stats tool not found. Please install it before proceeding',
    );
    return { successCount: 0, failureCount: 0, filesToRetry: [] };
  }

  logger.debug('gh repo-stats tool verification completed');
  logger.info(`Processing ${fileNames.length} batch files`);

  let successCount = 0;
  let failureCount = 0;
  const filesToRetry: string[] = [];

  for (const fileName of fileNames) {
    const filePath = `${outputFolder}/${fileName}`;
    logger.debug(`Processing batch file: ${fileName}`);

    const { success, error } = fileName.endsWith('batch_3.csv')
      ? { success: false, error: new Error('test case') }
      : await runRepoStats(filePath, opts.orgName, appToken, 5, 10);

    if (success) {
      logger.debug(`✓ Batch file processed: ${fileName}`);
      moveFile(filePath, processedFilesFolder);
      successCount++;
    } else {
      logger.error(`✗ Failed to process batch file: ${fileName}`, error);
      logger.debug('Identifying unprocessed repositories...');

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
  logger.info(`Total repositories processed: ${processed.length}`);

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
    logger.debug(`Created processed repos file for ${fileName}`);
  }

  let retryFileName: string | undefined;
  if (unprocessedRepos.length > 0) {
    retryFileName = await writeReposToRetryFile(
      unprocessedRepos,
      fileName,
      outputFolder,
    );
    logger.debug(`Created retry file for ${fileName}`);
  }

  await moveFile(filePath, failedFilesFolder);
  logger.debug(`Moved original file to failed files folder: ${fileName}`);

  return retryFileName;
}
