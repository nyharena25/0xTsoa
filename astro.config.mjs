import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { SITE_URL, BASE_PATH, ALLOWED_IMAGE_HOSTS, withBase } from './site.config';

const configLastMod = new Map();
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
          const slug = file.replace(/\.json$/, '');
          const url = new URL(withBase(`/configs/${author}/${slug}/`), SITE_URL).href;
          configLastMod.set(url, raw.updatedAt);
        }
      } catch {}
    }
  }
}

export default defineConfig({
  site: SITE_URL,
  base: BASE_PATH || '/',
  output: 'static',
  // /contribuer/ is a legacy redirect page, keep it out of the index.
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/contribuer'),
      serialize(item) {
        const lastmod = configLastMod.get(item.url);
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
        "connect-src 'self' https://*.google-analytics.com https://www.googletagmanager.com",
        "object-src 'none'",
        "base-uri 'self'",
        "frame-ancestors 'none'",
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
