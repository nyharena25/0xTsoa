/**
 * Lists the files and folders of a repository at one commit or tag, without downloading their
 * contents (depth-1, blobless fetch into a throwaway directory). Works on any Git forge and
 * needs no API token. Used to check that install steps only use paths the pinned version has.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { GIT } from './git-path';

const run = promisify(execFile);

async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await run(GIT, args, {
    cwd,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    timeout: 120_000,
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout;
}

export async function listRepoTree(repo: string, ref: string): Promise<Set<string>> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), '0xtsoa-tree-'));
  try {
    await git(['init', '-q'], dir);
    await git(['fetch', '-q', '--depth=1', '--filter=blob:none', repo, ref], dir);
    const out = await git(['ls-tree', '-r', '-t', '--name-only', 'FETCH_HEAD'], dir);
    return new Set(out.split('\n').filter(Boolean));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** The paths an install step uses that the repository does not have. */
export function missingRepoPaths(paths: string[], tree: Set<string>): string[] {
  return paths.filter((p) => !tree.has(p));
}
