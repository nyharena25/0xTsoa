/**
 * Keeps every config in step with its upstream repository:
 *  - source.ref  -> latest commit on the default branch (still a pinned 40-char SHA)
 *  - updatedAt   -> never modified (preserves curation/submission date for "Newest" sort)
 *  - version     -> version-like tag whose peeled commit equals source.ref, or removed otherwise
 *  - stars       -> src/generated/repo-stats.json (powers the "Most popular" sort)
 *  - summary     -> sync-summary.md with old -> new ref compare links for the sync PR
 * Screenshot URLs stay pinned to their own commits, so they keep working after a bump.
 * Runs nightly in .github/workflows/sync-upstream.yml and opens/updates a PR; set GITHUB_TOKEN to avoid API rate limits.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { stripLeadingSlashes, stripTrailingSlashes } from '../src/lib/strings';

const run = promisify(execFile);
const CONFIGS_DIR = path.resolve(process.cwd(), 'configs');
const STATS_PATH = path.resolve(process.cwd(), 'src/generated/repo-stats.json');
const SUMMARY_PATH = path.resolve(process.cwd(), 'sync-summary.md');
const VERSION_TAG = /^v?\d+(\.\d+)*$/;

export interface SyncChange {
  id: string;
  repo: string;
  oldRef: string;
  newRef: string;
  version?: string;
}

/** Newest version-like tag (v1.10.0 > v1.9.2), ignoring pre-releases and non-version tags. */
export function latestVersionTag(tags: string[]): string | undefined {
  const parts = (t: string) => t.replace(/^v/, '').split('.').map(Number);
  return tags
    .filter((t) => VERSION_TAG.test(t))
    .sort((a, b) => {
      const pa = parts(a);
      const pb = parts(b);
      for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const d = (pa[i] ?? 0) - (pb[i] ?? 0);
        if (d) return d;
      }
      return 0;
    })
    .at(-1);
}

/**
 * Parses `git ls-remote --tags <repo>` output and returns the highest version-like tag
 * whose peeled commit (from `refs/tags/<tag>^{}`, or `refs/tags/<tag>` for lightweight tags)
 * equals `ref`. Returns `undefined` when no version tag points at `ref`.
 */
export function versionTagAtRef(lsRemoteTagsOutput: string, ref: string): string | undefined {
  const target = ref.trim().toLowerCase();
  if (!target) return undefined;

  const tagCommit = new Map<string, { sha: string; peeled: boolean }>();

  for (const rawLine of lsRemoteTagsOutput.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = line.match(/^([0-9a-f]{40})\s+refs\/tags\/(.+)$/i);
    if (!match) continue;

    const sha = match[1].toLowerCase();
    const rawTag = match[2];

    if (rawTag.endsWith('^{}')) {
      const tagName = rawTag.slice(0, -3);
      tagCommit.set(tagName, { sha, peeled: true });
    } else {
      const existing = tagCommit.get(rawTag);
      if (!existing || !existing.peeled) {
        tagCommit.set(rawTag, { sha, peeled: false });
      }
    }
  }

  const matchingTags: string[] = [];
  for (const [tagName, info] of tagCommit.entries()) {
    if (info.sha === target) {
      matchingTags.push(tagName);
    }
  }

  return latestVersionTag(matchingTags);
}

/** Builds a commit comparison URL for GitHub, GitLab, or Codeberg. */
export function buildCompareUrl(repoUrl: string, oldRef: string, newRef: string): string {
  const cleaned = stripTrailingSlashes(repoUrl.trim()).replace(/\.git$/i, '');
  const u = new URL(cleaned);
  const repoPath = stripTrailingSlashes(stripLeadingSlashes(u.pathname));
  if (u.hostname === 'gitlab.com') {
    return `https://gitlab.com/${repoPath}/-/compare/${oldRef}...${newRef}`;
  }
  return `${u.origin}/${repoPath}/compare/${oldRef}...${newRef}`;
}

