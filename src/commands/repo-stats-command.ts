import * as commander from 'commander';

const command = new commander.Command();
const { Option } = commander;

command
  .name('repo-stats')
  .description('Command to run repo-stats')
  .version('1.0.0')
  .addOption(
    new Option('-o, --org <org>', 'The name of the organization to process'),
  )
  .action(async (options) => {
    const { org } = options;
    if (!org) {
      console.error('Error: Organization name is required.');
      process.exit(1);
    }
    console.log(`Running repo-stats for organization: ${org}`);
  });

export default command;
