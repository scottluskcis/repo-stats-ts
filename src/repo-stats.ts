import { execSync } from 'child_process';

export const checkGhRepoStatsInstalled = (): boolean => {
  try {
    const output = execSync('gh extension list').toString();
    return output.includes('gh repo-stats');
  } catch (error) {
    return false;
  }
};

export const runRepoStats = (
  file: string,
  orgName: string,
  accessToken: string,
  batchSize: number,
): void => {
  execSync(
    `gh repo-stats \
       -o ${orgName} \
       -t ${accessToken} \
       -y app \
       -rl "${file}" \
       -O csv \
       -p ${batchSize} \
       -H github.com`,
    {
      stdio: 'inherit',
      env: process.env,
    },
  );
};
