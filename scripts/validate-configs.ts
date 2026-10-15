import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { configSchema, idFromPath, SLUG_RE, readmeRawUrl } from '../src/lib/schema';
import { ALLOWED_IMAGE_HOSTS } from '../site.config';

const checkNetwork = process.argv.includes('--network');

async function checkRemoteUrl(url: string): Promise<{ ok: boolean; status?: number; error?: string }> {
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      headers: { 'User-Agent': '0xTsoa-Validator/1.0' },
      signal: AbortSignal.timeout(8000),
    });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function verifyScriptHash(url: string, expectedSha256: string): Promise<{ match: boolean; actualSha?: string; error?: string }> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': '0xTsoa-Validator/1.0' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      return { match: false, error: `HTTP ${res.status}: ${res.statusText}` };
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 1024 * 1024) {
      return { match: false, error: `Script exceeds 1 MiB limit (${buf.length} bytes)` };
    }
    const hash = crypto.createHash('sha256').update(buf).digest('hex');
    return { match: hash.toLowerCase() === expectedSha256.toLowerCase(), actualSha: hash };
  } catch (err) {
    return { match: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function main() {
  const configsDir = path.resolve(process.cwd(), 'configs');
  if (!fs.existsSync(configsDir)) {
    console.log('No configs/ directory found.');
    return;
  }

  const authors = fs.readdirSync(configsDir);
  let total = 0;
  let errors = 0;

  for (const author of authors) {
    const authorDir = path.join(configsDir, author);
    if (!fs.statSync(authorDir).isDirectory()) continue;

    const files = fs.readdirSync(authorDir).filter((f) => f.endsWith('.json'));
    for (const file of files) {
      total++;
      const filePath = path.join(authorDir, file);
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

      // Check image hosts or local files
      for (const shot of data.screenshots) {
        if (shot.url.startsWith('/') || shot.url.startsWith('./')) {
          const cleanRel = shot.url.replace(/^\/0xtsoa\//, '').replace(/^\//, '');
          const localPath = path.resolve(process.cwd(), 'public', cleanRel);
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

      // Network checks if enabled
      if (checkNetwork) {
        console.log(`  → Running remote network verification...`);

        // Check remote screenshots
        for (const shot of data.screenshots) {
          if (shot.url.startsWith('/') || shot.url.startsWith('./')) continue;
          const res = await checkRemoteUrl(shot.url);
          if (!res.ok) {
            console.error(`  ✖ Screenshot URL unreachable (${res.status || res.error}): ${shot.url}`);
            errors++;
          }
        }

        // Check install script
        if (data.install.script) {
          const { match, actualSha, error } = await verifyScriptHash(
            data.install.script.url,
            data.install.script.sha256,
          );
          if (error) {
            console.error(`  ✖ Failed to download or verify install script: ${error}`);
            errors++;
          } else if (!match) {
            console.error(`  ✖ SHA-256 hash mismatch! Declared: ${data.install.script.sha256}, Actual: ${actualSha}`);
            errors++;
          } else {
            console.log(`  ✓ Script SHA-256 verified successfully (${actualSha?.substring(0, 8)}...)`);
          }
        }

        // Check README
        const readmeUrl = readmeRawUrl(data.source);
        const readmeRes = await checkRemoteUrl(readmeUrl);
        if (!readmeRes.ok) {
          console.warn(`  ⚠ Remote README not accessible (${readmeRes.status || readmeRes.error}): ${readmeUrl}`);
        }
      }

      console.log(`  ✓ Pass: ${data.name} (${parsedPath.id})`);
    }
  }

  console.log(`\n----------------------------------------`);
  console.log(`Total configs checked: ${total}`);
  if (errors > 0) {
    console.error(`Found ${errors} error(s). Validation failed.`);
    process.exit(1);
  } else {
    console.log(`All configs passed validation! ✓`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
