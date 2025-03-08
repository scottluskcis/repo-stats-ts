import { parse } from '@fast-csv/parse';
import { readdir } from 'fs/promises';
import { createReadStream } from 'fs';
import { Logger } from './types';
import { execa } from 'execa';
import { parse as parseCommand } from 'shell-quote';

interface SpawnResult {
  code: number | undefined;
  output: string;
}

// uses execa Library This is a modern, Promise-based library that handles process execution much more reliably
async function spawnProcess(
  command: string,
  args: string[],
  options?: { shell?: boolean; stdio?: 'pipe' | 'inherit'; logger?: Logger },
): Promise<SpawnResult> {
  try {
    const { stdout, stderr, exitCode } = await execa(command, args, {
      shell: options?.shell ?? false,
      env: process.env,
      reject: true, // Will reject on non-zero exit codes
    });

    // Log output in real-time
    if (stdout) {
      options?.logger?.debug(stdout);
    }
    if (stderr) {
      options?.logger?.error(stderr);
    }

    return {
      code: exitCode,
      output: stdout + (stderr ? `\n${stderr}` : ''),
    };
  } catch (error) {
    if (error instanceof Error) {
      options?.logger?.error(`Process failed: ${error.message}`);
      throw error;
    }
    throw new Error('Unknown error occurred during process execution');
  }
}

// uses approach: node-shell-quote with execa For more complex shell commands that need proper escaping
async function executeCommand(
  commandString: string,
  options?: { logger?: Logger },
): Promise<SpawnResult> {
  const parsed = parseCommand(commandString);
  const [command, ...args] = parsed.filter(
    (arg) => typeof arg === 'string',
  ) as string[];

  try {
    const { stdout, stderr, exitCode } = await execa(command, args, {
      shell: true,
      env: process.env,
      reject: true,
    });

    options?.logger?.debug(stdout);
    if (stderr) options?.logger?.error(stderr);

    return {
      code: exitCode,
      output: stdout + (stderr ? `\n${stderr}` : ''),
    };
  } catch (error) {
    if (error instanceof Error) {
      options?.logger?.error(`Command failed: ${error.message}`);
      throw error;
    }
    throw new Error('Unknown error occurred during command execution');
  }
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
  logger?: Logger, // Add logger parameter
): Promise<{
  success: boolean;
  output: string | undefined | null;
  error: Error | undefined | null;
}> {
  // let dots = '';
  // const progressInterval = setInterval(() => {
  //   dots = dots.length >= 3 ? '' : dots + '.';
  //   logger?.info(`Processing ${file} ${dots}`);
  // }, 1000);

  const command = `gh repo-stats \
    --org ${orgName} \
    --token ${accessToken} \
    --token-type app \
    --repo-list "${file}" \
    --output csv \
    --repo-page-size ${pageSize} \
    --extra-page-size ${extraPageSize} \
    --hostname github.com`;

  try {
    const result = await spawnProcess(command, [], {
      shell: true,
      stdio: 'pipe',
      logger,
    });

    //clearInterval(progressInterval);

    if (result.code !== 0) {
      return {
        success: false,
        output: result.output,
        error: new Error(
          `Failed to run repo-stats with code ${result.code}: ${result.output}`,
        ),
      };
    }

    return {
      success: true,
      output: result.output,
      error: null,
    };
  } catch (error) {
    //clearInterval(progressInterval);
    return {
      success: false,
      output: null,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
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
