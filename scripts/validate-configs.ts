import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import dns from 'node:dns';

dns.setDefaultResultOrder('ipv4first');
import {
  configSchema,
  idFromPath,
  SLUG_RE,
  readmeRawUrl,
  validateCloneSteps,
  normalizeRepoUrl,
  repoPathsInSteps,
  type CloneValidationResult,
  type ConfigData,
} from '../src/lib/schema';
import { fetchLimited, SCRIPT_HOSTS } from '../src/lib/fetch-limited';
import { listRepoTree, missingRepoPaths } from './repo-tree';
import { mapPool } from './pool';
import { lintInstallSteps, formatLintIssue } from '../src/lib/install-lint';
import { ALLOWED_IMAGE_HOSTS, BASE_PATH, REPO_NAME } from '../site.config';

export { validateCloneSteps, normalizeRepoUrl, type CloneValidationResult };

export const SCREENSHOT_FETCH_HOSTS = [
  ...ALLOWED_IMAGE_HOSTS,
  'objects.githubusercontent.com',
  'github-production-user-asset-*.s3.amazonaws.com',
] as const;

const SCREENSHOT_MAX_BYTES = 64 * 1024;
const SCRIPT_MAX_BYTES = 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 10_000;
const SCRIPT_TIMEOUT_MS = 10_000;
const VALIDATOR_HEADERS = { 'User-Agent': '0xTsoa-Validator/1.0' };

export interface CliFlags {
  network: boolean;
  scripts: boolean;
  only: string[];
}

export function parseCliArgs(argv: string[]): CliFlags {
  let network = false;
  let scripts = false;
  const only: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--network') {
      network = true;
    } else if (arg === '--scripts') {
      scripts = true;
    } else if (arg === '--only') {
      while (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        i++;
        if (argv[i].trim()) {
          only.push(argv[i].trim());
        }
      }
    }
  }

  return { network, scripts, only };
}

function isTimeoutError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (/exceeds \d+ bytes/i.test(err.message)) return false;
  const causeMsg =
    err.cause instanceof Error
      ? `${err.cause.name} ${err.cause.message} ${(err.cause as { code?: string }).code ?? ''}`
      : String(err.cause ?? '');
  return (
    err.name === 'TimeoutError' ||
    err.name === 'AbortError' ||
    /timed?\s*out|timeout|fetch failed/i.test(err.message) ||
    /timed?\s*out|timeout|ETIMEDOUT|ECONNRESET/i.test(causeMsg)
  );
}

async function withTimeoutRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (isTimeoutError(err)) {
      return await fn();
    }
    throw err;
  }
}

export async function checkRemoteUrl(
  url: string,
  allowedHosts: readonly string[] = SCREENSHOT_FETCH_HOSTS,
  maxBytes: number = SCREENSHOT_MAX_BYTES,
): Promise<{ ok: boolean; status?: number; error?: string }> {
  try {
    const res = await withTimeoutRetry(() =>
      fetchLimited(url, {
        maxBytes,
        timeoutMs: DEFAULT_TIMEOUT_MS,
        allowedHosts,
        headers: VALIDATOR_HEADERS,
      }),
    );
    return { ok: res.status >= 200 && res.status < 300, status: res.status };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/exceeds \d+ bytes/i.test(msg)) {
      return { ok: true, status: 200 };
    }
    return { ok: false, error: msg };
  }
}

