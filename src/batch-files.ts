import { writeFileSync } from 'fs';
import { mkdir } from 'fs/promises';
import { stringify } from 'csv-stringify';
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
  // Ensure output directory exists
  try {
    await mkdir(outputFolder, { recursive: true });
    logger.debug(`Ensured output directory exists: ${outputFolder}`);
  } catch (error) {
    logger.error(`Failed to create output directory: ${error}`);
    throw error;
  }

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
    logger.debug(`Repo: ${repo}`);
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
  append: boolean = false,
): Promise<void> {
  const columns: (keyof RepositoryType)[] = [
    'name',
    'full_name',
    'created_at',
    'archived',
  ];

  return new Promise((resolve, reject) => {
    stringify(repos, { header: !append, columns: columns }, (err, output) => {
      if (err) {
        reject(err);
      } else {
        writeFileSync(outputPath, output);
        resolve();
      }
    });
  });
}
