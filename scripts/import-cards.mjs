#!/usr/bin/env node
/**
 * scripts/import-cards.mjs
 *
 * Import card data from the Hugging Face dataset Wysme/riftbound-cards and
 * write validated per-set JSON files to data/sets/.
 *
 * Source: https://huggingface.co/datasets/Wysme/riftbound-cards
 *   - Mirrors data scraped from Riot's official Riftbound Card Gallery and
 *     official errata pages. Card names, text, and artwork are © Riot Games.
 *     This importer is a community tool and is not affiliated with or endorsed
 *     by Riot Games.
 *
 * Usage:
 *   node scripts/import-cards.mjs --set OGS
 *   node scripts/import-cards.mjs --all
 *   node scripts/import-cards.mjs --set OGS --dry-run
 *   node scripts/import-cards.mjs --set OGS --revision abc123
 *   npm run import -- --set OGS
 *   npm run import -- --all --dry-run
 *
 * Options:
 *   --set <CODE>       Import only the named set (e.g. OGS, OGN)
 *   --all              Import all sets found in the dataset whose codes are
 *                      listed in KNOWN_SETS
 *   --dry-run          Print what would be written without writing files
 *   --revision <REV>   Pin the HF dataset revision (commit SHA or branch);
 *                      defaults to "main"
 *   --dataset <SLUG>   Override HF dataset slug (default: Wysme/riftbound-cards)
 *   --split <NAME>     Override HF dataset split name (default: train)
 *   --help             Show this help message
 *
 * Exit codes:
 *   0 – success (or dry-run completed)
 *   1 – fatal error (network, validation, collision, etc.)
 */

import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SCHEMA_PATH = resolve(ROOT, 'data', 'card.schema.json');
const SETS_DIR = resolve(ROOT, 'data', 'sets');

// ── Known set codes ──────────────────────────────────────────────────────────
// Maps HF set code (uppercase prefix of cardCode) → human-readable set name.
// Add entries here when new Riftbound sets are released.
export const KNOWN_SETS = {
  OGN: 'Origins',
  OGS: 'Origins \u2013 Proving Grounds',
  SFD: 'Spiritforged',
  UNL: 'Unleashed',
  VEN: 'Vendetta',
};

// ── Card-type normalization ──────────────────────────────────────────────────
/** Valid schema enum values for the `type` field. */
const VALID_TYPES = new Set(['unit', 'spell', 'gear', 'battlefield', 'legend', 'rune']);

/**
 * Normalize a source card-type string to a schema enum value.
 *
 * @param {string|null|undefined} raw
 * @returns {string|null} Normalized lowercase type, or null if unrecognized.
 */
export function normalizeCardType(raw) {
  if (raw == null) return null;
  const lower = String(raw).toLowerCase().trim();
  return VALID_TYPES.has(lower) ? lower : null;
}

// ── Color normalization ──────────────────────────────────────────────────────
/**
 * Normalize a source domain/color value to an array of color strings.
 *
 * Handles:
 *   - Arrays:              ["Fury", "Chaos"]  → ["Fury", "Chaos"]
 *   - Comma-separated:     "Fury,Chaos"       → ["Fury", "Chaos"]
 *   - Slash-separated:     "Fury/Chaos"       → ["Fury", "Chaos"]
 *   - Single value:        "Fury"             → ["Fury"]
 *   - Null/empty:          null, ""           → []
 *
 * @param {string|string[]|null|undefined} raw
 * @returns {string[]}
 */
export function normalizeColors(raw) {
  if (raw == null || raw === '') return [];
  if (Array.isArray(raw)) {
    return raw.map(c => String(c).trim()).filter(Boolean);
  }
  return String(raw)
    .split(/[,/|]/)
    .map(c => c.trim())
    .filter(Boolean);
}

// ── Identifier derivation ────────────────────────────────────────────────────
/**
 * Derive a valid variantNumber from a source card code.
 *
 * Rules:
 *   1. Split on the first '-'.
 *   2. Uppercase the set-code portion (must be 2–6 alphanumeric characters).
 *   3. Keep the rest (digits + optional lowercase letter + optional -number).
 *   4. Validate the result against the schema pattern.
 *
 * Examples:
 *   "OGN-001"  → "OGN-001"
 *   "ogs-017"  → "OGS-017"
 *   "sp2-006"  → "SP2-006"
 *   "OGN-117a" → "OGN-117a"
 *
 * @param {string|null|undefined} cardCode
 * @returns {string|null} Normalized variantNumber, or null if invalid.
 */
