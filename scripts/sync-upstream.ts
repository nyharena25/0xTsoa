/**
 * Keeps every config in step with its upstream repository:
 *  - source.ref  -> latest commit on the default branch (still a pinned 40-char SHA), unless that
 *                   commit lacks a repository file the install steps use: then the ref is held back.
 *                   Entries installed from released distro packages (installsReleasePackages) follow
 *                   the commit of the latest release tag instead: that is the version users install.
 *  - updatedAt   -> never modified (preserves curation/submission date for "Newest" sort)
 *  - version     -> version-like tag whose peeled commit equals source.ref, or removed otherwise
 *  - stars, archived, pushedAt -> src/generated/repo-stats.json ("Most popular" sort, maintenance status)
 *  - summary     -> sync-summary.md with old -> new ref compare links for the sync PR
 * Screenshot URLs stay pinned to their own commits, so they keep working after a bump.
 * Runs nightly in .github/workflows/sync-upstream.yml and opens/updates a PR; set GITHUB_TOKEN to avoid API rate limits.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { stripLeadingSlashes, stripTrailingSlashes } from '../src/lib/strings';
import type { RepoStats } from '../src/lib/stats';
import { repoPathsInSteps, installsReleasePackages } from '../src/lib/schema';
import { listRepoTree, missingRepoPaths } from './repo-tree';
import { GIT } from './git-path';
import { mapPool } from './pool';

const run = promisify(execFile);
const CONFIGS_DIR = path.resolve(process.cwd(), 'configs');
const STATS_PATH = path.resolve(process.cwd(), 'src/generated/repo-stats.json');
const SUMMARY_PATH = path.resolve(process.cwd(), 'sync-summary.md');
const VERSION_TAG = /^v?\d+(\.\d+)*$/;

/** A config kept on its reviewed ref because the new upstream commit lacks files its install steps use. */
export interface HeldBack {
  id: string;
  repo: string;
  oldRef: string;
  newRef: string;
  missing: string[];
}

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

/** `git ls-remote --tags` output → tag name → commit it points to (annotated tags peeled). */
export function parseTagCommits(lsRemoteTagsOutput: string): Map<string, string> {
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

  return new Map([...tagCommit].map(([tag, info]) => [tag, info.sha]));
}

/** The newest version tag (pre-releases ignored) and its commit, or undefined without one. */
export function latestReleaseCommit(lsRemoteTagsOutput: string): { tag: string; sha: string } | undefined {
  const commits = parseTagCommits(lsRemoteTagsOutput);
  const tag = latestVersionTag([...commits.keys()]);
  return tag ? { tag, sha: commits.get(tag)! } : undefined;
}

/**
 * Parses `git ls-remote --tags <repo>` output and returns the highest version-like tag
 * whose peeled commit (from `refs/tags/<tag>^{}`, or `refs/tags/<tag>` for lightweight tags)
 * equals `ref`. Returns `undefined` when no version tag points at `ref`.
 */
