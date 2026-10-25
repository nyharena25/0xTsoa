import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { configSchema } from './lib/schema';
import { guideSchema } from './lib/guides';

const configs = defineCollection({
  loader: glob({
    pattern: '*/*.json',
    base: './configs',
    generateId: ({ entry }) => entry.replace(/\.json$/, ''),
  }),
  schema: configSchema,
});

// guides/_template.mdx and other "_" files are skipped.
const guides = defineCollection({
  loader: glob({
    pattern: '[!_]*.mdx',
    base: './guides',
    generateId: ({ entry }) => entry.replace(/\.mdx$/, ''),
  }),
  schema: guideSchema,
});

export const collections = { configs, guides };