export function deriveVariantNumber(cardCode) {
  if (cardCode == null) return null;
  const str = String(cardCode).trim();
  const dashIdx = str.indexOf('-');
  if (dashIdx < 1) return null;

  const rawSetCode = str.slice(0, dashIdx);
  const rest = str.slice(dashIdx + 1);
  const setCode = rawSetCode.toUpperCase();

  // Set code must be 2–6 alphanumeric characters
  if (!/^[A-Z0-9]{2,6}$/.test(setCode)) return null;

  const variantNumber = `${setCode}-${rest}`;

  // Validate final identifier against schema pattern
  if (!/^[A-Z0-9]+-[0-9]+[a-z]?(?:-[0-9]+)?$/.test(variantNumber)) return null;

  return variantNumber;
}

/**
 * Derive a collector number from a card code or an explicit source number.
 *
 * If `sourceNumber` is a positive integer, use it directly.
 * Otherwise extract the leading digits from the card-code number part.
 *
 * Examples:
 *   (null, "OGN-056")  → 56
 *   (3, "OGN-056")     → 3
 *   (null, "OGN-117a") → 117
 *
 * @param {number|null|undefined} sourceNumber  Source `cardNumber` value.
 * @param {string|null|undefined} cardCode      Source `cardCode` value.
 * @returns {number|null}
 */
export function deriveCollectorNumber(sourceNumber, cardCode) {
  if (typeof sourceNumber === 'number' && Number.isInteger(sourceNumber) && sourceNumber >= 1) {
    return sourceNumber;
  }
  if (cardCode == null) return null;
  const str = String(cardCode).trim();
  const dashIdx = str.indexOf('-');
  if (dashIdx < 1) return null;
  const rest = str.slice(dashIdx + 1);
  const match = rest.match(/^(\d+)/);
  if (!match) return null;
  const n = parseInt(match[1], 10);
  return n >= 1 ? n : null;
}

// ── Record transformation ────────────────────────────────────────────────────
/**
 * Return the first non-undefined value for the given list of field names.
 *
 * @param {object} obj
 * @param {...string} keys
 * @returns {*}
 */
function pick(obj, ...keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) return obj[key];
  }
  return undefined;
}

/**
 * Transform a raw source row from the HF dataset into a card object that
 * matches data/card.schema.json.
 *
 * Expected source fields (all optional unless noted):
 *   cardCode       (required) – identifier, e.g. "OGS-001"
 *   cardNumber     – explicit collector number (integer)
 *   fullName / name – card name (required)
 *   cardType / type – card type string (required)
 *   energy         – energy cost integer
 *   power          – power integer
 *   might          – might integer
 *   domain         – color(s), string or array
 *   tags           – gameplay tags, array or comma-separated string
 *   abilityEffective / ability / description – rules text
 *   imageUrl / image – full-art image URL
 *
 * @param {object} row  Raw row object from the HF datasets-server API.
 * @returns {object} Transformed card object.
 * @throws {Error} If required fields are missing or values are invalid.
 */
