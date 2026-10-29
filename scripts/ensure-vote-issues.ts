import fs from 'node:fs';
import path from 'node:path';
import { REPO_OWNER, REPO_NAME, VOTE_LABEL, voteIssueTitle } from '../site.config';
import { listVoteIssues, voteIssueBody, isVoteIssueUpToDate, type VoteIssue } from '../src/lib/votes';
import { mapPool } from './pool';

/**
 * Ensures every configs/<author>/<slug>.json has one GitHub issue that collects its votes,
 * and keeps existing vote issues closed with their canonical SITE_URL link up to date.
 * New vote issues are closed right after creation, so the repository's open issues stay for real
 * reports. Closed issues still take 👍 reactions, and votes are read from open and closed issues alike.
 */
/** Opens the vote issue of one config and closes it right away (closed, never locked: locking would stop non-collaborators from reacting). */
async function createVoteIssue(api: string, headers: Record<string, string>, id: string): Promise<void> {
  const body = voteIssueBody(id);
  const res = await fetch(`${api}/issues`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ title: voteIssueTitle(id), body, labels: [VOTE_LABEL] }),
  });
  if (!res.ok) {
    console.log(`✖ Failed for ${id}: ${res.status} ${await res.text()}`);
    return;
  }
  const { number } = (await res.json()) as { number: number };
  const closeRes = await fetch(`${api}/issues/${number}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ state: 'closed', state_reason: 'completed' }),
  });
  if (closeRes.ok) console.log(`✓ Vote issue #${number} created (closed) for ${id}`);
  else console.log(`⚠ Vote issue #${number} created for ${id} but left open: ${closeRes.status} ${await closeRes.text()}`);
}

/** Updates an existing vote issue whose body still points to an old domain or that was left open. */
async function updateVoteIssue(api: string, headers: Record<string, string>, id: string, issue: VoteIssue): Promise<void> {
  const res = await fetch(`${api}/issues/${issue.number}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({
      body: voteIssueBody(id),
      state: 'closed',
      state_reason: 'completed',
    }),
  });
  if (res.ok) console.log(`✓ Vote issue #${issue.number} updated for ${id}`);
  else console.log(`⚠ Vote issue #${issue.number} update failed for ${id}: ${res.status} ${await res.text()}`);
}

async function main() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.log('ℹ GITHUB_TOKEN not provided. Skipping ensure-vote-issues.');
    return;
  }
  const owner = process.env.REPO_OWNER || REPO_OWNER;
  const repo = process.env.REPO_NAME || REPO_NAME;
  const api = `https://api.github.com/repos/${owner}/${repo}`;
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'User-Agent': '0xTsoa-Vote-Issues/1.0',
    'Content-Type': 'application/json',
  };

  const configsDir = path.resolve(process.cwd(), 'configs');
  const configIds = fs
    .readdirSync(configsDir)
    .filter((a) => fs.statSync(path.join(configsDir, a)).isDirectory())
    .flatMap((a) =>
      fs.readdirSync(path.join(configsDir, a))
        .filter((f) => f.endsWith('.json'))
        .map((f) => `${a}/${f.replace(/\.json$/, '')}`),
    );

  // Throws on API failure: never create issues from an incomplete listing.
  const issues = await listVoteIssues(owner, repo, token);
  const existingByTitle = new Map<string, VoteIssue>();
  for (const issue of issues) {
    const title = issue.title.trim();
    if (!existingByTitle.has(title)) existingByTitle.set(title, issue);
  }
  const missing = configIds.filter((id) => !existingByTitle.has(voteIssueTitle(id)));
  const outdated = configIds
    .map((id) => ({ id, issue: existingByTitle.get(voteIssueTitle(id)) }))
    .filter((entry): entry is { id: string; issue: VoteIssue } => Boolean(entry.issue) && !isVoteIssueUpToDate(entry.issue!, entry.id));

  console.log(`${configIds.length} configs, ${missing.length} without a vote issue, ${outdated.length} needing canonical URL/state update.`);
  if (missing.length === 0 && outdated.length === 0) return;

  if (missing.length > 0) {
    // Create the label explicitly (422 = already exists).
    const labelRes = await fetch(`${api}/labels`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: VOTE_LABEL, color: '18181b', description: 'Community upvotes for a configuration' }),
    });
    if (!labelRes.ok && labelRes.status !== 422) throw new Error(`Cannot create label: ${labelRes.status}`);

    // One issue at a time: GitHub's secondary rate limits ask for serial writes.
    await mapPool(missing, 1, (id) => createVoteIssue(api, headers, id));
  }

  if (outdated.length > 0) {
    await mapPool(outdated, 1, ({ id, issue }) => updateVoteIssue(api, headers, id, issue));
  }
}

try {
  await main();
} catch (err) {
  console.error(err);
  process.exit(1);
}
