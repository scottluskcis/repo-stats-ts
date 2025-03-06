import { config } from 'dotenv';
import { run } from './main';

// Load environment variables from .env file
config();

run({
  accessToken: process.env.ACCESS_TOKEN,
  baseUrl: process.env.BASE_URL || 'https://api.github.com',
  disableTelemetry: process.env.DISABLE_TELEMETRY === 'true',
  outputPath: process.env.OUTPUT_PATH,
  owner: process.env.OWNER || '',
  ownerType: process.env.OWNER_TYPE as any,
  proxyUrl: process.env.PROXY_URL,
  skipArchived: process.env.SKIP_ARCHIVED === 'true',
  skipUpdateCheck: process.env.SKIP_UPDATE_CHECK === 'true',
  verbose: process.env.VERBOSE === 'true',
  appId: process.env.APP_ID,
  privateKey: process.env.PRIVATE_KEY,
  appInstallationId: process.env.APP_INSTALLATION_ID,
}).catch((error) => {
  console.error('An error occurred:', error);
  process.exit(1);
});
