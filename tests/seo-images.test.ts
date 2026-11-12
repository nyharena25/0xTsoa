import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

describe('Image Alt Attribute Regression Guardrails', () => {
  const distDir = path.resolve(process.cwd(), 'dist');

  beforeAll(() => {
    if (!fs.existsSync(distDir)) {
      execSync('npm run build:site', { stdio: 'inherit' });
    }
  }, 45000);

  it('guarantees no rendered HTML page in dist/ has missing or empty image alt attributes', () => {
    expect(fs.existsSync(distDir), 'dist directory must exist').toBe(true);

    const htmlFiles: string[] = [];
    function walk(dir: string) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.name.endsWith('.html')) {
          htmlFiles.push(full);
        }
      }
    }
    walk(distDir);

    expect(htmlFiles.length).toBeGreaterThanOrEqual(190);

    const imgTagRegex = /<img\b([^>]*?)\/?>/gi;
    const altRegex = /\balt=(?:(["'])(.*?)\1|([^\s>]+))/i;

    const violations: { file: string; tag: string }[] = [];

    for (const file of htmlFiles) {
      const raw = fs.readFileSync(file, 'utf-8');
      const content = raw.replace(/<!--[\s\S]*?-->/g, '');
      let match: RegExpExecArray | null;

      while ((match = imgTagRegex.exec(content)) !== null) {
        const tag = match[0];
        const altMatch = altRegex.exec(tag);

        if (!altMatch) {
          violations.push({ file: path.relative(distDir, file), tag });
        } else {
          const altVal = (altMatch[2] ?? altMatch[3] ?? '').trim();
          if (altVal === '') {
            violations.push({ file: path.relative(distDir, file), tag });
          }
        }
      }
    }

    expect(
      violations,
      `Found ${violations.length} images with missing/empty alt attributes:\n${JSON.stringify(violations.slice(0, 5), null, 2)}`
    ).toHaveLength(0);
  });
});
