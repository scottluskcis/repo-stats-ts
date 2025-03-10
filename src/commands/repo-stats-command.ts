import * as commander from 'commander';
import { parseFloatOption, parseIntOption } from '../utils.js';
import { Arguments } from '../types.js';
import VERSION from '../version.js';

import { run } from '../main.js';

const repoStatsCommand = new commander.Command();
const { Option } = commander;

repoStatsCommand
  .name('repo-stats')
  .description('Command to run repo-stats')
  .version(VERSION)
  .addOption(
    new Option(
      '-o, --org-name <org>',
      'The name of the organization to process',
    ).env('ORG_NAME'),
  )
  .addOption(
    new Option('-t, --access-token <token>', 'GitHub access token').env(
      'ACCESS_TOKEN',
    ),
  )
  .addOption(
    new Option('-u, --base-url <url>', 'GitHub API base URL')
      .env('BASE_URL')
      .default('https://api.github.com'),
  )
  .addOption(
    new Option('--proxy-url <url>', 'Proxy URL if required').env('PROXY_URL'),
  )
  .addOption(
    new Option('-v, --verbose', 'Enable verbose logging').env('VERBOSE'),
  )
  .addOption(new Option('--app-id <id>', 'GitHub App ID').env('APP_ID'))
  .addOption(
    new Option('--private-key <key>', 'GitHub App private key').env(
      'PRIVATE_KEY',
    ),
  )
  .addOption(
    new Option(
      '--private-key-file <file>',
      'Path to GitHub App private key file',
    ).env('PRIVATE_KEY_FILE'),
  )
  .addOption(
    new Option('--app-installation-id <id>', 'GitHub App installation ID').env(
      'APP_INSTALLATION_ID',
    ),
  )
  .addOption(
    new Option('--page-size <size>', 'Number of items per page')
      .env('PAGE_SIZE')
      .default('10')
      .argParser(parseIntOption),
  )
  .addOption(
    new Option('--extra-page-size <size>', 'Extra page size')
      .env('EXTRA_PAGE_SIZE')
      .default('50')
      .argParser(parseIntOption),
  )
  .addOption(
    new Option(
      '--rate-limit-check-interval <seconds>',
      'Interval for rate limit checks in seconds',
    )
      .env('RATE_LIMIT_CHECK_INTERVAL')
      .default('60')
      .argParser(parseIntOption),
  )
  .addOption(
    new Option(
      '--retry-max-attempts <attempts>',
      'Maximum number of retry attempts',
    )
      .env('RETRY_MAX_ATTEMPTS')
      .default('3')
      .argParser(parseIntOption),
  )
  .addOption(
    new Option(
      '--retry-initial-delay <milliseconds>',
      'Initial delay for retry in milliseconds',
    )
      .env('RETRY_INITIAL_DELAY')
      .default('1000')
      .argParser(parseIntOption),
  )
  .addOption(
    new Option(
      '--retry-max-delay <milliseconds>',
      'Maximum delay for retry in milliseconds',
    )
      .env('RETRY_MAX_DELAY')
      .default('30000')
      .argParser(parseIntOption),
  )
  .addOption(
    new Option(
      '--retry-backoff-factor <factor>',
      'Backoff factor for retry delays',
    )
      .env('RETRY_BACKOFF_FACTOR')
      .default('2')
      .argParser(parseFloatOption),
  )
  .addOption(
    new Option(
      '--retry-success-threshold <count>',
      'Number of successful operations before resetting retry count',
    )
      .env('RETRY_SUCCESS_THRESHOLD')
      .default('5')
      .argParser(parseIntOption),
  )
  .action(async (options: Arguments) => {
    console.log('Version:', VERSION);

    console.log('Starting repo-stats...');
    await run(options);
    console.log('Repo-stats completed.');
  });

export default repoStatsCommand;
