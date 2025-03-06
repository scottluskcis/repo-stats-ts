import { spawn } from 'child_process';

export const checkGhRepoStatsInstalled = (): Promise<boolean> => {
  return new Promise((resolve, reject) => {
    const process_to_run = spawn('gh', ['extension', 'list'], {
      env: process.env,
    });

    let output = '';

    process_to_run.stdout.on('data', (data) => {
      output += data.toString();
    });

    process_to_run.on('close', (code) => {
      if (code === 0) {
        resolve(
          output.includes('gh repo-stats') &&
            output.includes('mona-actions/gh-repo-stats'),
        );
      } else {
        resolve(false);
      }
    });

    process_to_run.on('error', (error) => {
      reject(error);
    });
  });
};

export function installRepoStatsExtension(): Promise<void> {
  return new Promise((resolve, reject) => {
    const process_to_run = spawn(
      'gh',
      ['extension', 'install', 'mona-actions/gh-repo-stats'],
      {
        env: process.env,
      },
    );

    process_to_run.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `Failed to install gh-repo-stats extension with code ${code}`,
          ),
        );
      }
    });

    process_to_run.on('error', (error) => {
      reject(error);
    });
  });
}

export const runRepoStats = (
  file: string,
  orgName: string,
  accessToken: string,
  pageSize: number,
  extraPageSize: number,
): Promise<void> => {
  return new Promise((resolve, reject) => {
    const command = `gh repo-stats \
      --org ${orgName} \
      --token ${accessToken} \
      --token-type app \
      --repo-list "${file}" \
      --output csv \
      --repo-page-size ${pageSize} \
      --extra-page-size ${extraPageSize} \
      --hostname github.com`;

    const process_to_run = spawn(command, {
      shell: true,
      stdio: 'inherit',
      env: process.env,
    });

    process_to_run.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Failed to run repo-stats with code ${code}`));
      }
    });

    process_to_run.on('error', (error) => {
      reject(error);
    });
  });
};
