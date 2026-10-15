import fs from 'node:fs';
import path from 'node:path';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { configSchema } from '../src/lib/schema';

const jsonSchema = zodToJsonSchema(configSchema as any, {
  name: 'ConfigSchema',
  $refStrategy: 'none',
});

const outDir = path.resolve(process.cwd(), 'schema');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const outFile = path.join(outDir, 'config.schema.json');
fs.writeFileSync(outFile, JSON.stringify(jsonSchema, null, 2), 'utf-8');
console.log(`✓ Schema successfully written to ${outFile}`);