export async function verifyScriptHash(
  url: string,
  expectedSha256: string,
): Promise<{ match: boolean; actualSha?: string; error?: string }> {
  try {
    const res = await withTimeoutRetry(() =>
      fetchLimited(url, {
        maxBytes: SCRIPT_MAX_BYTES,
        timeoutMs: SCRIPT_TIMEOUT_MS,
        allowedHosts: SCRIPT_HOSTS,
        headers: VALIDATOR_HEADERS,
      }),
    );
    if (res.status < 200 || res.status >= 300) {
      return { match: false, error: `HTTP ${res.status}` };
    }
    const hash = crypto.createHash('sha256').update(res.body).digest('hex');
    return { match: hash.toLowerCase() === expectedSha256.toLowerCase(), actualSha: hash };
  } catch (err) {
    return { match: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function resolveLocalScreenshotPath(shotUrl: string, basePath: string = BASE_PATH): string {
  const prefixes = [
    basePath ? `${basePath.replace(/\/$/, '')}/` : '',
    `/${REPO_NAME}/`,
  ].filter(Boolean);

  let stripped = shotUrl;
  for (const prefix of prefixes) {
    if (stripped.startsWith(prefix)) {
      stripped = stripped.slice(prefix.length);
      break;
    }
  }
  const cleanRel = stripped.replace(/^\.?\//, '');
  return path.resolve(process.cwd(), 'public', cleanRel);
}

export function detectIdCollisions(filePaths: string[]): string[] {
  const seen = new Map<string, { id: string; filePath: string }>();
  const collisionErrors: string[] = [];

  for (const filePath of filePaths) {
    const parsed = idFromPath(filePath);
    if (!parsed) continue;
    const lowerId = parsed.id.toLowerCase();
    const existing = seen.get(lowerId);
    if (existing) {
      collisionErrors.push(
        `Duplicate or case-colliding config ID '${parsed.id}' (${filePath}) collides with '${existing.id}' (${existing.filePath})`,
      );
    } else {
      seen.set(lowerId, { id: parsed.id, filePath });
    }
  }

  return collisionErrors;
}

function collectAllConfigFiles(configsDir: string): string[] {
  const allFiles: string[] = [];
  const authors = fs.readdirSync(configsDir).sort();
  for (const author of authors) {
    const authorDir = path.join(configsDir, author);
    if (!fs.statSync(authorDir).isDirectory()) continue;
    const files = fs
      .readdirSync(authorDir)
      .filter((f) => f.endsWith('.json'))
      .sort();
    for (const file of files) {
      allFiles.push(path.join(authorDir, file));
    }
  }
  return allFiles;
}

type Script = NonNullable<NonNullable<ConfigData['install']>['script']>;

/** Allowed screenshot hosts, or existing local files. Returns the number of errors. */
function checkScreenshotSources(data: ConfigData): number {
  let errors = 0;
  for (const shot of data.screenshots) {
    if (shot.url.startsWith('/') || shot.url.startsWith('./')) {
      const localPath = resolveLocalScreenshotPath(shot.url);
      if (!fs.existsSync(localPath)) {
        console.error(`  ✖ Local screenshot file not found: ${localPath}`);
        errors++;
      }
      continue;
    }
    try {
      const u = new URL(shot.url);
      if (!(ALLOWED_IMAGE_HOSTS as readonly string[]).includes(u.hostname)) {
        console.error(`  ✖ Screenshot hostname not in allowlist: ${u.hostname}`);
        errors++;
      }
    } catch {
      console.error(`  ✖ Malformed screenshot URL: ${shot.url}`);
      errors++;
    }
  }
  return errors;
}

/** install.script must still hash to its recorded SHA-256 (--scripts or --network). */
async function checkScriptHash(script: Script): Promise<number> {
  console.log(`  → Verifying install.script SHA-256...`);
  const { match, actualSha, error } = await verifyScriptHash(script.url, script.sha256);
  if (error) {
    console.error(`  ✖ Failed to download or verify install script: ${error}`);
    return 1;
  }
  if (!match) {
    console.error(`  ✖ SHA-256 hash mismatch! Declared: ${script.sha256}, Actual: ${actualSha}`);
    return 1;
  }
  console.log(`  ✓ Script SHA-256 verified successfully (${actualSha?.substring(0, 8)}...)`);
  return 0;
}

/** Every repository path the install steps use must exist at the pinned version. */
async function checkRepoPaths(data: ConfigData): Promise<number> {
  const repoPaths = repoPathsInSteps(data);
  if (repoPaths.length === 0) return 0;
  try {
    const missing = missingRepoPaths(repoPaths, await listRepoTree(data.source.repo, data.source.ref));
    for (const p of missing) {
      console.error(`  ✖ Install steps use ${p}, which does not exist in ${data.source.repo} at ${data.source.ref}`);
    }
    return missing.length;
  } catch (err) {
    console.warn(`  ⚠ Could not list the repository files at ${data.source.ref}: ${(err as Error).message.split('\n')[0]}`);
    return 0;
  }
}

/** Full remote checks (--network): screenshots reachable, README readable, repository paths present. */
async function checkNetwork(data: ConfigData): Promise<number> {
  console.log(`  → Running remote network verification...`);
  const remoteShots = data.screenshots.filter((shot) => !shot.url.startsWith('/') && !shot.url.startsWith('./'));
  const results = await Promise.all(remoteShots.map((shot) => checkRemoteUrl(shot.url, SCREENSHOT_FETCH_HOSTS, SCREENSHOT_MAX_BYTES)));
  let errors = 0;
  results.forEach((res, i) => {
    if (res.ok) return;
    console.error(`  ✖ Screenshot URL unreachable (${res.status || res.error}): ${remoteShots[i].url}`);
    errors++;
  });

  const readmeUrl = readmeRawUrl(data.source);
  const readmeRes = await checkRemoteUrl(readmeUrl, SCRIPT_HOSTS, SCREENSHOT_MAX_BYTES);
  if (!readmeRes.ok) {
    console.warn(`  ⚠ Remote README not accessible (${readmeRes.status || readmeRes.error}): ${readmeUrl}`);
  }
  return errors + (await checkRepoPaths(data));
}

/** Validates one config file and prints what it finds. */
async function validateFile(filePath: string, flags: CliFlags): Promise<{ errors: number; lintWarnings: number }> {
  let errors = 0;
  let lintWarnings = 0;
  const parsedPath = idFromPath(filePath);
  console.log(`\nValidating: ${filePath}`);

  if (!parsedPath) {
    console.error(`  ✖ Invalid file path format: ${filePath}`);
    return { errors: 1, lintWarnings };
  }
  if (!SLUG_RE.test(parsedPath.slug)) {
    console.error(`  ✖ Invalid slug '${parsedPath.slug}' in path. Must match ^[a-z0-9][a-z0-9-]{2,47}$`);
    errors++;
  }

  let jsonRaw: any;
  try {
    jsonRaw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (err) {
    console.error(`  ✖ Invalid JSON:`, err);
    return { errors: errors + 1, lintWarnings };
  }

  if (jsonRaw.author?.github && jsonRaw.author.github.toLowerCase() !== parsedPath.author.toLowerCase()) {
    console.error(`  ✖ Folder author '${parsedPath.author}' does not match author.github '${jsonRaw.author.github}'`);
    errors++;
  }

  const parsed = configSchema.safeParse(jsonRaw);
  if (!parsed.success) {
    console.error(`  ✖ Schema validation failed:`);
    for (const issue of parsed.error.issues) {
      console.error(`    - [${issue.path.join('.')}] ${issue.message}`);
    }
    return { errors: errors + 1, lintWarnings };
  }
  const data = parsed.data;

  for (const warn of validateCloneSteps(data).warnings) {
    console.warn(`  ⚠ ${warn}`);
  }

  // The install-step standard (docs/INSTALL-STANDARD.md). Warnings are printed in full for the
  // entries a pull request changes (--only), and counted on full runs.
  for (const issue of lintInstallSteps(data)) {
    if (issue.severity === 'error') {
      console.error(`  ✖ ${formatLintIssue(issue)}`);
      errors++;
    } else {
      lintWarnings++;
      if (flags.only.length > 0) console.warn(`  ⚠ ${formatLintIssue(issue)}`);
    }
  }

  errors += checkScreenshotSources(data);
  const script = data.install?.script;
  if ((flags.scripts || flags.network) && script) errors += await checkScriptHash(script);
  if (flags.network) errors += await checkNetwork(data);

  if (errors === 0) console.log(`  ✓ Pass: ${data.name} (${parsedPath.id})`);
  return { errors, lintWarnings };
}

async function main() {
  const flags = parseCliArgs(process.argv.slice(2));
  const configsDir = path.resolve(process.cwd(), 'configs');
  if (!fs.existsSync(configsDir)) {
    console.log('No configs/ directory found.');
    return;
  }

  const allConfigFiles = collectAllConfigFiles(configsDir);

  // Check duplicate IDs and case collisions across all configs/*/
  const collisions = detectIdCollisions(allConfigFiles);
  for (const collision of collisions) {
    console.error(`  ✖ ${collision}`);
  }

  const targetFiles =
    flags.only.length > 0
      ? flags.only
          .map((f) => path.resolve(process.cwd(), f))
          .filter((f) => fs.existsSync(f) && f.endsWith('.json'))
      : allConfigFiles;

  // One file at a time, so each file's output stays together.
  const results = await mapPool(targetFiles, 1, (f) => validateFile(f, flags));
  const errors = collisions.length + results.reduce((n, r) => n + r.errors, 0);
  const lintWarnings = results.reduce((n, r) => n + r.lintWarnings, 0);

  console.log(`\n----------------------------------------`);
  console.log(`Total configs checked: ${targetFiles.length}`);
  if (lintWarnings > 0 && flags.only.length === 0) {
    console.log(`${lintWarnings} install-step warning(s); run with --only <file> to see an entry's warnings.`);
  }
  if (errors > 0) {
    console.error(`Found ${errors} error(s). Validation failed.`);
    process.exit(1);
  } else {
    console.log(`All configs passed validation! ✓`);
  }
}

if (process.argv[1]?.endsWith('validate-configs.ts')) {
  try {
    await main();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
