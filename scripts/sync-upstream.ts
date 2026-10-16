/**
 * Keeps every config in step with its upstream repository:
 *  - source.ref  -> latest commit on the default branch (still a pinned SHA)
 *  - updatedAt   -> date the new commit was picked up
 *  - version     -> newest version-like tag, or removed when the repo has no tags
 *  - stars       -> src/generated/repo-stats.json (powers the "Most popular" sort)
 * Screenshot URLs stay pinned to their own commits, so they keep working after a bump.
 * Runs nightly in .github/workflows/sync-upstream.yml; set GITHUB_TOKEN to avoid API rate limits.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const CONFIGS_DIR = path.resolve(process.cwd(), 'configs');
const STATS_PATH = path.resolve(process.cwd(), 'src/generated/repo-stats.json');
const VERSION_TAG = /^v?\d+(\.\d+)*$/;

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

async function git(...args: string[]): Promise<string> {
  const { stdout } = await run('git', args, { env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }, timeout: 60_000, maxBuffer: 16 * 1024 * 1024 });
  return stdout;
}

async function fetchStars(repoUrl: string): Promise<number | undefined> {
  const u = new URL(repoUrl);
  const [owner, repo] = u.pathname.split('/').filter(Boolean);
  const api =
    u.hostname === 'github.com' ? `https://api.github.com/repos/${owner}/${repo}`
    : u.hostname === 'codeberg.org' ? `https://codeberg.org/api/v1/repos/${owner}/${repo}`
    : `https://gitlab.com/api/v4/projects/${encodeURIComponent(`${owner}/${repo}`)}`;
  const headers: Record<string, string> = { 'User-Agent': '0xTsoa-sync' };
  if (u.hostname === 'github.com' && process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
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
  await Promise.all(Array.from({ length: size }, async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) await fn(item);
  }));
}

async function main() {
  const files = fs.readdirSync(CONFIGS_DIR).flatMap((a) =>
    fs.statSync(path.join(CONFIGS_DIR, a)).isDirectory()
      ? fs.readdirSync(path.join(CONFIGS_DIR, a)).filter((f) => f.endsWith('.json')).map((f) => path.join(CONFIGS_DIR, a, f))
      : [],
  );
  const stats: Record<string, { stars: number }> = fs.existsSync(STATS_PATH) ? JSON.parse(fs.readFileSync(STATS_PATH, 'utf-8')) : {};
  const today = new Date().toISOString().slice(0, 10);
  let bumped = 0;

  await pool(files, 8, async (file) => {
    const id = path.relative(CONFIGS_DIR, file).replace(/\\/g, '/').replace(/\.json$/, '');
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
    const repo: string = data.source.repo;
    try {
      const head = (await git('ls-remote', repo, 'HEAD')).split(/\s/)[0];
      const tags = (await git('ls-remote', '--tags', '--refs', repo))
        .split('\n').filter(Boolean).map((l) => l.split('refs/tags/')[1]);
      const version = latestVersionTag(tags);
      let changed = false;
      if (/^[0-9a-f]{40}$/.test(head) && head !== data.source.ref) {
        data.source.ref = head;
        data.updatedAt = today;
        changed = true;
        bumped++;
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
  console.log(`✓ ${files.length} configs checked, ${bumped} moved to a newer upstream commit, ${Object.keys(sorted).length} star counts.`);
}

if (process.argv[1]?.endsWith('sync-upstream.ts')) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
