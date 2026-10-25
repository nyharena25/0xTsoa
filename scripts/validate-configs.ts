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
} from '../src/lib/schema';
import { fetchLimited, SCRIPT_HOSTS } from '../src/lib/fetch-limited';
import { listRepoTree, missingRepoPaths } from './repo-tree';
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

async function main() {
  const flags = parseCliArgs(process.argv.slice(2));
  const configsDir = path.resolve(process.cwd(), 'configs');
  if (!fs.existsSync(configsDir)) {
    console.log('No configs/ directory found.');
    return;
  }

  const allConfigFiles = collectAllConfigFiles(configsDir);
  let total = 0;
  let errors = 0;
  let lintWarnings = 0;

  // Check duplicate IDs and case collisions across all configs/*/
  const collisions = detectIdCollisions(allConfigFiles);
  for (const collision of collisions) {
    console.error(`  ✖ ${collision}`);
    errors++;
  }

  const targetFiles =
    flags.only.length > 0
      ? flags.only
          .map((f) => path.resolve(process.cwd(), f))
          .filter((f) => fs.existsSync(f) && f.endsWith('.json'))
      : allConfigFiles;

  for (const filePath of targetFiles) {
    total++;
    const errorsBefore = errors;
    const parsedPath = idFromPath(filePath);

    console.log(`\nValidating: ${filePath}`);

    if (!parsedPath) {
      console.error(`  ✖ Invalid file path format: ${filePath}`);
      errors++;
      continue;
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
      errors++;
      continue;
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
      errors++;
      continue;
    }

    const data = parsed.data;

    const cloneValidation = validateCloneSteps(data);
    for (const warn of cloneValidation.warnings) {
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

    // Check image hosts or local files
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

    // Script hash checks (--scripts or --network)
    const script = data.install?.script;
    if ((flags.scripts || flags.network) && script) {
      console.log(`  → Verifying install.script SHA-256...`);
      const { match, actualSha, error } = await verifyScriptHash(
        script.url,
        script.sha256,
      );
      if (error) {
        console.error(`  ✖ Failed to download or verify install script: ${error}`);
        errors++;
      } else if (!match) {
        console.error(`  ✖ SHA-256 hash mismatch! Declared: ${script.sha256}, Actual: ${actualSha}`);
        errors++;
      } else {
        console.log(`  ✓ Script SHA-256 verified successfully (${actualSha?.substring(0, 8)}...)`);
      }
    }

    // Full network checks (--network)
    if (flags.network) {
      console.log(`  → Running remote network verification...`);

      // Check remote screenshots
      for (const shot of data.screenshots) {
        if (shot.url.startsWith('/') || shot.url.startsWith('./')) continue;
        const res = await checkRemoteUrl(shot.url, SCREENSHOT_FETCH_HOSTS, SCREENSHOT_MAX_BYTES);
        if (!res.ok) {
          console.error(`  ✖ Screenshot URL unreachable (${res.status || res.error}): ${shot.url}`);
          errors++;
        }
      }

      // Check README
      const readmeUrl = readmeRawUrl(data.source);
      const readmeRes = await checkRemoteUrl(readmeUrl, SCRIPT_HOSTS, SCREENSHOT_MAX_BYTES);
      if (!readmeRes.ok) {
        console.warn(`  ⚠ Remote README not accessible (${readmeRes.status || readmeRes.error}): ${readmeUrl}`);
      }

      // Every repository path the install steps use must exist at the pinned version.
      const repoPaths = repoPathsInSteps(data);
      if (repoPaths.length > 0) {
        try {
          const missing = missingRepoPaths(repoPaths, await listRepoTree(data.source.repo, data.source.ref));
          for (const p of missing) {
            console.error(`  ✖ Install steps use ${p}, which does not exist in ${data.source.repo} at ${data.source.ref}`);
            errors++;
          }
        } catch (err) {
          console.warn(`  ⚠ Could not list the repository files at ${data.source.ref}: ${(err as Error).message.split('\n')[0]}`);
        }
      }
    }

    if (errors === errorsBefore) {
      console.log(`  ✓ Pass: ${data.name} (${parsedPath.id})`);
    }
  }

  console.log(`\n----------------------------------------`);
  console.log(`Total configs checked: ${total}`);
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

if (process.argv[1] && process.argv[1].endsWith('validate-configs.ts')) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
