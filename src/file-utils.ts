import { createReadStream } from 'fs';
import { writeFile, readdir, rename, mkdir } from 'fs/promises';
import { join } from 'path';
import { stringify } from 'csv-stringify';
import { parse } from '@fast-csv/parse';
import { Logger, RepositoryType } from './types';

export async function createBatchFiles({
  org,
  iterator,
  batchSize,
  outputFolder,
  logger,
}: {
  org: string;
  iterator: AsyncGenerator<RepositoryType, any, any>;
  batchSize: number;
  outputFolder: string;
  logger: Logger;
}) {
  let repoCount = 0;
  let batchCount = 0;
  let batch: any[] = [];

  const processBatch = async (currentBatch: any[]) => {
    if (currentBatch.length === 0) return;

    batchCount++;
    await writeReposToCsv(
      currentBatch,
      `${outputFolder}/${org}_repos_batch_${batchCount}.csv`,
    );

    const isFinalBatch = currentBatch.length < batchSize;
    logger.info(
      isFinalBatch
        ? `Processed final batch ${batchCount} (total repositories: ${repoCount})`
        : `Processed batch ${batchCount} (${repoCount} repositories so far)`,
    );
  };

  for await (const repo of iterator) {
    logger.debug(`Repo: ${repo.name}`);
    batch.push({
      name: repo.name,
      full_name: repo.full_name,
      created_at: repo.created_at,
      archived: repo.archived,
    });
    repoCount++;

    if (repoCount % batchSize === 0) {
      await processBatch(batch);
      batch = []; // Clear the batch
    }
  }

  // Handle remaining items in the final batch
  await processBatch(batch);

  logger.info(
    `Completed processing ${batchCount} batches (${repoCount} total repositories)`,
  );
}

async function writeReposToCsv(
  repos: RepositoryType[],
  outputPath: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    stringify(
      repos,
      { header: false, columns: ['name'] },
      async (err, output) => {
        if (err) {
          reject(err);
        } else {
          try {
            await writeFile(outputPath, output);
            resolve();
          } catch (writeError) {
            reject(writeError);
          }
        }
      },
    );
  });
}

export async function getBatchFileNames(
  outputFolder: string,
): Promise<string[]> {
  const files = await readdir(outputFolder);
  return files.filter((file) => file.endsWith('.csv'));
}

export async function readReposFromFile(filePath: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const repos: string[] = [];

    createReadStream(filePath)
      .pipe(parse({ headers: false }))
      .on('data', ([repoName]: string[]) => {
        if (repoName && repoName.trim()) {
          repos.push(repoName.trim());
        }
      })
      .on('error', (error) =>
        reject(new Error(`Failed to read repositories from file: ${error}`)),
      )
      .on('end', () => resolve(repos));
  });
}

export async function moveFile(
  filePath: string,
  destinationFolder: string,
): Promise<void> {
  try {
    const fileName = filePath.split('/').pop();
    if (!fileName) {
      throw new Error('Invalid file path');
    }

    // Split filename into name and extension
    const [name, extension] = fileName.split('.');

    // Create timestamp in format YYYYMMDD_HHmmss
    const timestamp = new Date()
      .toISOString()
      .replace(/[:-]/g, '')
      .replace(/\..+/, '')
      .replace('T', '_');

    // Create new filename with timestamp
    const newFileName = `${name}_${timestamp}.${extension}`;
    const destinationPath = join(destinationFolder, newFileName);

    await rename(filePath, destinationPath);
  } catch (error) {
    throw new Error(`Failed to move file: ${error}`);
  }
}

export async function ensureOutputDirectoriesExist(
  outputFolders: string[],
  logger: Logger,
): Promise<void> {
  for (const folder of outputFolders) {
    try {
      await mkdir(folder, { recursive: true });
      logger.debug(`Ensured output directory exists: ${folder}`);
    } catch (error) {
      logger.error(`Failed to create output directory: ${error}`);
      throw error;
    }
  }
}