export function versionTagAtRef(lsRemoteTagsOutput: string, ref: string): string | undefined {
  const target = ref.trim().toLowerCase();
  if (!target) return undefined;

  const tagCommit = parseTagCommits(lsRemoteTagsOutput);

  const matchingTags: string[] = [];
  for (const [tagName, sha] of tagCommit.entries()) {
    if (sha === target) {
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
function heldBackSection(heldBack: HeldBack[]): string[] {
  if (heldBack.length === 0) return [];
  const lines = [
    '### Held back',
    '',
    'These configs stay on their reviewed ref: the newer upstream commit no longer has files their install steps use. Update the steps, then the next sync moves them.',
    '',
  ];
  for (const item of [...heldBack].sort((a, b) => a.id.localeCompare(b.id))) {
    const compareUrl = buildCompareUrl(item.repo, item.oldRef, item.newRef);
    lines.push(
      `- **${item.id}**: \`${item.newRef.slice(0, 7)}\` lacks ${item.missing.map((m) => '`' + m + '`').join(', ')} ([what changed](${compareUrl}))`,
    );
  }
  lines.push('');
  return lines;
}

export function formatSyncSummary(changes: SyncChange[], heldBack: HeldBack[] = []): string {
  if (changes.length === 0) {
    return [
      '## Upstream Repository Sync',
      '',
      'No upstream commit ref changes in this run (repository star counts / metadata refreshed).',
      '',
      ...heldBackSection(heldBack),
    ].join('\n');
  }

  const sorted = [...changes].sort((a, b) => a.id.localeCompare(b.id));
  const lines = [
    '## Upstream Repository Sync',
    '',
    `Updated **${sorted.length}** configuration(s) to their latest upstream commit, or latest release for entries installed from distro packages:`,
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

  lines.push('', ...heldBackSection(heldBack));
  return lines.join('\n');
}

async function git(...args: string[]): Promise<string> {
  const { stdout } = await run(GIT, args, {
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    timeout: 60_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  return stdout;
}

/**
 * Stars, archived flag and last push date (YYYY-MM-DD) from a forge's repository API response.
 * GitHub: stargazers_count / pushed_at; GitLab: star_count / last_activity_at;
 * Codeberg (Gitea): stars_count / updated_at. Returns undefined when the star count is missing.
 */
export function repoStatsFromApi(body: Record<string, unknown>): RepoStats | undefined {
  const stars = [body.stargazers_count, body.stars_count, body.star_count].find((v) => typeof v === 'number');
  if (stars === undefined) return undefined;
  const stats: RepoStats = { stars: stars as number };
  if (typeof body.archived === 'boolean') stats.archived = body.archived;
  const pushed = [body.pushed_at, body.last_activity_at, body.updated_at].find((v) => typeof v === 'string');
  // Day precision, so same-day pushes do not churn the nightly sync PR.
  if (typeof pushed === 'string' && /^\d{4}-\d{2}-\d{2}/.test(pushed)) stats.pushedAt = pushed.slice(0, 10);
  return stats;
}

async function fetchRepoStats(repoUrl: string): Promise<RepoStats | undefined> {
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
    return repoStatsFromApi((await res.json()) as Record<string, unknown>);
  } catch {
    return undefined;
  }
}

/** A config file as written on disk: only the fields the sync reads or changes are typed, the rest is kept. */
interface ConfigJson {
  source: { repo: string; ref: string };
  version?: string;
  install?: { script?: unknown; steps: { commands: string[] }[] };
  [field: string]: unknown;
}

const entryId = (file: string) => path.relative(CONFIGS_DIR, file).replace(/\\/g, '/').replace(/\.json$/, '');

/** The ref an entry should move to: its latest release for packaged installs, else the upstream HEAD. */
function targetRef(data: ConfigJson, head: string, tagsOutput: string): string {
  const release = installsReleasePackages(data) ? latestReleaseCommit(tagsOutput) : undefined;
  if (release) return release.sha;
  return /^[0-9a-f]{40}$/.test(head) ? head : data.source.ref;
}

/** Sets `source.ref` and `version` on the entry; true when either changed. */
function applyRef(data: ConfigJson, newRef: string, version: string | undefined): boolean {
  let changed = false;
  if (newRef !== data.source.ref) {
    data.source.ref = newRef;
    changed = true;
  }
  if (version !== data.version) {
    if (version) data.version = version;
    else delete data.version;
    changed = true;
  }
  return changed;
}

interface SyncResult {
  change?: SyncChange;
  held?: HeldBack;
  stats?: RepoStats;
}

/** Moves one entry to its new upstream ref, unless that commit lacks a file the install steps use. */
async function syncEntry(file: string): Promise<SyncResult> {
  const id = entryId(file);
  const data = JSON.parse(fs.readFileSync(file, 'utf-8')) as ConfigJson;
  const repo = data.source.repo;
  const oldRef = data.source.ref;
  const result: SyncResult = {};
  try {
    const head = (await git('ls-remote', repo, 'HEAD')).split(/\s/)[0];
    const tagsOutput = await git('ls-remote', '--tags', repo);
    let newRef = targetRef(data, head, tagsOutput);
    const repoPaths = repoPathsInSteps(data);
    if (newRef !== oldRef && repoPaths.length > 0) {
      const missing = missingRepoPaths(repoPaths, await listRepoTree(repo, newRef));
      if (missing.length > 0) {
        result.held = { id, repo, oldRef, newRef, missing };
        console.warn(`⚠ ${id}: held at ${oldRef.slice(0, 7)}, ${newRef.slice(0, 7)} lacks ${missing.join(', ')}`);
        newRef = oldRef;
      }
    }
    const version = versionTagAtRef(tagsOutput, newRef);
    if (newRef !== oldRef) result.change = { id, repo, oldRef, newRef, version };
    if (applyRef(data, newRef, version)) fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
  } catch (err) {
    console.warn(`⚠ ${id}: ${(err as Error).message.split('\n')[0]}`);
  }
  // On API failure, the previous night's entry is kept.
  result.stats = await fetchRepoStats(repo);
  return result;
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
  const stats: Record<string, RepoStats> = fs.existsSync(STATS_PATH)
    ? JSON.parse(fs.readFileSync(STATS_PATH, 'utf-8'))
    : {};
  const results = await mapPool(files, 8, syncEntry);
  const changes = results.flatMap((r) => (r.change ? [r.change] : []));
  const heldBack = results.flatMap((r) => (r.held ? [r.held] : []));
  results.forEach((r, i) => {
    if (r.stats) stats[entryId(files[i])] = r.stats;
  });

  const sorted = Object.fromEntries(Object.entries(stats).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(STATS_PATH, JSON.stringify(sorted, null, 2) + '\n');
  fs.writeFileSync(SUMMARY_PATH, formatSyncSummary(changes, heldBack), 'utf-8');
  console.log(
    `✓ ${files.length} configs checked, ${changes.length} moved to a newer upstream commit, ${heldBack.length} held back, ${Object.keys(sorted).length} repo stats.`,
  );
}

if (process.argv[1]?.endsWith('sync-upstream.ts')) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
