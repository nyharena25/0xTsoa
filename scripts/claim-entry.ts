/**
 * Turns a `claim` issue (.github/ISSUE_TEMPLATE/claim-entry.yml) into `author.verified` on the entry.
 * Run by claim-to-pr.yml: tsx scripts/claim-entry.ts <issue-body-file> <issue-opener> <issue-number>
 *
 * Verification rules: the issue opener (authenticated by GitHub) must own the GitHub repository in
 * `source.repo`, or be a *public* member of the organization that owns it. Anything else, including
 * GitLab and Codeberg entries, is left to a maintainer.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { configSchema, type ConfigData } from '../src/lib/schema';
import { parseIssueBody } from './issue-to-config';
import { stripTrailingSlashes } from '../src/lib/strings';
import { checkOwnership, githubOwner, publicMemberFromEnv, type PublicMemberCheck } from './ownership';

const ENTRY_RE = /^([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([a-z0-9][a-z0-9-]{2,47})$/;
const RESULT_FILE = 'claim-result.json';

export type Verified = NonNullable<ConfigData['author']['verified']>;

/** The entry id from the form's "Entry" field; also accepts a pasted page URL. */
export function parseClaimEntry(body: string): string {
  const raw = (parseIssueBody(body)['Entry'] ?? '').trim();
  const id = stripTrailingSlashes(raw.replace(/^https?:\/\/[^/]+\/configs\//, '').replace(/^\/?configs\//, ''));
  if (!ENTRY_RE.test(id)) throw new Error(`"${raw || '(empty)'}" is not an entry id. Use <author>/<slug>, as in /configs/<author>/<slug>/.`);
  return id;
}

export type ClaimDecision =
  | { status: 'verified'; reason: string }
  | { status: 'already'; reason: string }
  | { status: 'manual'; reason: string };

export async function decideClaim(
  data: ConfigData,
  opener: string,
  isPublicMember: PublicMemberCheck,
): Promise<ClaimDecision> {
  if (data.author.verified) {
    return { status: 'already', reason: `This entry was already verified by @${data.author.verified.by} on ${data.author.verified.at}.` };
  }
  const ownership = await checkOwnership(data.source.repo, opener, isPublicMember);
  if (ownership.owns) return { status: 'verified', reason: ownership.reason };
  const owner = githubOwner(data.source.repo);
  const hint = owner ? ` If you maintain it, make your membership of ${owner} public and ask for a re-run, or wait for a maintainer.` : '';
  return { status: 'manual', reason: ownership.reason + hint };
}

/** Adds `author.verified` to the raw file text, keeping every other field and its order. */
export function applyClaim(rawJson: string, verified: Verified): string {
  const data = JSON.parse(rawJson);
  data.author = { ...data.author, verified };
  return JSON.stringify(data, null, 2) + '\n';
}

export interface ClaimResult {
  status: 'ok' | 'already' | 'manual' | 'error';
  entry: string;
  path: string;
  message: string;
}

function writeResult(result: ClaimResult): void {
  fs.writeFileSync(path.resolve(process.cwd(), RESULT_FILE), JSON.stringify(result, null, 2), 'utf-8');
}

function safeReadPath(filePath: string): string {
  const resolved = fs.realpathSync(filePath);
  const isInside = (dir: string) => resolved === dir || resolved.startsWith(dir + path.sep);
  if (!isInside(fs.realpathSync(process.cwd())) && !isInside(fs.realpathSync(os.tmpdir()))) {
    throw new Error(`path '${filePath}' is outside the allowed directory`);
  }
  return resolved;
}

async function main() {
  const [issueFile, opener, issueArg] = process.argv.slice(2);
  const issue = Number(issueArg);
  let entry = '';
  let relPath = '';
  try {
    if (!issueFile || !opener || !Number.isInteger(issue) || issue <= 0) {
      throw new Error('Usage: tsx scripts/claim-entry.ts <issue-body-file> <issue-opener> <issue-number>');
    }
    entry = parseClaimEntry(fs.readFileSync(safeReadPath(issueFile), 'utf-8'));
    const [author, slug] = entry.split('/');
    const file = path.resolve(process.cwd(), 'configs', author, `${slug}.json`);
    relPath = path.relative(process.cwd(), file).replaceAll('\\', '/');
    if (!fs.existsSync(file)) throw new Error(`No entry ${entry} in the registry (looked for ${relPath}).`);

    const raw = fs.readFileSync(file, 'utf-8');
    const data = configSchema.parse(JSON.parse(raw));
    const decision = await decideClaim(data, opener, publicMemberFromEnv);
    if (decision.status !== 'verified') {
      writeResult({ status: decision.status, entry, path: relPath, message: decision.reason });
      console.log(`${decision.status}: ${decision.reason}`);
      return;
    }

    const verified: Verified = { by: opener, at: new Date().toISOString().slice(0, 10), issue };
    const updated = applyClaim(raw, verified);
    configSchema.parse(JSON.parse(updated));
    fs.writeFileSync(file, updated, 'utf-8');
    writeResult({ status: 'ok', entry, path: relPath, message: decision.reason });
    console.log(`✓ ${entry} verified: ${decision.reason}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(message);
    writeResult({ status: 'error', entry, path: relPath, message });
    process.exit(1);
  }
}

if (process.argv[1]?.endsWith('claim-entry.ts')) {
  try {
    await main();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