export function transformRecord(row) {
  // ── Required fields ──────────────────────────────────────────────────────
  const cardCode = pick(row, 'cardCode', 'card_code', 'id');
  if (cardCode == null || cardCode === '') {
    throw new Error('Missing required field: cardCode');
  }

  const variantNumber = deriveVariantNumber(cardCode);
  if (variantNumber === null) {
    throw new Error(
      `Cannot derive a valid variantNumber from cardCode "${cardCode}". ` +
      'Expected format: SET-NNN (e.g. OGS-001, SP2-006, OGN-117a).'
    );
  }

  const rawName = pick(row, 'fullName', 'name', 'cardName', 'full_name');
  if (rawName == null || String(rawName).trim() === '') {
    throw new Error(`[${cardCode}] Missing required field: name`);
  }
  const name = String(rawName).trim();

  const rawType = pick(row, 'cardType', 'type', 'card_type');
  const type = normalizeCardType(rawType);
  if (type === null) {
    throw new Error(
      `[${cardCode}] Unknown card type "${rawType}". ` +
      `Valid types: ${[...VALID_TYPES].join(', ')}.`
    );
  }

  // ── Collector number ─────────────────────────────────────────────────────
  const rawCardNumber = pick(row, 'cardNumber', 'card_number', 'number');
  const collectorNumber = deriveCollectorNumber(
    typeof rawCardNumber === 'number' ? rawCardNumber : parseInt(rawCardNumber, 10),
    cardCode
  );
  if (collectorNumber === null) {
    throw new Error(`[${cardCode}] Cannot determine collectorNumber`);
  }

  // ── Optional numeric fields ──────────────────────────────────────────────
  const card = { variantNumber, collectorNumber, name, type };

  const rawEnergy = pick(row, 'energy');
  if (rawEnergy !== undefined) {
    card.energy = rawEnergy === null ? null : Number(rawEnergy);
  }

  const rawPower = pick(row, 'power');
  if (rawPower !== undefined) {
    card.power = rawPower === null ? null : Number(rawPower);
  }

  const rawMight = pick(row, 'might');
  if (rawMight !== undefined) {
    card.might = rawMight === null ? null : Number(rawMight);
  }

  // ── Colors ───────────────────────────────────────────────────────────────
  const rawDomain = pick(row, 'domain', 'colors', 'color');
  const colors = normalizeColors(rawDomain);
  if (colors.length > 0) {
    card.colors = colors;
  }

  // ── Tags ─────────────────────────────────────────────────────────────────
  const rawTags = pick(row, 'tags', 'subtypes', 'traits');
  if (rawTags != null) {
    const tags = Array.isArray(rawTags)
      ? rawTags.map(t => String(t).trim()).filter(Boolean)
      : String(rawTags).split(/[,;]/).map(t => t.trim()).filter(Boolean);
    if (tags.length > 0) {
      card.tags = tags;
    }
  }

  // ── Description / rules text ─────────────────────────────────────────────
  // Prefer the "effective" (errata-corrected) text over the original.
  const rawDesc = pick(row, 'abilityEffective', 'ability_effective', 'ability', 'description', 'text', 'rulesText');
  if (rawDesc != null && String(rawDesc).trim() !== '') {
    card.description = String(rawDesc).trim();
  }

  // ── Image URL ────────────────────────────────────────────────────────────
  const rawImage = pick(row, 'imageUrl', 'image_url', 'image', 'artUrl', 'art_url');
  if (rawImage != null && String(rawImage).trim() !== '') {
    card.variantImageUrl = String(rawImage).trim();
  } else {
    card.variantImageUrl = null;
  }

  return card;
}

// ── Set transformation ───────────────────────────────────────────────────────
/**
 * Transform an array of source rows for a single set into a set file object.
 *
 * Performs:
 *   - Per-record transformation via `transformRecord`
 *   - Duplicate `variantNumber` detection (fails with actionable diagnostics)
 *   - Deterministic sort by `variantNumber`
 *
 * @param {string}   setCode   Uppercase set code, e.g. "OGS"
 * @param {object[]} rows      Raw source rows for this set
 * @param {string}   setName   Human-readable set name
 * @returns {{ code: string, name: string, cards: object[] }}
 * @throws {Error} If any record is invalid or duplicate variantNumbers are found.
 */
export function transformSet(setCode, rows, setName) {
  const cards = [];
  const errors = [];
  const seenVariants = new Map(); // variantNumber → source cardCode

  for (const row of rows) {
    let card;
    try {
      card = transformRecord(row);
    } catch (err) {
      errors.push(err.message);
      continue;
    }

    const existing = seenVariants.get(card.variantNumber);
    if (existing !== undefined) {
      errors.push(
        `Duplicate variantNumber "${card.variantNumber}" ` +
        `(first: "${existing}", duplicate: "${pick(row, 'cardCode', 'card_code', 'id')}")`
      );
      continue;
    }

    seenVariants.set(card.variantNumber, pick(row, 'cardCode', 'card_code', 'id') ?? card.variantNumber);
    cards.push(card);
  }

  if (errors.length > 0) {
    const header = `${errors.length} error(s) transforming set ${setCode}:`;
    throw new Error([header, ...errors.map(e => `  • ${e}`)].join('\n'));
  }

  // Deterministic sort
  cards.sort((a, b) => a.variantNumber.localeCompare(b.variantNumber));

  return { code: setCode, name: setName, cards };
}

