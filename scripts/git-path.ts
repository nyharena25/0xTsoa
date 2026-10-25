import fs from 'node:fs';

/**
 * git from a fixed system folder, never looked up on PATH: a writable folder early on PATH could
 * otherwise put its own `git` in front of the real one.
 */
const GIT_CANDIDATES = ['/usr/bin/git', '/usr/local/bin/git', '/bin/git', '/opt/homebrew/bin/git'];

export const GIT = GIT_CANDIDATES.find((p) => fs.existsSync(p)) ?? GIT_CANDIDATES[0];
