import repoStats from '../generated/repo-stats.json';

/** Upstream repository facts, refreshed nightly by scripts/sync-upstream.ts. */
export interface RepoStats {
  stars: number;
  archived?: boolean;
  /** Last push to the upstream repository, YYYY-MM-DD. */
  pushedAt?: string;
}

const STATS = repoStats as Record<string, RepoStats>;

/** Upstream star count, refreshed nightly by scripts/sync-upstream.ts. */
export function getStarsForConfig(id: string): number {
  return STATS[id]?.stars ?? 0;
}

export function getRepoStats(id: string): RepoStats | undefined {
  return STATS[id];
}

export type MaintenanceStatus = 'active' | 'quiet' | 'archived';

/** How each status is shown on config and topic pages. */
export const MAINTENANCE_INFO: Record<MaintenanceStatus, { label: string; dot: string }> = {
  active: { label: 'Active', dot: 'bg-emerald-600' },
  quiet: { label: 'Quiet', dot: 'bg-zinc-400' },
  archived: { label: 'Archived upstream', dot: 'bg-amber-500' },
};

/** Without a push for this long, a project is shown as quiet rather than active. */
export const QUIET_AFTER_DAYS = 183;

/**
 * archived: the upstream repository is archived (read-only).
 * active: pushed to within QUIET_AFTER_DAYS of `now`.
 * quiet: older last push. Stable themes are often finished rather than abandoned, so this is not a warning.
 * null: no data yet (the nightly sync has not recorded this entry).
 */
export function maintenanceStatus(stats: RepoStats | undefined, now: Date = new Date()): MaintenanceStatus | null {
  if (!stats) return null;
  if (stats.archived) return 'archived';
  if (!stats.pushedAt) return null;
  const pushed = Date.parse(`${stats.pushedAt}T00:00:00Z`);
  if (Number.isNaN(pushed)) return null;
  const days = (now.getTime() - pushed) / 86_400_000;
  return days <= QUIET_AFTER_DAYS ? 'active' : 'quiet';
}

/**
 * Status of a registry entry. Until the nightly sync has recorded its repository,
 * the hand-written "archived" tag still marks archived projects.
 */
export function maintenanceForConfig(id: string, tags: string[], now: Date = new Date()): MaintenanceStatus | null {
  return maintenanceStatus(STATS[id], now) ?? (tags.includes('archived') ? 'archived' : null);
}
