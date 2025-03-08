import { run } from './main.js';

import { config } from 'dotenv';
config();

run({
  accessToken: process.env.ACCESS_TOKEN,
  orgName: process.env.ORG_NAME || '',
  baseUrl: process.env.BASE_URL || 'https://api.github.com',
  outputPath: process.env.OUTPUT_PATH,
  proxyUrl: process.env.PROXY_URL,
  skipArchived: process.env.SKIP_ARCHIVED === 'true',
  verbose: process.env.VERBOSE === 'true',
  appId: process.env.APP_ID,
  privateKey: process.env.PRIVATE_KEY,
  privateKeyFile: process.env.PRIVATE_KEY_FILE,
  appInstallationId: process.env.APP_INSTALLATION_ID,
  batchSize: parseInt(process.env.BATCH_SIZE || '100', 10),
  createBatchFiles: process.env.CREATE_BATCH_FILES != 'false',
  maxRetryAttempts: parseInt(process.env.MAX_RETRY_ATTEMPTS || '3', 10),
  retryDelaySeconds: parseInt(process.env.RETRY_DELAY_SECONDS || '5', 10),
  pageSize: parseInt(process.env.PAGE_SIZE || '5', 10),
  extraPageSize: parseInt(process.env.EXTRA_PAGE_SIZE || '10', 10),
  rateLimitCheckInterval: parseInt(
    process.env.RATE_LIMIT_CHECK_INTERVAL || '60',
    10,
  ),
  retryMaxAttempts: parseInt(process.env.RETRY_MAX_ATTEMPTS || '3', 10),
  retryInitialDelayMs: parseInt(
    process.env.RETRY_INITIAL_DELAY_MS || '1000',
    10,
  ),
  retryMaxDelayMs: parseInt(process.env.RETRY_MAX_DELAY_MS || '30000', 10),
  retryBackoffFactor: parseFloat(process.env.RETRY_BACKOFF_FACTOR || '2'),
}).catch((error) => {
  console.error('An error occurred:', error);
  process.exit(1);
});
