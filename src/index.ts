import { config } from 'dotenv';
import { run } from './main';

// Load environment variables from .env file
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
}).catch((error) => {
  console.error('An error occurred:', error);
  process.exit(1);
});
