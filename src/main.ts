import { Octokit } from 'octokit';
import {
  createLogger,
  logProcessingSummary,
  logBatchProcessing,
  logInitialization,
} from './logger';
import { createAuthConfig } from './auth';
import {
  createOctokit,
  generateAppToken,
  listReposForOrg,
  RepositoryType,
} from './octokit';
import {
  Logger,
  Arguments,
  ProcessingSummary,
  ProcessingResult,
  IdentifyFailedReposResult,
} from './types';
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

  logInitialization.token(logger);
  const appToken = await generateAppToken({ octokit });

  logInitialization.directories(logger);
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

const sleep = (seconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, seconds * 1000));

async function processRepositoryBatches(
  fileNames: string[],
  maxAttempts: number,
  params: {
    batchFilesFolder: string;
    logger: Logger;
    opts: Arguments;
    appToken: string;
    processedFilesFolder: string;
    failedFilesFolder: string;
  },
): Promise<ProcessingSummary> {
  const results: ProcessingResult[] = [];
  let totalRetried = 0;
  let currentFileNames = [...fileNames];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    logBatchProcessing.attempt(attempt, maxAttempts, params.logger);

    if (attempt > 1) {
      const delaySeconds = params.opts.retryDelaySeconds || 5;
      params.logger.info(
        `Waiting ${delaySeconds} seconds before retry attempt ${attempt}...`,
      );
      await sleep(delaySeconds);
    }

    const result = await runRepoStatsForBatches({
      outputFolder: params.batchFilesFolder,
      logger: params.logger,
      opts: params.opts,
      appToken: params.appToken,
      processedFilesFolder: params.processedFilesFolder,
      failedFilesFolder: params.failedFilesFolder,
      fileNames: currentFileNames,
    });

    results.push(result);
    if (attempt > 1) {
      totalRetried += result.successCount;
    }

    if (result.filesToRetry.length === 0) {
      logBatchProcessing.allSuccess(params.logger);
      break;
    }

    if (attempt === maxAttempts) {
      logBatchProcessing.maxRetries(
        maxAttempts,
        result.filesToRetry.length,
        params.logger,
      );
      break;
    }

    logBatchProcessing.scheduled(result.filesToRetry.length, params.logger);
    currentFileNames = result.filesToRetry;
  }

  const finalResults = calculateFinalResults(results);

  return {
    initiallyProcessed: results[0]?.successCount || 0,
    totalRetried,
    totalSuccess: finalResults.successCount,
    totalFailures: finalResults.failureCount,
    remainingUnprocessed: finalResults.filesToRetry.length,
    totalAttempts: results.length,
  };
}

function calculateFinalResults(results: ProcessingResult[]): ProcessingResult {
  return results.reduce(
    (acc, curr) => ({
      successCount: acc.successCount + curr.successCount,
      failureCount: acc.failureCount + curr.failureCount,
      filesToRetry: curr.filesToRetry,
    }),
    { successCount: 0, failureCount: 0, filesToRetry: [] as string[] },
  );
}

async function createInitialBatchFiles(params: {
  opts: Arguments;
  logger: Logger;
  reposIterator: AsyncGenerator<RepositoryType, void, unknown>;
  batchFilesFolder: string;
}): Promise<void> {
  if (params.opts.createBatchFiles) {
    params.logger.info('Creating batch files for processing...');
    await createBatchFiles({
      org: params.opts.orgName,
      iterator: params.reposIterator,
      batchSize: params.opts.batchSize || 100,
      outputFolder: params.batchFilesFolder,
      logger: params.logger,
    });
  }
}

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

  await createInitialBatchFiles({
    opts,
    logger,
    reposIterator,
    batchFilesFolder,
  });

  logger.debug('Reading batch files...');
  const fileNames = await getBatchFileNames(batchFilesFolder);
  const maxAttempts = opts.maxRetryAttempts || 3;

  if (fileNames.length === 0) {
    logBatchProcessing.noFiles(logger);
    return;
  }

  logBatchProcessing.starting(fileNames.length, logger);
  const summary = await processRepositoryBatches(fileNames, maxAttempts, {
    batchFilesFolder,
    logger,
    opts,
    appToken,
    processedFilesFolder,
    failedFilesFolder,
  });

  logProcessingSummary(summary, logger);
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

    const { success, error } = await runRepoStats(
      filePath,
      opts.orgName,
      appToken,
      opts.pageSize || 5,
      opts.extraPageSize || 10,
      logger,
    );

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
}): Promise<IdentifyFailedReposResult> {
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