/** Formats the markdown body written to `sync-summary.md`. */
export function formatSyncSummary(changes: SyncChange[]): string {
  if (changes.length === 0) {
    return [
      '## Upstream Repository Sync',
      '',
      'No upstream commit ref changes in this run (repository star counts / metadata refreshed).',
      '',
    ].join('\n');
  }

  const sorted = [...changes].sort((a, b) => a.id.localeCompare(b.id));
  const lines = [
    '## Upstream Repository Sync',
    '',
    `Updated **${sorted.length}** configuration(s) to their latest upstream commit:`,
    '',
  ];

  for (const item of sorted) {
    const compareUrl = buildCompareUrl(item.repo, item.oldRef, item.newRef);
    const shortOld = item.oldRef.slice(0, 7);
    const shortNew = item.newRef.slice(0, 7);
    const versionSuffix = item.version ? ` (tag \`${item.version}\`)` : '';
    lines.push(
      `- **${item.id}**: \`${shortOld}\` → \`${shortNew}\` ([${item.oldRef}...${item.newRef}](${compareUrl}))${versionSuffix}`,
    );
  }

  lines.push('');
  return lines.join('\n');
}

async function git(...args: string[]): Promise<string> {
  const { stdout } = await run('git', args, {
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    timeout: 60_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  return stdout;
}

async function fetchStars(repoUrl: string): Promise<number | undefined> {
  const u = new URL(repoUrl);
  const [owner, repo] = u.pathname.split('/').filter(Boolean);
  const api =
    u.hostname === 'github.com'
      ? `https://api.github.com/repos/${owner}/${repo}`
      : u.hostname === 'codeberg.org'
        ? `https://codeberg.org/api/v1/repos/${owner}/${repo}`
        : `https://gitlab.com/api/v4/projects/${encodeURIComponent(`${owner}/${repo}`)}`;
  const headers: Record<string, string> = { 'User-Agent': '0xTsoa-sync' };
  if (u.hostname === 'github.com' && process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  try {
    const res = await fetch(api, { headers, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return undefined;
    const body = (await res.json()) as Record<string, number>;
    return body.stargazers_count ?? body.stars_count ?? body.star_count;
  } catch {
    return undefined;
  }
}

async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: size }, async () => {
      for (let item = queue.shift(); item !== undefined; item = queue.shift()) await fn(item);
    }),
  );
}

async function main() {
  const files = fs.readdirSync(CONFIGS_DIR).flatMap((a) =>
    fs.statSync(path.join(CONFIGS_DIR, a)).isDirectory()
      ? fs
          .readdirSync(path.join(CONFIGS_DIR, a))
          .filter((f) => f.endsWith('.json'))
          .map((f) => path.join(CONFIGS_DIR, a, f))
      : [],
  );
  const stats: Record<string, { stars: number }> = fs.existsSync(STATS_PATH)
    ? JSON.parse(fs.readFileSync(STATS_PATH, 'utf-8'))
    : {};
  const changes: SyncChange[] = [];

  await pool(files, 8, async (file) => {
    const id = path.relative(CONFIGS_DIR, file).replace(/\\/g, '/').replace(/\.json$/, '');
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
    const repo: string = data.source.repo;
    try {
      const head = (await git('ls-remote', repo, 'HEAD')).split(/\s/)[0];
      const tagsOutput = await git('ls-remote', '--tags', repo);
      const oldRef: string = data.source.ref;
      const newRef = /^[0-9a-f]{40}$/.test(head) ? head : oldRef;
      const version = versionTagAtRef(tagsOutput, newRef);

      let changed = false;
      if (newRef !== oldRef) {
        data.source.ref = newRef;
        changed = true;
        changes.push({ id, repo, oldRef, newRef, version });
      }
      if (version !== data.version) {
        if (version) data.version = version;
        else delete data.version;
        changed = true;
      }
      if (changed) fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
    } catch (err) {
      console.warn(`⚠ ${id}: ${(err as Error).message.split('\n')[0]}`);
    }
    const stars = await fetchStars(repo);
    if (stars !== undefined) stats[id] = { stars };
  });

  const sorted = Object.fromEntries(Object.entries(stats).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(STATS_PATH, JSON.stringify(sorted, null, 2) + '\n');
  fs.writeFileSync(SUMMARY_PATH, formatSyncSummary(changes), 'utf-8');
  console.log(
    `✓ ${files.length} configs checked, ${changes.length} moved to a newer upstream commit, ${Object.keys(sorted).length} star counts.`,
  );
}

if (process.argv[1]?.endsWith('sync-upstream.ts')) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
