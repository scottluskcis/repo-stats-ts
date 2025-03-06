import { execSync } from 'child_process';

export const checkGhRepoStatsInstalled = (): boolean => {
  try {
    const output = execSync('gh extension list', {
      env: process.env,
    }).toString();

    return (
      output.includes('gh repo-stats') &&
      output.includes('mona-actions/gh-repo-stats')
    );
  } catch (error) {
    return false;
  }
};

export function installRepoStatsExtension() {
  execSync('gh extension install mona-actions/gh-repo-stats', {
    env: process.env,
  });
}

export const runRepoStats = (
  file: string,
  orgName: string,
  accessToken: string,
  pageSize: number,
  extraPageSize: number,
): void => {
  execSync(
    `gh repo-stats \
       --org ${orgName} \
       --token ${accessToken} \
       --token-type app \
       --repo-list "${file}" \
       --output csv \
       --repo-page-size ${pageSize} \
       --extra-page-size ${extraPageSize} \
       --hostname github.com`,
    {
      stdio: 'inherit',
      env: process.env,
    },
  );
};
