import { readFileSync, writeFileSync, existsSync } from 'fs';
import { Logger, ProcessedPageState } from './types.js';

const LAST_STATE_FILE = 'last_state.json';

export function saveLastState(state: ProcessedPageState, logger: Logger): void {
  try {
    writeFileSync(LAST_STATE_FILE, JSON.stringify(state, null, 2));
    logger.info(`Saved last state to ${LAST_STATE_FILE}`);
  } catch (error) {
    logger.error(`Failed to save last state: ${error}`);
  }
}

export function loadLastState(logger: Logger): ProcessedPageState | null {
  try {
    if (existsSync(LAST_STATE_FILE)) {
      const data = readFileSync(LAST_STATE_FILE, 'utf-8');
      logger.info(`Loaded last state from ${LAST_STATE_FILE}`);
      const parsedState = JSON.parse(data);

      // Validate processedRepos exists and is an array
      if (
        !parsedState.processedRepos ||
        !Array.isArray(parsedState.processedRepos)
      ) {
        logger.warn(
          'Invalid state file: processedRepos is missing or not an array',
        );
        parsedState.processedRepos = [];
      }

      // Ensure uniqueness while keeping as array
      parsedState.processedRepos = [...new Set(parsedState.processedRepos)];

      return {
        ...parsedState,
        cursor: parsedState.cursor || null,
        lastSuccessfulCursor: parsedState.lastSuccessfulCursor || null,
        lastProcessedRepo: parsedState.lastProcessedRepo || null,
        lastSuccessTimestamp: parsedState.lastSuccessTimestamp || null,
        completedSuccessfully: parsedState.completedSuccessfully || false,
      };
    }
  } catch (error) {
    logger.error(
      `Failed to load last state: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    logger.debug(
      `State file contents: ${
        existsSync(LAST_STATE_FILE)
          ? readFileSync(LAST_STATE_FILE, 'utf-8')
          : 'file not found'
      }`,
    );
  }
  return null;
}

export interface StateOptions {
  resumeFromLastSave?: boolean;
}

export function initializeState(
  logger: Logger,
  options: StateOptions = {},
): { processedState: ProcessedPageState; resumeFromLastState: boolean } {
  let processedState: ProcessedPageState = {
    cursor: null,
    processedRepos: [],
    lastSuccessfulCursor: null,
    lastProcessedRepo: null,
    lastSuccessTimestamp: null,
    completedSuccessfully: false,
    outputFileName: null,
  };

  let resumeFromLastState = false;
  if (existsSync(LAST_STATE_FILE)) {
    const lastState = loadLastState(logger);
    let isNewRun = false;
    if (lastState?.completedSuccessfully) {
      logger.info(
        'All repositories were previously processed successfully. Nothing to resume.',
      );
      isNewRun = true;
    }

    if (!isNewRun && options.resumeFromLastSave && lastState) {
      processedState = lastState;
      resumeFromLastState = true;
      logger.info(`Resuming from last state: ${JSON.stringify(lastState)}`);
    }
  }

  return { processedState, resumeFromLastState };
}
