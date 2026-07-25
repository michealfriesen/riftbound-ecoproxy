#!/usr/bin/env node
/**
 * scripts/validate-cards.mjs
 *
 * Validates every data/sets/*.json file against data/card.schema.json and
 * checks cross-file uniqueness of variantNumber.
 *
 * Usage:
 *   node scripts/validate-cards.mjs
 *   npm run validate
 *
 * Exit codes:
 *   0 – all sets valid and no duplicate IDs
 *   1 – validation or uniqueness error(s) found
 */

import { readFileSync, readdirSync } from 'fs';
import { resolve, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SCHEMA_PATH = resolve(ROOT, 'data', 'card.schema.json');
const SETS_DIR = resolve(ROOT, 'data', 'sets');

// ── Load schema ──────────────────────────────────────────────────────────────
let schema;
try {
  schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));
} catch (err) {
  console.error(`Cannot read schema at ${SCHEMA_PATH}: ${err.message}`);
  process.exit(1);
}

const ajv = new Ajv2020({ allErrors: true });
addFormats(ajv);
const validate = ajv.compile(schema);

// ── Discover set files ───────────────────────────────────────────────────────
let setFiles;
try {
  setFiles = readdirSync(SETS_DIR)
    .filter(f => f.endsWith('.json'))
    .sort()
    .map(f => resolve(SETS_DIR, f));
} catch (err) {
  console.error(`Cannot read sets directory at ${SETS_DIR}: ${err.message}`);
  process.exit(1);
}

if (setFiles.length === 0) {
  console.error(`No set files found in ${SETS_DIR}.`);
  console.error('Run `npm run export-sheet` to export the current Google Sheet, or add a set JSON manually.');
  process.exit(1);
}

// ── Validate each file and collect variant numbers ───────────────────────────
const seenVariants = new Map(); // variantNumber → filename
let hasErrors = false;

for (const filePath of setFiles) {
  const fileName = basename(filePath);
  let setData;
  try {
    setData = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.error(`[${fileName}] JSON parse error: ${err.message}`);
    hasErrors = true;
    continue;
  }

  const valid = validate(setData);
  if (!valid) {
    console.error(`[${fileName}] Schema validation failed:`);
    for (const err of validate.errors) {
      console.error(`  ${err.instancePath || '(root)'} ${err.message}`);
      if (err.params && Object.keys(err.params).length) {
        console.error(`    params: ${JSON.stringify(err.params)}`);
      }
    }
    hasErrors = true;
    continue;
  }

  // Check uniqueness of variantNumber across all sets
  for (const card of setData.cards) {
    const vn = card.variantNumber;
    if (seenVariants.has(vn)) {
      console.error(
        `[${fileName}] Duplicate variantNumber "${vn}" ` +
        `(first seen in ${seenVariants.get(vn)})`
      );
      hasErrors = true;
    } else {
      seenVariants.set(vn, fileName);
    }
  }

  console.log(`[${fileName}] OK – ${setData.cards.length} card(s)`);
}

if (hasErrors) {
  console.error('\nValidation failed. Fix the errors above before building.');
  process.exit(1);
}

console.log(`\nAll ${setFiles.length} set file(s) valid. ${seenVariants.size} total card(s).`);
