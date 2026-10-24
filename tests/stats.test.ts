import { describe, it, expect } from 'vitest';
import { maintenanceStatus, QUIET_AFTER_DAYS } from '../src/lib/stats';

const NOW = new Date('2026-10-25T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString().slice(0, 10);

describe('maintenanceStatus', () => {
  it('is archived whenever the upstream repository is archived', () => {
    expect(maintenanceStatus({ stars: 1, archived: true, pushedAt: daysAgo(1) }, NOW)).toBe('archived');
    expect(maintenanceStatus({ stars: 1, archived: true }, NOW)).toBe('archived');
  });

  it('is active within the quiet threshold and quiet after it', () => {
    expect(maintenanceStatus({ stars: 1, archived: false, pushedAt: daysAgo(10) }, NOW)).toBe('active');
    expect(maintenanceStatus({ stars: 1, pushedAt: daysAgo(QUIET_AFTER_DAYS - 1) }, NOW)).toBe('active');
    expect(maintenanceStatus({ stars: 1, pushedAt: daysAgo(QUIET_AFTER_DAYS + 2) }, NOW)).toBe('quiet');
  });

  it('is null until the nightly sync has recorded the repository', () => {
    expect(maintenanceStatus(undefined, NOW)).toBeNull();
    expect(maintenanceStatus({ stars: 12 }, NOW)).toBeNull();
    expect(maintenanceStatus({ stars: 12, pushedAt: 'not-a-date' }, NOW)).toBeNull();
  });
});
