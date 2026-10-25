/**
 * Guides in the Docs section (/docs/install-dotfiles-safely/…): hand-written how-to articles in
 * guides/<slug>.mdx, as opposed to topic pages, which compare the entries of one facet. A guide
 * answers one question no topic page answers, and links into topic and config pages.
 * Files starting with "_" (the template) are never published.
 */
import { z } from 'zod';
import { REPO_URL } from '../../site.config';

export const GUIDES_DIR = 'guides';
export const GUIDE_AUTHOR = 'Ny Harena RAVELOMANANTSOA';
/** Edits go through a pull request on the branch PRs target. */
export const EDIT_BRANCH = 'dev';

// YAML reads an unquoted 2026-10-25 as a Date: keep it as the YYYY-MM-DD string either way.
const isoDate = z.preprocess(
  (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
);

export const guideSchema = z
  .object({
    /** Search title without the " — 0xTsoa" suffix: Base.astro appends it. */
    title: z.string().min(10).max(51),
    h1: z.string().min(10).max(90),
    /** Short name for breadcrumbs and links. */
    label: z.string().min(3).max(32),
    description: z.string().min(70).max(160),
    author: z.string().default(GUIDE_AUTHOR),
    published: isoDate,
    /** Last time the text was reviewed: dateModified, sitemap lastmod and the byline. */
    updated: isoDate,
    /** Slugs of the topic pages this guide is about, linked at the end. */
    topics: z.array(z.string()).default([]),
    faq: z.array(z.object({ q: z.string().min(10), a: z.string().min(20) })).default([]),
    /** Drafts render in `astro dev` only. */
    draft: z.boolean().default(false),
  })
  .refine((g) => g.updated >= g.published, { message: 'updated must not be before published', path: ['updated'] });

export type GuideData = z.infer<typeof guideSchema>;

export function guideEditUrl(slug: string): string {
  return `${REPO_URL}/edit/${EDIT_BRANCH}/${GUIDES_DIR}/${slug}.mdx`;
}

/** Published guide files: `<slug>.mdx`, not starting with "_". */
export function isGuideFile(name: string): boolean {
  return /^[a-z0-9][a-z0-9-]*\.mdx$/.test(name);
}