// ── Hugging Face datasets-server fetching ────────────────────────────────────
const HF_API_BASE = 'https://datasets-server.huggingface.co';
const PAGE_SIZE = 100;

/**
 * Fetch a single page of rows from the HF datasets-server API.
 *
 * @param {object} opts
 * @param {string} opts.dataset   Full dataset slug, e.g. "Wysme/riftbound-cards"
 * @param {string} opts.split     Dataset split, e.g. "train"
 * @param {string} [opts.revision] Revision/commit SHA or branch name
 * @param {number} opts.offset   Row offset
 * @param {number} opts.limit    Number of rows to fetch
 * @returns {Promise<{ rows: object[], numRowsTotal: number }>}
 */
export async function fetchPage({ dataset, split, revision, offset, limit }) {
  const params = new URLSearchParams({
    dataset,
    config: 'default',
    split,
    offset: String(offset),
    length: String(limit),
  });
  if (revision) params.set('revision', revision);

  const url = `${HF_API_BASE}/rows?${params}`;

  let response;
  try {
    response = await fetch(url);
  } catch (err) {
    throw new Error(`Network error fetching ${url}: ${err.message}`);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `HF API returned HTTP ${response.status} for ${url}\n${body.slice(0, 500)}`
    );
  }

  let json;
  try {
    json = await response.json();
  } catch (err) {
    throw new Error(`Invalid JSON from HF API: ${err.message}`);
  }

  if (!Array.isArray(json.rows)) {
    throw new Error(`Unexpected HF API response shape: "rows" is not an array.\n${JSON.stringify(json).slice(0, 200)}`);
  }

  const rows = json.rows.map(r => r.row);
  const numRowsTotal = json.num_rows_total ?? json.numRowsTotal ?? rows.length;

  return { rows, numRowsTotal };
}

/**
 * Fetch all rows for a dataset split, paginating as needed.
 *
 * @param {object} opts
 * @param {string} opts.dataset
 * @param {string} opts.split
 * @param {string} [opts.revision]
 * @returns {Promise<object[]>} All raw rows
 */
export async function fetchAllRows({ dataset, split, revision }) {
  const allRows = [];
  let offset = 0;

  // Fetch first page to learn total count
  log(`Fetching rows from HF dataset "${dataset}" (split: ${split}${revision ? `, revision: ${revision}` : ''}) …`);
  const first = await fetchPage({ dataset, split, revision, offset, limit: PAGE_SIZE });
  allRows.push(...first.rows);
  const total = first.numRowsTotal;
  log(`  Page 1/${Math.ceil(total / PAGE_SIZE)} — fetched ${allRows.length}/${total} rows`);

  offset += PAGE_SIZE;
  while (offset < total) {
    const page = await fetchPage({ dataset, split, revision, offset, limit: PAGE_SIZE });
    allRows.push(...page.rows);
    log(`  Page ${Math.ceil(offset / PAGE_SIZE) + 1}/${Math.ceil(total / PAGE_SIZE)} — fetched ${allRows.length}/${total} rows`);
    offset += PAGE_SIZE;
  }

  log(`Fetch complete. Total rows: ${allRows.length}`);
  return allRows;
}

// ── Schema validation ────────────────────────────────────────────────────────
let _validator = null;

function getValidator() {
  if (_validator) return _validator;

  let schema;
  try {
    schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));
  } catch (err) {
    throw new Error(`Cannot read schema at ${SCHEMA_PATH}: ${err.message}`);
  }

  const ajv = new Ajv2020({ allErrors: true });
  addFormats(ajv);
  _validator = ajv.compile(schema);
  return _validator;
}

/**
 * Validate a set file object against the card schema.
 *
 * @param {object} setData
 * @throws {Error} If validation fails.
 */
