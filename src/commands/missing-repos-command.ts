import * as commander from 'commander';
import VERSION from '../version.js';
import { parseIntOption } from '../utils.js';
import { Arguments } from '../types.js';
import { checkForMissingRepos } from '../main.js';

const missingReposCommand = new commander.Command();
const { Option } = commander;

missingReposCommand
  .name('missing-repos')
  .description(
    'Identifies repositories that are part of an organization but not found in a specified file. Can be run after a call to repo-stats-command.',
  )
  .version(VERSION)
  .addOption(
    new Option(
      '-f, --output-file-name <file>',
      'Repo Stats File to check repos against',
    )
      .env('OUTPUT_FILE_NAME')
      .makeOptionMandatory(true),
  )
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
  .action(async (options: Arguments) => {
    console.log('Version:', VERSION);

    const result = await checkForMissingRepos({
      opts: options,
      processedFile: `${options.outputFileName}`,
    });

    const missing = result.missingRepos;
    if (missing.length > 0) {
      console.log('Missing Repositories:');
      missing.forEach((repo) => {
        console.log(`- ${repo}`);
      });
    } else {
      console.log('No missing repositories found.');
    }
  });

export default missingReposCommand;
