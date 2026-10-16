import repoStats from '../generated/repo-stats.json';

/** Upstream star count, refreshed nightly by scripts/sync-upstream.ts. */
export function getStarsForConfig(id: string): number {
  return (repoStats as Record<string, { stars: number }>)[id]?.stars ?? 0;
}