export function validateSetData(setData) {
  const validate = getValidator();
  const valid = validate(setData);
  if (!valid) {
    const messages = validate.errors.map(e =>
      `  ${e.instancePath || '(root)'} ${e.message}` +
      (e.params && Object.keys(e.params).length ? ` (${JSON.stringify(e.params)})` : '')
    );
    throw new Error(`Schema validation failed:\n${messages.join('\n')}`);
  }
}

// ── Atomic file writing ──────────────────────────────────────────────────────
/**
 * Write a set file atomically: write to a tmp file, then rename.
 *
 * @param {string} setCode
 * @param {object} setData
 * @returns {string} Path of the written file.
 */
function writeSetFile(setCode, setData) {
  mkdirSync(SETS_DIR, { recursive: true });
  const outPath = resolve(SETS_DIR, `${setCode}.json`);
  const tmpPath = `${outPath}.tmp`;
  const json = JSON.stringify(setData, null, 2) + '\n';
  try {
    writeFileSync(tmpPath, json, 'utf8');
    renameSync(tmpPath, outPath);
  } catch (err) {
    // Clean up tmp file if rename failed
    try { unlinkSync(tmpPath); } catch { /* ignore */ }
    throw err;
  }
  return outPath;
}

// ── Logging ──────────────────────────────────────────────────────────────────
function log(...args) {
  console.log(...args);
}

function warn(...args) {
  console.warn('[warn]', ...args);
}

// ── CLI argument parsing ─────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = {
    set: null,
    all: false,
    dryRun: false,
    revision: null,
    dataset: 'Wysme/riftbound-cards',
    split: 'train',
    help: false,
  };

  const positional = [];
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--all') {
      args.all = true;
    } else if (arg === '--dry-run' || arg === '--dryRun') {
      args.dryRun = true;
    } else if (arg === '--set' || arg === '-s') {
      i++;
      args.set = argv[i] ?? null;
    } else if (arg.startsWith('--set=')) {
      args.set = arg.slice('--set='.length);
    } else if (arg === '--revision' || arg === '-r') {
      i++;
      args.revision = argv[i] ?? null;
    } else if (arg.startsWith('--revision=')) {
      args.revision = arg.slice('--revision='.length);
    } else if (arg === '--dataset') {
      i++;
      args.dataset = argv[i] ?? args.dataset;
    } else if (arg.startsWith('--dataset=')) {
      args.dataset = arg.slice('--dataset='.length);
    } else if (arg === '--split') {
      i++;
      args.split = argv[i] ?? args.split;
    } else if (arg.startsWith('--split=')) {
      args.split = arg.slice('--split='.length);
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    } else {
      warn(`Unknown option: ${arg}`);
    }
    i++;
  }

  return { args, positional };
}

function printHelp() {
  console.log(`
Usage: node scripts/import-cards.mjs [options]
       npm run import -- [options]

Import card data from the Hugging Face dataset into data/sets/<SET>.json.

Options:
  --set <CODE>        Import one set by its set code (e.g. OGS, OGN)
  --all               Import all sets listed in KNOWN_SETS
  --dry-run           Print what would be written without writing any files
  --revision <REV>    Pin the HF dataset revision (commit SHA or branch name)
                      Default: main
  --dataset <SLUG>    Override the HF dataset slug
                      Default: Wysme/riftbound-cards
  --split <NAME>      Override the HF dataset split name
                      Default: train
  --help              Show this help

Examples:
  Import Origins – Proving Grounds:
    node scripts/import-cards.mjs --set OGS

  Import all known sets (dry run):
    node scripts/import-cards.mjs --all --dry-run

  Pin a specific dataset revision for reproducibility:
    node scripts/import-cards.mjs --set OGS --revision abc1234

  Import from an alternate dataset fork:
    node scripts/import-cards.mjs --all --dataset MyOrg/my-riftbound-fork

Known set codes:
${Object.entries(KNOWN_SETS).map(([k, v]) => `  ${k.padEnd(8)} ${v}`).join('\n')}

After importing, run:
  npm run validate
  npm run build
`.trim());
}

