import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { SITE_URL, BASE_PATH, ALLOWED_IMAGE_HOSTS } from './site.config';

export default defineConfig({
  site: SITE_URL,
  base: BASE_PATH || '/',
  output: 'static',
  // /contribuer/ is a legacy redirect page, keep it out of the index.
  integrations: [sitemap({ filter: (page) => !page.includes('/contribuer') })],
  vite: {
    plugins: [tailwindcss()],
  },
  image: {
    domains: [...ALLOWED_IMAGE_HOSTS],
  },
});
