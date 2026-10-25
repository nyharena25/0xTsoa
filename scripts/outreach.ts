/**
 * Prepares one message per listed author (docs/OUTREACH.md). Sends nothing: it writes
 * outreach/messages.md and outreach/authors.csv for the maintainer to post by hand.
 *
 *   npm run outreach [-- --github] [--sent outreach/sent.txt] [--batch-size 10]
 */
import fs from 'node:fs';
import path from 'node:path';
import { configSchema, idFromPath, type ConfigData } from '../src/lib/schema';
import { getStarsForConfig, maintenanceForConfig, type MaintenanceStatus } from '../src/lib/stats';
import { badgeMarkdown, claimEntryUrl, configPageUrl, entryChangeUrl } from '../src/lib/author-links';
import { githubOwner } from './ownership';
import { stripTrailingSlashes } from '../src/lib/strings';
import { mapPool } from './pool';

const FALLBACK_SCREENSHOT = '/screenshots/fallback-terminal.svg';
/** From this many stars, a project's issue tracker is for bugs: these authors go last, flagged. */
export const LARGE_PROJECT_STARS = 10_000;
const TEMPLATE_DOC = 'docs/OUTREACH.md';
const OUT_DIR = 'outreach';

export interface OutreachEntry {
  id: string;
  name: string;
  repo: string;
  stars: number;
  maintenance: MaintenanceStatus | null;
  verified: boolean;
  missingScreenshot: boolean;
}

export interface RepoFacts {
  hasIssues: boolean;
  hasDiscussions: boolean;
  archived: boolean;
}

export interface OutreachAuthor {
  github: string;
  entries: OutreachEntry[];
  /** The most-starred entry: its repository is where the message goes. */
  main: OutreachEntry;
  stars: number;
  large: boolean;
  maintenance: MaintenanceStatus | null;
  facts?: RepoFacts;
}

export interface OutreachPlan {
  authors: OutreachAuthor[];
  skipped: { github: string; reason: string }[];
}

/**
 * Whether the entry's page shows a screenshot. The page also takes images from the upstream README,
 * so the built page (dist/) is the truth when there is one; otherwise only the config is checked.
 */
export function pageHasScreenshot(id: string, data: ConfigData, distDir = 'dist'): boolean {
  const page = path.join(distDir, 'configs', id, 'index.html');
  if (fs.existsSync(page)) return fs.readFileSync(page, 'utf-8').includes('id="screenshots"');
  return data.screenshots.some((s) => !s.url.endsWith(FALLBACK_SCREENSHOT));
}

export function toEntry(id: string, data: ConfigData, stars: number, maintenance: MaintenanceStatus | null, hasScreenshot: boolean): OutreachEntry {
  return {
    id,
    name: data.name,
    repo: data.source.repo,
    stars,
    maintenance,
    verified: Boolean(data.author.verified),
    missingScreenshot: !hasScreenshot,
  };
}

const MAINTENANCE_ORDER: Record<MaintenanceStatus | 'unknown', number> = { active: 0, unknown: 1, quiet: 2, archived: 3 };
const MAINTENANCE_RANK = (m: MaintenanceStatus | null) => MAINTENANCE_ORDER[m ?? 'unknown'];

/** Groups entries by author, drops the ones not worth a message, and orders the rest. */
export function planOutreach(entries: OutreachEntry[], sent: Set<string> = new Set()): OutreachPlan {
  const byAuthor = new Map<string, OutreachEntry[]>();
  for (const e of entries) {
    const github = e.id.split('/')[0];
    byAuthor.set(github, [...(byAuthor.get(github) ?? []), e]);
  }

  const authors: OutreachAuthor[] = [];
  const skipped: OutreachPlan['skipped'] = [];
  for (const [github, list] of byAuthor) {
    if (sent.has(github.toLowerCase())) skipped.push({ github, reason: 'already contacted' });
    else if (list.every((e) => e.verified)) skipped.push({ github, reason: 'already verified' });
    else if (list.every((e) => e.maintenance === 'archived')) skipped.push({ github, reason: 'archived upstream' });
    else {
      const open = list.filter((e) => !e.verified && e.maintenance !== 'archived').sort((a, b) => b.stars - a.stars || a.name.localeCompare(b.name));
      const maintenance = open.map((e) => e.maintenance).sort((a, b) => MAINTENANCE_RANK(a) - MAINTENANCE_RANK(b))[0];
      authors.push({ github, entries: open, main: open[0], stars: open[0].stars, maintenance, large: open[0].stars >= LARGE_PROJECT_STARS });
    }
  }
  authors.sort(
    (a, b) =>
      Number(a.large) - Number(b.large) ||
      MAINTENANCE_RANK(a.maintenance) - MAINTENANCE_RANK(b.maintenance) ||
      b.stars - a.stars ||
      a.github.localeCompare(b.github),
  );
  skipped.sort((a, b) => a.reason.localeCompare(b.reason) || a.github.localeCompare(b.github));
  return { authors, skipped };
}