// ── Main ─────────────────────────────────────────────────────────────────────
export async function main(argv = process.argv.slice(2)) {
  const { args } = parseArgs(argv);

  if (args.help) {
    printHelp();
    return;
  }

  // Validate mode
  if (!args.set && !args.all) {
    console.error('Error: specify --set <CODE> or --all.\nRun with --help for usage.');
    process.exit(1);
  }
  if (args.set && args.all) {
    console.error('Error: --set and --all are mutually exclusive.');
    process.exit(1);
  }

  // Determine which sets to import
  let targetSets; // Array of { code, name }
  if (args.all) {
    targetSets = Object.entries(KNOWN_SETS).map(([code, name]) => ({ code, name }));
  } else {
    const code = args.set.toUpperCase();
    const name = KNOWN_SETS[code];
    if (!name) {
      warn(
        `Set code "${code}" is not in the known-sets list. ` +
        `Known codes: ${Object.keys(KNOWN_SETS).join(', ')}. ` +
        'Continuing with a placeholder set name.'
      );
    }
    targetSets = [{ code, name: name ?? `Set ${code}` }];
  }

  // Fetch all rows
  let allRows;
  try {
    allRows = await fetchAllRows({
      dataset: args.dataset,
      split: args.split,
      revision: args.revision,
    });
  } catch (err) {
    console.error(`\nFetch failed: ${err.message}`);
    process.exit(1);
  }

  // Group rows by set code (extracted from cardCode)
  const rowsBySet = new Map();
  let skippedRows = 0;

  for (const row of allRows) {
    const cardCode = row.cardCode ?? row.card_code ?? row.id ?? null;
    if (!cardCode) {
      skippedRows++;
      continue;
    }
    const dashIdx = String(cardCode).indexOf('-');
    if (dashIdx < 1) {
      warn(`Skipping row with unparseable cardCode: "${cardCode}"`);
      skippedRows++;
      continue;
    }
    const setCode = String(cardCode).slice(0, dashIdx).toUpperCase();
    if (!rowsBySet.has(setCode)) rowsBySet.set(setCode, []);
    rowsBySet.get(setCode).push(row);
  }

  if (skippedRows > 0) {
    warn(`Skipped ${skippedRows} row(s) with missing or unparseable cardCode.`);
  }

  // Warn about unknown set codes found in the data
  for (const foundCode of rowsBySet.keys()) {
    if (!KNOWN_SETS[foundCode]) {
      warn(`Dataset contains set code "${foundCode}" which is not in KNOWN_SETS. ` +
        'It will be skipped unless you add it to KNOWN_SETS in import-cards.mjs.');
    }
  }

  // Transform, validate, and (optionally) write each target set
  let anyError = false;

  for (const { code, name } of targetSets) {
    const rows = rowsBySet.get(code) ?? [];
    if (rows.length === 0) {
      warn(`No rows found in dataset for set code "${code}". Skipping.`);
      continue;
    }

    log(`\nTransforming ${rows.length} row(s) for set ${code} (${name}) …`);

    let setData;
    try {
      setData = transformSet(code, rows, name);
    } catch (err) {
      console.error(`\nTransformation failed for ${code}:\n${err.message}`);
      anyError = true;
      continue;
    }

    log(`  Transformed ${setData.cards.length} card(s).`);

    try {
      validateSetData(setData);
      log('  Schema validation: OK');
    } catch (err) {
      console.error(`\nSchema validation failed for ${code}:\n${err.message}`);
      anyError = true;
      continue;
    }

    const outPath = resolve(SETS_DIR, `${code}.json`);

    if (args.dryRun) {
      log(`  [dry-run] Would write: ${outPath} (${setData.cards.length} cards)`);
    } else {
      try {
        writeSetFile(code, setData);
        log(`  Written: ${outPath}`);
      } catch (err) {
        console.error(`\nFailed to write ${outPath}: ${err.message}`);
        anyError = true;
      }
    }
  }

  if (anyError) {
    console.error('\nImport completed with errors. See diagnostics above.');
    process.exit(1);
  }

  if (args.dryRun) {
    log('\nDry run complete. No files were written.');
  } else {
    log('\nImport complete. Run `npm run validate && npm run build` to verify.');
  }
}

// ── Entry point ──────────────────────────────────────────────────────────────
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error(`Unexpected error: ${err.message}`);
    process.exit(1);
  });
}
