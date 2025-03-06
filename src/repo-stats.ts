import { spawn, ChildProcess } from 'child_process';
import { parse } from '@fast-csv/parse';
import { readdir } from 'fs/promises';
import { createReadStream } from 'fs';

interface SpawnResult {
  code: number;
  output: string;
}

async function spawnProcess(
  command: string,
  args: string[],
  options?: { shell?: boolean; stdio?: 'pipe' | 'inherit' },
): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const defaultOptions = {
      env: process.env,
      shell: options?.shell ?? false,
      stdio: options?.stdio ?? 'pipe',
    };

    const process_to_run = spawn(command, args, defaultOptions);
    let output = '';

    if (process_to_run.stdout) {
      process_to_run.stdout.on('data', (data) => {
        output += data.toString();
      });
    }

    process_to_run.on('close', (code) => {
      resolve({ code: code ?? 0, output });
    });

    process_to_run.on('error', (error) => {
      reject(error);
    });
  });
}

export async function checkGhRepoStatsInstalled(): Promise<boolean> {
  const result = await spawnProcess('gh', ['extension', 'list']);
  return (
    result.code === 0 &&
    result.output.includes('gh repo-stats') &&
    result.output.includes('mona-actions/gh-repo-stats')
  );
}

export async function installRepoStatsExtension(): Promise<void> {
  const result = await spawnProcess('gh', [
    'extension',
    'install',
    'mona-actions/gh-repo-stats',
  ]);

  if (result.code !== 0) {
    throw new Error(
      `Failed to install gh-repo-stats extension with code ${result.code}`,
    );
  }
}

export async function runRepoStats(
  file: string,
  orgName: string,
  accessToken: string,
  pageSize: number,
  extraPageSize: number,
): Promise<{
  success: boolean;
  output: string | undefined | null;
  error: Error | undefined | null;
}> {
  const command = `gh repo-stats \
    --org ${orgName} \
    --token ${accessToken} \
    --token-type app \
    --repo-list "${file}" \
    --output csv \
    --repo-page-size ${pageSize} \
    --extra-page-size ${extraPageSize} \
    --hostname github.com`;

  const result = await spawnProcess(command, [], {
    shell: true,
    stdio: 'inherit',
  });

  const success = result.code === 0;
  const output = result.output;
  const error =
    result.code !== 0
      ? new Error(`Failed to run repo-stats with code ${result.code}`)
      : null;

  return { success, output, error };
}

export async function getProcessedRepos(orgName: string): Promise<string[]> {
  const files = await readdir('.');
  const csvFile = files.find(
    (file) =>
      file.startsWith(`${orgName.toLowerCase()}-all_repos-`) &&
      file.endsWith('.csv'),
  );

  if (!csvFile) {
    throw new Error(`CSV file for organization ${orgName} not found`);
  }

  return new Promise((resolve, reject) => {
    const processedRepos: string[] = [];
    createReadStream(csvFile)
      .pipe(parse({ headers: true }))
      .on('data', (row) => {
        processedRepos.push(row.Repo_Name);
      })
      .on('end', () => {
        resolve(processedRepos);
      })
      .on('error', (error) => {
        reject(error);
      });
  });
}
