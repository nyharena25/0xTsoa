import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { configSchema } from '../src/lib/schema';

export const SCHEMA_PATH = path.resolve(process.cwd(), 'schema/config.schema.json');

/** JSON Schema of the *input* format (what contributors write: defaulted fields are optional). */
export function buildJsonSchema() {
  return {
    ...z.toJSONSchema(configSchema, { io: 'input', target: 'draft-7' }),
    $id: 'https://github.com/nyharena25/0xTsoa/blob/main/schema/config.schema.json',
    title: '0xTsoa configuration',
    description: 'A Linux desktop configuration entry: configs/<author.github>/<slug>.json',
  };
}

export const serialize = (schema: object) => `${JSON.stringify(schema, null, 2)}\n`;

if (process.argv[1]?.endsWith('generate-schema.ts')) {
  fs.mkdirSync(path.dirname(SCHEMA_PATH), { recursive: true });
  fs.writeFileSync(SCHEMA_PATH, serialize(buildJsonSchema()), 'utf-8');
  console.log(`✓ Schema written to ${SCHEMA_PATH}`);
}
