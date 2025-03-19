import {
  generateRepoStatsFileName,
  convertKbToMb,
  checkIfHasMigrationIssues,
  formatElapsedTime,
} from '../utils.js';

describe('Utils', () => {
  describe('generateRepoStatsFileName', () => {
    it('should generate a filename with the org name and current date', () => {
      const orgName = 'testorg';
      const filename = generateRepoStatsFileName(orgName);

      // Test that the filename follows the expected pattern
      expect(filename).toMatch(/^testorg-all_repos-\d{12}_ts\.csv$/);
    });
  });

  describe('convertKbToMb', () => {
    it('should convert KB to MB correctly', () => {
      expect(convertKbToMb(1024)).toBe(1);
      expect(convertKbToMb(2048)).toBe(2);
      expect(convertKbToMb(512)).toBe(0.5);
    });

    it('should handle null or undefined values', () => {
      expect(convertKbToMb(null)).toBe(0);
      expect(convertKbToMb(undefined)).toBe(0);
    });
  });

  describe('checkIfHasMigrationIssues', () => {
    it('should return true for very large repositories', () => {
      expect(
        checkIfHasMigrationIssues({ repoSizeMb: 1501, totalRecordCount: 100 }),
      ).toBe(true);
    });

    it('should return true for repositories with extremely high record counts', () => {
      expect(
        checkIfHasMigrationIssues({ repoSizeMb: 100, totalRecordCount: 60001 }),
      ).toBe(true);
    });

    it('should return false for small repositories', () => {
      expect(
        checkIfHasMigrationIssues({ repoSizeMb: 100, totalRecordCount: 100 }),
      ).toBe(false);
    });
  });

  describe('formatElapsedTime', () => {
    it('should format elapsed time correctly', () => {
      const start = new Date('2023-01-01T00:00:00Z');
      const end = new Date('2023-01-01T00:01:30Z'); // 1 minute 30 seconds later

      const formattedTime = formatElapsedTime(start, end);
      expect(formattedTime).toBe('0h 1m 30s');
    });
  });
});
