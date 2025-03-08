import * as winston from 'winston';
const { combine, timestamp, printf, colorize } = winston.format;

import { Logger, ProcessingSummary } from './types.js';

// TODO: Figure out how to make ESLint happy with this
// eslint-disable-next-line @typescript-eslint/restrict-template-expressions
const format = printf(({ level, message, timestamp, owner, repo }): string => {
  // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
  if (owner && repo) {
    return `${timestamp} ${level} [${owner}/${repo}]: ${message}`;
  } else {
    return `${timestamp} ${level}: ${message}`;
  }
});

const generateLoggerOptions = (verbose: boolean): winston.LoggerOptions => {
  return {
    format: combine(colorize(), timestamp(), format),
    transports: [
      new winston.transports.Console({ level: verbose ? 'debug' : 'info' }),
    ],
  };
};

export const createLogger = (verbose: boolean): Logger =>
  winston.createLogger(generateLoggerOptions(verbose));

export const logProcessingSummary = (
  summary: ProcessingSummary,
  logger: Logger,
): void => {
  logger.info('Processing Summary:');
  logger.info(`✓ Initially processed: ${summary.initiallyProcessed} files`);
  if (summary.totalRetried > 0) {
    logger.info(`✓ Successfully retried: ${summary.totalRetried} files`);
  }
  logger.info(`✓ Total successfully processed: ${summary.totalSuccess} files`);
  logger.info(
    `✗ Failed to process: ${summary.totalFailures} files that were attempted to be retried`,
  );
  if (summary.remainingUnprocessed > 0) {
    logger.warn(
      `⚠ Unprocessed files remaining: ${summary.remainingUnprocessed}`,
    );
  }
  logger.debug(`Total processing attempts: ${summary.totalAttempts}`);
  logger.info('Completed repo-stats-queue processing');
};

export const logBatchProcessing = {
  starting: (fileCount: number, logger: Logger): void => {
    logger.info(`Starting batch processing with ${fileCount} files`);
  },
  noFiles: (logger: Logger): void => {
    logger.info('No batch files found for processing');
  },
  attempt: (current: number, max: number, logger: Logger): void => {
    logger.info(`Processing attempt ${current} of ${max}`);
  },
  allSuccess: (logger: Logger): void => {
    logger.info('✓ All files processed successfully');
  },
  maxRetries: (max: number, remaining: number, logger: Logger): void => {
    logger.warn(
      `⚠ Maximum retry attempts (${max}) reached. ${remaining} files remain unprocessed`,
    );
  },
  scheduled: (count: number, logger: Logger): void => {
    logger.info(`⟳ ${count} files scheduled for retry in next attempt`);
  },
  total: (count: number, logger: Logger): void => {
    logger.info(`Total repositories processed: ${count}`);
  },
};

export const logInitialization = {
  start: (logger: Logger): void => {
    logger.info('Initializing repo-stats-queue application...');
  },
  auth: (logger: Logger): void => {
    logger.debug('Creating auth config...');
  },
  octokit: (logger: Logger): void => {
    logger.debug('Initializing octokit client...');
  },
  token: (logger: Logger): void => {
    logger.debug('Generating app token...');
  },
  directories: (logger: Logger): void => {
    logger.debug('Setting up output directories...');
  },
};