/** "A", "A and B", "A, B and C", or past `max` names "A, B, C and 4 more". */
export function joinNames(names: string[], max = 3): string {
  if (names.length > max) return `${names.slice(0, max).join(', ')} and ${names.length - max} more`;
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/** GitHub rejects longer new-issue URLs; past this, the message is copied by hand. */
export const MAX_POST_URL = 8000;

export function readTemplate(doc: string): { title: string; body: string } {
  const section = (name: string) => {
    const m = new RegExp(String.raw`<!-- outreach-template:${name} -->\n([\s\S]*?)\n<!-- /outreach-template:${name} -->`).exec(doc);
    if (!m) throw new Error(`${TEMPLATE_DOC} has no outreach-template:${name} section`);
    return m[1];
  };
  return { title: section('title').trim(), body: section('body') };
}

/** Fills the template: `{{name}}` values (continuation lines keep the line's indent) and `{{?flag}}` lines. */
export function renderTemplate(template: string, values: Record<string, string>, flags: Record<string, boolean>): string {
  return template
    .split('\n')
    .flatMap((line) => {
      const flag = /^\{\{\?(\w+)\}\}/.exec(line);
      if (flag) {
        if (!flags[flag[1]]) return [];
        line = line.slice(flag[0].length);
      }
      const indent = /^\s*/.exec(line)![0];
      return [
        line.replace(/\{\{(\w+)\}\}/g, (whole, key: string) => {
          if (!(key in values)) throw new Error(`Unknown template placeholder ${whole}`);
          return values[key].replaceAll('\n', `\n${indent}`);
        }),
      ];
    })
    .join('\n');
}

export function renderMessage(template: { title: string; body: string }, author: OutreachAuthor): { title: string; body: string } {
  const names = author.entries.map((e) => e.name);
  const values = {
    github: author.github,
    projects: joinNames(names),
    isAre: names.length === 1 ? 'is' : 'are',
    itThem: names.length === 1 ? 'it' : 'them',
    entryList: author.entries
      .map((e) => `- **[${e.name}](${configPageUrl(e.id)})** · [claim it](${claimEntryUrl(e.id)}) · [ask for removal](${entryChangeUrl(e.id, 'remove')})`)
      .join('\n'),
    badges: author.entries.map((e) => badgeMarkdown(e.id)).join('\n'),
  };
  const flags = { missingScreenshot: author.entries.some((e) => e.missingScreenshot) };
  return { title: renderTemplate(template.title, values, flags), body: renderTemplate(template.body, values, flags) };
}

/** Where to post: a prefilled new discussion or issue on the main repository, or null off GitHub / with both off. */
export function postUrl(author: OutreachAuthor, message: { title: string; body: string }): string | null {
  if (!githubOwner(author.main.repo)) return null;
  const repo = stripTrailingSlashes(author.main.repo);
  const params = new URLSearchParams({ title: message.title, body: message.body });
  let url: string;
  if (author.facts?.hasDiscussions) url = `${repo}/discussions/new?category=general&${params}`;
  else if (author.facts && !author.facts.hasIssues) return null;
  else url = `${repo}/issues/new?${params}`;
  return url.length <= MAX_POST_URL ? url : null;
}

async function fetchRepoFacts(repoUrl: string, token?: string): Promise<RepoFacts | undefined> {
  const m = /^https:\/\/github\.com\/([^/]+)\/([^/]+?)\/?$/.exec(repoUrl);
  if (!m) return undefined;
  const res = await fetch(`https://api.github.com/repos/${m[1]}/${m[2]}`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': '0xTsoa-Outreach/1.0', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`GitHub API returned ${res.status} for ${m[1]}/${m[2]}`);
  const r = (await res.json()) as { has_issues: boolean; has_discussions: boolean; archived: boolean };
  return { hasIssues: r.has_issues, hasDiscussions: r.has_discussions, archived: r.archived };
}

/** The line telling the maintainer where to post one message. */
function whereToPost(a: OutreachAuthor, url: string | null): string {
  if (url) {
    const kind = url.includes('/discussions/') ? 'discussion' : 'issue';
    return `[Open the prefilled ${kind}](${url})`;
  }
  let why = '';
  if (a.facts && !a.facts.hasIssues) why = ' (Issues are off)';
  else if (githubOwner(a.main.repo)) why = ' (the message is too long for a link)';
  return `No prefilled link: post on ${a.main.repo} by hand, copying the text below${why}.`;
}

const csvCell = (v: string | number | boolean | null | undefined) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

function readSent(file: string): Set<string> {
  if (!fs.existsSync(file)) return new Set();
  return new Set(
    fs.readFileSync(file, 'utf-8').split('\n').map((l) => l.replace(/#.*/, '').trim().replace(/^@/, '').toLowerCase()).filter(Boolean),
  );
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const batchSize = Number(arg('--batch-size') ?? 10);
  if (!Number.isInteger(batchSize) || batchSize < 1) throw new Error('--batch-size must be a positive whole number');
  const sentFile = arg('--sent') ?? path.join(OUT_DIR, 'sent.txt');
  const useGithub = process.argv.includes('--github');

  const entries: OutreachEntry[] = [];
  for (const author of fs.readdirSync('configs', { withFileTypes: true }).filter((d) => d.isDirectory())) {
    for (const file of fs.readdirSync(path.join('configs', author.name)).filter((f) => f.endsWith('.json'))) {
      const rel = `configs/${author.name}/${file}`;
      const { id } = idFromPath(rel)!;
      const data = configSchema.parse(JSON.parse(fs.readFileSync(rel, 'utf-8')));
      entries.push(toEntry(id, data, getStarsForConfig(id), maintenanceForConfig(id, data.tags), pageHasScreenshot(id, data)));
    }
  }

  if (!fs.existsSync('dist/configs')) console.warn('⚠ No dist/ build: screenshots from upstream READMEs are not seen, so some "send a screenshot" requests may be wrong. Run npm run build:site first.');
  const plan = planOutreach(entries, readSent(sentFile));
  if (useGithub) {
    if (!process.env.GITHUB_TOKEN) console.warn('⚠ GITHUB_TOKEN is not set: the anonymous API limit (60 an hour) may stop this run.');
    await mapPool(plan.authors, 4, async (a) => {
      try {
        a.facts = await fetchRepoFacts(a.main.repo, process.env.GITHUB_TOKEN);
      } catch (err) {
        console.warn(`⚠ @${a.github}: ${(err as Error).message}`);
      }
    });
  }

  const template = readTemplate(fs.readFileSync(TEMPLATE_DOC, 'utf-8'));
  const md: string[] = [
    '# Outreach messages',
    '',
    `Generated ${new Date().toISOString().slice(0, 10)} by \`npm run outreach\`${useGithub ? ' --github' : ''}. ${plan.authors.length} authors to contact, ${plan.skipped.length} skipped. Read each message before posting, and add the username to \`${sentFile}\` after you post.`,
  ];
  const csv = [['batch', 'github', 'entries', 'stars', 'maintenance', 'missing_screenshot', 'repo', 'has_issues', 'has_discussions', 'post_url'].join(',')];

  plan.authors.forEach((a, i) => {
    const batch = Math.floor(i / batchSize) + 1;
    const message = renderMessage(template, a);
    const url = postUrl(a, message);
    if (i % batchSize === 0) md.push('', `## Batch ${batch}`);
    const where = whereToPost(a, url);
    const facts =
      (a.facts?.archived ? ' · ⚠ repository now archived, consider skipping' : '') +
      (a.large ? ' · large project: its issue tracker is for bugs, prefer Discussions or skip' : '');
    md.push(
      '',
      `### @${a.github}`,
      '',
      `${a.entries.map((e) => e.id).join(', ')} · ★ ${a.stars.toLocaleString('en')} · ${a.maintenance ?? 'no maintenance data'}${facts}`,
      '',
      where,
      '',
      `**Title:** ${message.title}`,
      '',
      '````markdown',
      message.body,
      '````',
    );
    csv.push(
      [batch, a.github, a.entries.map((e) => e.id).join(' '), a.stars, a.maintenance ?? '', a.entries.some((e) => e.missingScreenshot), a.main.repo, a.facts?.hasIssues ?? '', a.facts?.hasDiscussions ?? '', url ?? '']
        .map(csvCell)
        .join(','),
    );
  });

  if (plan.skipped.length > 0) {
    md.push('', '## Skipped', '', ...plan.skipped.map((s) => `- @${s.github}: ${s.reason}`));
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'messages.md'), md.join('\n') + '\n', 'utf-8');
  fs.writeFileSync(path.join(OUT_DIR, 'authors.csv'), csv.join('\n') + '\n', 'utf-8');
  console.log(`✓ ${plan.authors.length} authors in ${Math.ceil(plan.authors.length / batchSize)} batches, ${plan.skipped.length} skipped → ${OUT_DIR}/messages.md, ${OUT_DIR}/authors.csv`);
}

if (process.argv[1]?.endsWith('outreach.ts')) {
  try {
    await main();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
