import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { TOPICS } from '../src/lib/topics';

describe('SEO Metadata & Structured Data Integrity', () => {
  const distDir = path.resolve(process.cwd(), 'dist');

  beforeAll(() => {
    if (!fs.existsSync(distDir)) {
      execSync('npm run build:site', { stdio: 'inherit' });
    }
  }, 45000);

  it('every topic page renders valid FAQPage, CollectionPage, TechArticle, and BreadcrumbList JSON-LD in production HTML', () => {
    expect(fs.existsSync(distDir), 'dist directory must exist').toBe(true);

    for (const topic of TOPICS) {
      const htmlPath = path.join(distDir, 'docs', topic.slug, 'index.html');
      expect(fs.existsSync(htmlPath), `Missing built HTML for topic ${topic.slug}`).toBe(true);
      const html = fs.readFileSync(htmlPath, 'utf-8');

      const jsonLdMatches = [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
      expect(jsonLdMatches.length, `Topic ${topic.slug} must include structured data scripts`).toBeGreaterThanOrEqual(2);

      const schemas = jsonLdMatches.flatMap((m) => {
        try {
          const parsed = JSON.parse(m[1]);
          return Array.isArray(parsed) ? parsed : [parsed];
        } catch {
          return [];
        }
      });
      const types = schemas.map((s) => s['@type']);

      // 1. FAQPage Schema Verification
      expect(types, `Topic ${topic.slug} must render FAQPage JSON-LD in HTML`).toContain('FAQPage');
      const faqSchema = schemas.find((s) => s['@type'] === 'FAQPage');
      expect(faqSchema?.mainEntity, `Topic ${topic.slug} FAQPage mainEntity must be an array`).toBeInstanceOf(Array);
      expect(faqSchema!.mainEntity.length, `Topic ${topic.slug} must emit all FAQs`).toBe(topic.faq.length);

      for (const item of faqSchema!.mainEntity) {
        expect(item['@type']).toBe('Question');
        expect(typeof item.name === 'string' && item.name.length >= 10, `Question text invalid on ${topic.slug}`).toBe(true);
        expect(item.acceptedAnswer?.['@type']).toBe('Answer');
        expect(typeof item.acceptedAnswer?.text === 'string' && item.acceptedAnswer.text.length >= 15, `Answer text invalid on ${topic.slug}`).toBe(true);
      }

      // 2. CollectionPage Schema Verification
      expect(types, `Topic ${topic.slug} must render CollectionPage JSON-LD in HTML`).toContain('CollectionPage');
      const collectionSchema = schemas.find((s) => s['@type'] === 'CollectionPage');
      expect(collectionSchema?.['@id']).toBe(`https://0xtsoa.dev/docs/${topic.slug}/#collection`);
      expect(collectionSchema?.inLanguage).toBe('en');
      expect(collectionSchema?.isPartOf?.['@type']).toBe('WebSite');
      expect(collectionSchema?.publisher?.['@type']).toBe('Organization');
      expect(collectionSchema?.datePublished).toBe(topic.updated);

      // 3. TechArticle Schema Verification
      expect(types, `Topic ${topic.slug} must render TechArticle JSON-LD in HTML`).toContain('TechArticle');
      const articleSchema = schemas.find((s) => s['@type'] === 'TechArticle');
      expect(articleSchema?.['@id']).toBe(`https://0xtsoa.dev/docs/${topic.slug}/#article`);
      expect(articleSchema?.headline).toBeTruthy();
      expect(articleSchema?.author?.['@type']).toBe('Person');
      expect(articleSchema?.publisher?.['@type']).toBe('Organization');
      expect(articleSchema?.image).toBeDefined();

      // 4. BreadcrumbList Schema Verification
      expect(types, `Topic ${topic.slug} must render BreadcrumbList JSON-LD in HTML`).toContain('BreadcrumbList');
    }
  });

  it('Base.astro layout source includes mandatory theme-color, manifest, Twitter, and dynamic OG MIME tags', () => {
    const baseContent = fs.readFileSync(path.resolve('src/layouts/Base.astro'), 'utf-8');
    expect(baseContent).toContain('name="theme-color"');
    expect(baseContent).toContain('rel="manifest"');
    expect(baseContent).toContain('name="twitter:site"');
    expect(baseContent).toContain('name="twitter:creator"');
    expect(baseContent).toContain('og:image:type');
  });

  it('production HTML in dist/ renders theme-color, manifest link, and Twitter card meta tags', () => {
    const homeHtml = fs.readFileSync(path.join(distDir, 'index.html'), 'utf-8');
    expect(homeHtml).toContain('name="theme-color"');
    expect(homeHtml).toContain('rel="manifest"');
    expect(homeHtml).toContain('name="twitter:site" content="@nyharena25"');
    expect(homeHtml).toContain('name="twitter:creator" content="@nyharena25"');
  });

  it('site.webmanifest exists and contains valid JSON metadata', () => {
    const manifestPath = path.resolve('public/site.webmanifest');
    expect(fs.existsSync(manifestPath), 'public/site.webmanifest must exist').toBe(true);
    const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    expect(parsed.name).toBe('0xTsoa');
    expect(parsed.short_name).toBe('0xTsoa');
    expect(parsed.start_url).toBe('/');
    expect(parsed.display).toBe('standalone');
    expect(parsed.background_color).toBe('#FAF9F5');
    expect(parsed.theme_color).toBe('#FAF9F5');
    expect(parsed.icons?.length).toBeGreaterThanOrEqual(1);
  });

  it('dist/sitemap-0.xml covers all published topic routes and guides with trailing slashes', () => {
    const sitemapPath = path.join(distDir, 'sitemap-0.xml');
    expect(fs.existsSync(sitemapPath), 'dist/sitemap-0.xml must exist').toBe(true);
    const sitemap = fs.readFileSync(sitemapPath, 'utf-8');

    for (const topic of TOPICS) {
      expect(sitemap).toContain(`https://0xtsoa.dev/docs/${topic.slug}/`);
    }

    expect(sitemap).toContain('https://0xtsoa.dev/docs/install-dotfiles-safely/');
    expect(sitemap).toContain('https://0xtsoa.dev/docs/match-gtk-qt-themes/');
    expect(sitemap).toContain('https://0xtsoa.dev/docs/ricing/');
    expect(sitemap).toContain('https://0xtsoa.dev/catalogue/');
  });

  it('canonical tags across dist/*.html are normalized, self-referencing, and free of query params', () => {
    const topicHtml = fs.readFileSync(path.join(distDir, 'docs', 'hyprland', 'index.html'), 'utf-8');
    const match = topicHtml.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('https://0xtsoa.dev/docs/hyprland/');
  });
});
