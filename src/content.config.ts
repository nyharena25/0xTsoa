import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { configSchema } from './lib/schema';

const configs = defineCollection({
  loader: glob({
    pattern: '*/*.json',
    base: './configs',
    generateId: ({ entry }) => entry.replace(/\.json$/, ''),
  }),
  schema: configSchema,
});

export const collections = { configs };
