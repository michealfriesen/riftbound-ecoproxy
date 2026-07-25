#!/usr/bin/env node
/**
 * scripts/build-cards.mjs
 *
 * Reads every data/sets/*.json file (in sorted order) and combines their
 * card arrays into a single browser-ready artifact at data/cards.json and
 * live/data/cards.json.
 *
 * Usage:
 *   node scripts/build-cards.mjs
 *   npm run build          ← also runs validate first via "prebuild"
 *
 * Output:
 *   data/cards.json        – used by root deployment
 *   live/data/cards.json   – used by live/ deployment
 *
 * The output is an array of all card objects, sorted by variantNumber
 * to keep diffs deterministic.
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SETS_DIR = resolve(ROOT, 'data', 'sets');
const OUTPUT_PATHS = [
  resolve(ROOT, 'data', 'cards.json'),
  resolve(ROOT, 'live', 'data', 'cards.json'),
];

// ── Discover set files ───────────────────────────────────────────────────────
let setFiles;
try {
  setFiles = readdirSync(SETS_DIR)
    .filter(f => f.endsWith('.json'))
    .sort()
    .map(f => resolve(SETS_DIR, f));
} catch (err) {
  console.error(`Cannot read sets directory ${SETS_DIR}: ${err.message}`);
  process.exit(1);
}

if (setFiles.length === 0) {
  console.error(`No set files found in ${SETS_DIR}.`);
  console.error('Add a set JSON file, then try again.');
  process.exit(1);
}

// ── Combine cards ────────────────────────────────────────────────────────────
const allCards = [];
for (const filePath of setFiles) {
  const fileName = basename(filePath);
  let setData;
  try {
    setData = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.error(`Cannot parse ${fileName}: ${err.message}`);
    process.exit(1);
  }

  if (!Array.isArray(setData.cards)) {
    console.error(`${fileName}: "cards" is not an array.`);
    process.exit(1);
  }

  allCards.push(...setData.cards);
  console.log(`  ${fileName}: ${setData.cards.length} card(s)`);
}

// Deterministic ordering: sort by variantNumber
allCards.sort((a, b) => a.variantNumber.localeCompare(b.variantNumber));

if (allCards.length === 0) {
  console.error(
    '\nNo cards found in any set file.\n' +
    'Add cards to a set JSON file, then run `npm run build` again.'
  );
  process.exit(1);
}

const json = JSON.stringify(allCards, null, 2) + '\n';

// ── Write output files ───────────────────────────────────────────────────────
for (const outPath of OUTPUT_PATHS) {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, json, 'utf8');
  console.log(`Written: ${outPath}`);
}

console.log(`\nBuild complete: ${allCards.length} total card(s) across ${setFiles.length} set file(s).`);
