import { config } from 'dotenv';
config();

import * as commander from 'commander';

import VERSION from './version.js';
import repoStatsCommand from './commands/repo-stats-command.js';

const program = new commander.Command();

program
  .description(
    'Fetches and processes repository statistics from GitHub organizations',
  )
  .version(VERSION)
  .addCommand(repoStatsCommand);

program.parse(process.argv);
