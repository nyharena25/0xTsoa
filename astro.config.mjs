import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import mdx from '@astrojs/mdx';
import tailwindcss from '@tailwindcss/vite';
import { SITE_URL, BASE_PATH, ALLOWED_IMAGE_HOSTS, withBase } from './site.config';
import { TOPICS, topicEntries, topicModified, topicPath } from './src/lib/topics';

// Sitemap lastmod per page URL: config pages from updatedAt, topic pages from topicModified,
// guides from their `updated` frontmatter, and /docs/ from the latest of those.
const lastMod = new Map();
const pageUrl = (p) => new URL(withBase(p), SITE_URL).href;
const configs = [];
const configsDir = path.resolve(process.cwd(), 'configs');
if (fs.existsSync(configsDir)) {
  for (const author of fs.readdirSync(configsDir)) {
    const authorDir = path.join(configsDir, author);
    if (!fs.statSync(authorDir).isDirectory()) continue;
    for (const file of fs.readdirSync(authorDir)) {
      if (!file.endsWith('.json')) continue;
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(authorDir, file), 'utf-8'));
        if (typeof raw.updatedAt === 'string') {
          lastMod.set(pageUrl(`/configs/${author}/${file.replace(/\.json$/, '')}/`), raw.updatedAt);
          configs.push({ data: raw });
        }
      } catch {}
    }
  }
}
const docsDates = [];
for (const topic of TOPICS) {
  const date = topicModified(topic, topicEntries(topic, configs));
  lastMod.set(pageUrl(topicPath(topic.slug)), date);
  docsDates.push(date);
}
const guidesDir = path.resolve(process.cwd(), 'guides');
if (fs.existsSync(guidesDir)) {
  for (const file of fs.readdirSync(guidesDir)) {
    if (!/^[a-z0-9][a-z0-9-]*\.mdx$/.test(file)) continue;
    const text = fs.readFileSync(path.join(guidesDir, file), 'utf-8');
    const updated = text.match(/^updated:\s*['"]?(\d{4}-\d{2}-\d{2})/m)?.[1];
    if (!updated || /^draft:\s*true\b/m.test(text)) continue;
    lastMod.set(pageUrl(topicPath(file.replace(/\.mdx$/, ''))), updated);
    docsDates.push(updated);
  }
}
if (docsDates.length) lastMod.set(pageUrl('/docs/'), docsDates.sort().at(-1));

export default defineConfig({
  site: SITE_URL,
  base: BASE_PATH || '/',
  output: 'static',
  // /contribuer/ is a legacy redirect page, keep it out of the index.
  // Prism marks code with classes; Shiki's inline styles would be blocked by the CSP below.
  markdown: {
    syntaxHighlight: 'prism',
  },
  integrations: [
    mdx(),
    sitemap({
      filter: (page) => !page.includes('/contribuer') && !page.endsWith('.sh') && !page.endsWith('.txt'),
      serialize(item) {
        const lastmod = lastMod.get(item.url);
        if (lastmod) {
          item.lastmod = lastmod;
        }
        return item;
      },
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
  image: {
    domains: [...ALLOWED_IMAGE_HOSTS],
  },
  security: {
    csp: {
      directives: [
        "default-src 'self'",
        "img-src 'self' https: data:",
        // Vite inlines small woff2 subsets as data: URIs.
        "font-src 'self' data:",
        "connect-src 'self' https://*.google-analytics.com https://www.googletagmanager.com",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ],
      styleDirective: {
        resources: ["'self'", "'unsafe-inline'"],
      },
      scriptDirective: {
        resources: ["'self'", 'https://www.googletagmanager.com'],
      },
    },
  },
});
