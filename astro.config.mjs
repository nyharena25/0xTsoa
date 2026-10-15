import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { SITE_URL, BASE_PATH, ALLOWED_IMAGE_HOSTS } from './site.config';

export default defineConfig({
  site: SITE_URL,
  base: BASE_PATH || '/',
  output: 'static',
  integrations: [sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
  image: {
    domains: [...ALLOWED_IMAGE_HOSTS],
  },
});
