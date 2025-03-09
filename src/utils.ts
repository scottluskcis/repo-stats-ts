export function generateRepoStatsFileName(orgName: string): string {
  const timestamp = new Date()
    .toISOString()
    .replace(/[:\.]/g, '-')
    .replace('T', '_');
  return `${orgName.toLowerCase()}-repo-stats_${timestamp}.csv`;
}

export function convertKbToMb(valueInKb: number): number {
  if (!Number.isFinite(valueInKb)) {
    throw new Error(`Invalid input: ${valueInKb} is not a number`);
  }

  return Math.floor(valueInKb / 1024);
}

export function checkIfHasMigrationIssues({
  repoSizeMb,
  totalRecordCount,
}: {
  repoSizeMb: number;
  totalRecordCount: number;
}): boolean {
  if (totalRecordCount >= 60000) {
    return true;
  }
  if (repoSizeMb > 1500) {
    return true;
  }
  return false;
}

export function parseIntOption(value: string, defaultValue?: number): number {
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Invalid number: ${value}`);
  }
  return parsed;
}

export function parseFloatOption(value: string, defaultValue?: number): number {
  const parsed = parseFloat(value);
  if (isNaN(parsed)) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Invalid number: ${value}`);
  }
  return parsed;
}
