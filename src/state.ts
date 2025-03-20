import { readFileSync, writeFileSync, existsSync } from 'fs';
import { Logger, ProcessedPageState } from './types.js';

const LAST_STATE_FILE = 'last_known_state.json';

function saveLastState(state: ProcessedPageState, logger: Logger): void {
  try {
    writeFileSync(LAST_STATE_FILE, JSON.stringify(state, null, 2));
    logger.debug(`Saved last state to ${LAST_STATE_FILE}`);
  } catch (error) {
    logger.error(`Failed to save last state: ${error}`);
  }
}

function loadLastState(logger: Logger): ProcessedPageState | null {
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
        currentCursor: parsedState.currentCursor || null,
        lastSuccessfulCursor: parsedState.lastSuccessfulCursor || null,
        lastProcessedRepo: parsedState.lastProcessedRepo || null,
        lastUpdated: parsedState.lastSuccessTimestamp || null,
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

export function initializeState({
  resumeFromLastSave,
  logger,
}: {
  resumeFromLastSave?: boolean;
  logger: Logger;
}): { processedState: ProcessedPageState; resumeFromLastState: boolean } {
  let processedState: ProcessedPageState = {
    currentCursor: null,
    processedRepos: [],
    lastSuccessfulCursor: null,
    lastProcessedRepo: null,
    lastUpdated: null,
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

    if (!isNewRun && resumeFromLastSave && lastState) {
      processedState = lastState;
      resumeFromLastState = true;
      logger.info(
        `Resuming from last state that was last updated: ${lastState.lastUpdated}`,
      );
    }
  }

  return { processedState, resumeFromLastState };
}

export function updateState({
  state,
  repoName,
  newCursor,
  lastSuccessfulCursor,
  logger,
}: {
  state: ProcessedPageState;
  repoName?: string | null;
  newCursor?: string | null;
  lastSuccessfulCursor?: string | null;
  logger: Logger;
}): void {
  // Update cursor if provided and different from current
  if (newCursor && newCursor !== state.currentCursor) {
    state.currentCursor = newCursor;
    logger.debug(
      `Updated cursor to: ${state.currentCursor} for repo: ${repoName}`,
    );
  }

  // Update last successful cursor if provided
  if (lastSuccessfulCursor) {
    state.lastSuccessfulCursor = lastSuccessfulCursor;
  }

  // Add to processed repos if not already included
  if (repoName && !state.processedRepos.includes(repoName)) {
    state.processedRepos.push(repoName);
  }

  // Update last processed repo and timestamp
  if (repoName) {
    state.lastProcessedRepo = repoName;
  }
  state.lastUpdated = new Date().toISOString();

  // Save state after updates
  saveLastState(state, logger);
}
