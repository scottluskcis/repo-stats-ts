import { createAuthConfig } from './auth';
import { createLogger } from './logger';
import { createOctokit } from './octokit';

interface Arguments {
  accessToken?: string;
  baseUrl: string;
  disableTelemetry: boolean;
  outputPath: string | undefined;
  owner: string;
  ownerType: OwnerType;
  proxyUrl: string | undefined;
  skipArchived: boolean;
  skipUpdateCheck: boolean;
  verbose: boolean;
  appId?: string | undefined;
  privateKey?: string | undefined;
  privateKeyFile?: string | undefined;
  appInstallationId?: string | undefined;
}

enum OwnerType {
  Organization = 'organization',
  User = 'user',
}

export async function run(opts: Arguments): Promise<void> {
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

  logger.info('Stopping the application...');
}
