import * as winston from 'winston';
import { mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { createLogger, logProcessingSummary, logBatchProcessing, logInitialization } from '../logger.js';
import { ProcessingSummary } from '../types.js';
import { createMockLogger } from './test-utils.js';

// Mock dependencies
jest.mock('fs', () => ({
  existsSync: jest.fn(),
}));

jest.mock('fs/promises', () => ({
  mkdir: jest.fn(),
}));

jest.mock('winston', () => {
  // Create mock functions for winston components
  const format = {
    combine: jest.fn().mockReturnValue('combinedFormat'),
    timestamp: jest.fn().mockReturnValue('timestampFormat'),
    printf: jest.fn().mockImplementation((fn) => fn),
    colorize: jest.fn().mockReturnValue('colorizeFormat'),
  };

  const mockTransport = jest.fn();
  const mockOnError = jest.fn();
  
  const mockLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    on: mockOnError,
  };

  return {
    format,
    createLogger: jest.fn().mockReturnValue(mockLogger),
    transports: {
      Console: mockTransport,
      File: mockTransport,
    },
  };
});

jest.mock('path', () => ({
  resolve: jest.fn().mockImplementation((...args) => args.join('/')),
}));

describe('Logger Module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (winston.createLogger as jest.Mock).mockReturnValue({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      on: jest.fn(),
    });
    (existsSync as jest.Mock).mockReturnValue(true);
    (mkdir as jest.Mock).mockResolvedValue(undefined);
    console.debug = jest.fn();
    console.error = jest.fn();
  });

  describe('createLogger', () => {
    it('should create a logger with default configuration in verbose mode', async () => {
      // Act
      const logger = await createLogger(true);

      // Assert
      expect(winston.createLogger).toHaveBeenCalled();
      expect(winston.transports.Console).toHaveBeenCalled();
      expect(winston.transports.File).toHaveBeenCalled();
      expect(logger).toBeDefined();
    });

    it('should create a logger with custom file name', async () => {
      // Act
      const logFileName = 'custom-log.log';
      await createLogger(false, logFileName);

      // Assert
      expect(winston.transports.File).toHaveBeenCalledWith(
        expect.objectContaining({
          filename: expect.stringContaining(logFileName),
        })
      );
    });

    it('should create logs directory if it does not exist', async () => {
      // Arrange
      (existsSync as jest.Mock).mockReturnValue(false);

      // Act
      await createLogger(false);

      // Assert
      expect(mkdir).toHaveBeenCalledWith(expect.any(String), { recursive: true });
    });

    it('should handle errors in logger setup', async () => {
      // Arrange
      const expectedError = new Error('Failed to create directory');
      (mkdir as jest.Mock).mockRejectedValue(expectedError);
      (existsSync as jest.Mock).mockReturnValue(false);

      // Act & Assert
      await expect(createLogger(false)).rejects.toThrow();
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Failed to setup logger'));
    });
  });

  describe('logProcessingSummary', () => {
    it('should log complete summary with all fields', () => {
      // Arrange
      const mockLogger = createMockLogger();
      const summary: ProcessingSummary = {
        initiallyProcessed: 10,
        totalRetried: 5,
        totalSuccess: 15,
        totalFailures: 2,
        remainingUnprocessed: 3,
        totalAttempts: 20,
      };

      // Act
      logProcessingSummary(summary, mockLogger);

      // Assert
      expect(mockLogger.info).toHaveBeenCalledWith('Processing Summary:');
      expect(mockLogger.info).toHaveBeenCalledWith('✓ Initially processed: 10 files');
      expect(mockLogger.info).toHaveBeenCalledWith('✓ Successfully retried: 5 files');
      expect(mockLogger.info).toHaveBeenCalledWith('✓ Total successfully processed: 15 files');
      expect(mockLogger.info).toHaveBeenCalledWith('✗ Failed to process: 2 files that were attempted to be retried');
      expect(mockLogger.warn).toHaveBeenCalledWith('⚠ Unprocessed files remaining: 3');
      expect(mockLogger.debug).toHaveBeenCalledWith('Total processing attempts: 20');
      expect(mockLogger.info).toHaveBeenCalledWith('Completed repo-stats-queue processing');
    });

    it('should not log retried info if totalRetried is 0', () => {
      // Arrange
      const mockLogger = createMockLogger();
      const summary: ProcessingSummary = {
        initiallyProcessed: 10,
        totalRetried: 0,
        totalSuccess: 10,
        totalFailures: 0,
        remainingUnprocessed: 0,
        totalAttempts: 10,
      };

      // Act
      logProcessingSummary(summary, mockLogger);

      // Assert
      expect(mockLogger.info).not.toHaveBeenCalledWith(expect.stringContaining('Successfully retried:'));
    });

    it('should not log unprocessed warning if remainingUnprocessed is 0', () => {
      // Arrange
      const mockLogger = createMockLogger();
      const summary: ProcessingSummary = {
        initiallyProcessed: 10,
        totalRetried: 5,
        totalSuccess: 15,
        totalFailures: 0,
        remainingUnprocessed: 0,
        totalAttempts: 15,
      };

      // Act
      logProcessingSummary(summary, mockLogger);

      // Assert
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });
  });

  describe('logBatchProcessing', () => {
    it('should log starting batch processing', () => {
      // Arrange
      const mockLogger = createMockLogger();
      const fileCount = 50;

      // Act
      logBatchProcessing.starting(fileCount, mockLogger);

      // Assert
      expect(mockLogger.info).toHaveBeenCalledWith(`Starting batch processing with ${fileCount} files`);
    });

    it('should log no files found', () => {
      // Arrange
      const mockLogger = createMockLogger();

      // Act
      logBatchProcessing.noFiles(mockLogger);

      // Assert
      expect(mockLogger.info).toHaveBeenCalledWith('No batch files found for processing');
    });

    it('should log processing attempt', () => {
      // Arrange
      const mockLogger = createMockLogger();
      const current = 2;
      const max = 5;

      // Act
      logBatchProcessing.attempt(current, max, mockLogger);

      // Assert
      expect(mockLogger.info).toHaveBeenCalledWith(`Processing attempt ${current} of ${max}`);
    });

    it('should log all files processed successfully', () => {
      // Arrange
      const mockLogger = createMockLogger();

      // Act
      logBatchProcessing.allSuccess(mockLogger);

      // Assert
      expect(mockLogger.info).toHaveBeenCalledWith('✓ All files processed successfully');
    });

    it('should log max retries reached', () => {
      // Arrange
      const mockLogger = createMockLogger();
      const max = 3;
      const remaining = 10;

      // Act
      logBatchProcessing.maxRetries(max, remaining, mockLogger);

      // Assert
      expect(mockLogger.warn).toHaveBeenCalledWith(`⚠ Maximum retry attempts (${max}) reached. ${remaining} files remain unprocessed`);
    });

    it('should log files scheduled for retry', () => {
      // Arrange
      const mockLogger = createMockLogger();
      const count = 5;

      // Act
      logBatchProcessing.scheduled(count, mockLogger);

      // Assert
      expect(mockLogger.info).toHaveBeenCalledWith(`⟳ ${count} files scheduled for retry in next attempt`);
    });

    it('should log total repositories processed', () => {
      // Arrange
      const mockLogger = createMockLogger();
      const count = 100;

      // Act
      logBatchProcessing.total(count, mockLogger);

      // Assert
      expect(mockLogger.info).toHaveBeenCalledWith(`Total repositories processed: ${count}`);
    });
  });

  describe('logInitialization', () => {
    it('should log all initialization steps', () => {
      // Arrange
      const mockLogger = createMockLogger();

      // Act
      logInitialization.start(mockLogger);
      logInitialization.auth(mockLogger);
      logInitialization.octokit(mockLogger);
      logInitialization.token(mockLogger);
      logInitialization.directories(mockLogger);

      // Assert
      expect(mockLogger.info).toHaveBeenCalledWith('Initializing repo-stats-queue application...');
      expect(mockLogger.debug).toHaveBeenCalledWith('Creating auth config...');
      expect(mockLogger.debug).toHaveBeenCalledWith('Initializing octokit client...');
      expect(mockLogger.debug).toHaveBeenCalledWith('Generating app token...');
      expect(mockLogger.debug).toHaveBeenCalledWith('Setting up output directories...');
    });
  });
});