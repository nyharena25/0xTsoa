/**
 * Checks who sent an edit or removal request (.github/ISSUE_TEMPLATE/entry-change.yml), so nobody
 * can have an entry taken down or rewritten by claiming to be its author. The opener speaks for the
 * project when they own its GitHub repository, are a public member of the owning organization, or
 * already verified the entry. Run by entry-change.yml, which labels the issue and comments; a
 * maintainer still makes the change.
 *
 *   tsx scripts/entry-change.ts <issue-body-file> <issue-opener>
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { configSchema, type ConfigData } from '../src/lib/schema';
import { parseIssueBody } from './issue-to-config';
import { parseClaimEntry } from './claim-entry';
import { checkOwnership, publicMemberFromEnv, type Ownership, type PublicMemberCheck } from './ownership';

const RESULT_FILE = 'entry-change-result.json';

export type ChangeRequest = 'edit' | 'remove';

export function parseRequest(body: string): ChangeRequest {
  return /remove/i.test(parseIssueBody(body)['Request'] ?? '') ? 'remove' : 'edit';
}

/** Whether `opener` speaks for the entry: its verified author, or the repository owner. */
export async function speaksForEntry(data: ConfigData, opener: string, isPublicMember: PublicMemberCheck): Promise<Ownership> {
  const verified = data.author.verified;
  if (verified && verified.by.toLowerCase() === opener.toLowerCase()) {
    return { owns: true, reason: `@${opener} verified this entry as its author on ${verified.at}.` };
  }
  return checkOwnership(data.source.repo, opener, isPublicMember);
}

/** The comment the bot posts, by request and by whether the opener speaks for the project. */
export function changeComment(request: ChangeRequest, ownership: Ownership): string {
  if (ownership.owns) {
    const next = request === 'remove' ? 'A maintainer will remove the entry.' : 'A maintainer will make the change.';
    return `✓ Request from the project's owner (${ownership.reason}) ${next}`;
  }
  if (request === 'remove') {
    return `This removal request does not come from the project's owner (${ownership.reason}) The entry stays listed unless the repository owner asks, from their own account. A maintainer will still read it as a report.`;
  }
  return `Thanks for the suggestion. It does not come from the project's owner (${ownership.reason}), so a maintainer will check it against the repository before changing anything.`;
}

export interface EntryChangeResult {
  status: 'owner' | 'not-owner' | 'error';
  entry: string;
  request: ChangeRequest;
  message: string;
}

function safeReadPath(filePath: string): string {
  const resolved = fs.realpathSync(filePath);
  const isInside = (dir: string) => resolved === dir || resolved.startsWith(dir + path.sep);
  if (!isInside(fs.realpathSync(process.cwd())) && !isInside(fs.realpathSync(os.tmpdir()))) {
    throw new Error(`path '${filePath}' is outside the allowed directory`);
  }
  return resolved;
}

async function main(): Promise<EntryChangeResult> {
  const [issueFile, opener] = process.argv.slice(2);
  if (!issueFile || !opener) throw new Error('Usage: tsx scripts/entry-change.ts <issue-body-file> <issue-opener>');
  const body = fs.readFileSync(safeReadPath(issueFile), 'utf-8');
  const request = parseRequest(body);
  const entry = parseClaimEntry(body);
  const [author, slug] = entry.split('/');
  const file = path.resolve(process.cwd(), 'configs', author, `${slug}.json`);
  if (!fs.existsSync(file)) throw new Error(`No entry ${entry} in the registry.`);
  const data = configSchema.parse(JSON.parse(fs.readFileSync(file, 'utf-8')));
  const ownership = await speaksForEntry(data, opener, publicMemberFromEnv);
  return { status: ownership.owns ? 'owner' : 'not-owner', entry, request, message: changeComment(request, ownership) };
}

if (process.argv[1]?.endsWith('entry-change.ts')) {
  let result: EntryChangeResult;
  try {
    result = await main();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result = { status: 'error', entry: '', request: 'edit', message: `✖ The request could not be checked: ${message}` };
  }
  fs.writeFileSync(path.resolve(process.cwd(), RESULT_FILE), JSON.stringify(result, null, 2), 'utf-8');
  console.log(`${result.status}: ${result.message}`);
}
