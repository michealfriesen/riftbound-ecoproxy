#!/usr/bin/env node
/**
 * scripts/export-sheet.mjs
 *
 * Exports the live Riftbound Cards Google Sheet to data/sets/OGN.json.
 *
 * Usage:
 *   node scripts/export-sheet.mjs
 *   npm run export-sheet
 *
 * The script fetches the sheet via the Google Apps Script JSONP endpoint,
 * converts the flat row objects into the canonical card schema format
 * (arrays for `colors` and `tags`, integer coercions, etc.) and writes
 * data/sets/OGN.json.  Run `npm run build` afterwards to regenerate
 * data/cards.json.
 *
 * Environment variables (all optional):
 *   GAS_URL   – full Apps Script exec URL (defaults to the current one)
 *   SHEET     – sheet tab name (defaults to "Riftbound Cards")
 */

import { createServer } from 'http';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const GAS_URL = process.env.GAS_URL ||
  'https://script.google.com/macros/s/AKfycbxTZhEAgwVw51GeZL_9LOPAJ48bYGeR7X8eQcQMBOPWxxbEZe_A0ghsny-GdA9gdhIn/exec';
const SHEET = process.env.SHEET || 'Riftbound Cards';

const ALLOWED_TYPES = new Set(['unit', 'spell', 'gear', 'battlefield', 'legend', 'rune']);
const TIMEOUT_MS = 30_000;

/**
 * Converts a raw sheet row (all strings) to the canonical card object.
 * Fields that are missing or empty string are omitted or set to null.
 */
function normalizeCard(raw) {
  function intOrNull(val) {
    const n = parseInt(val, 10);
    return Number.isFinite(n) ? n : null;
  }
  function splitList(val, sep) {
    if (!val || !val.trim()) return [];
    return val.split(sep).map(s => s.trim()).filter(Boolean);
  }

  const type = (raw.type || '').trim().toLowerCase();
  if (!ALLOWED_TYPES.has(type)) {
    return null; // skip unknown types
  }

  const card = {
    variantNumber:   (raw.variantNumber || '').trim(),
    collectorNumber: parseInt(raw.collectorNumber, 10) || 1,
    name:            (raw.name || '').trim(),
    type,
  };

  if (!card.variantNumber || !card.name) return null;

  const energy = intOrNull(raw.energy);
  if (energy !== null) card.energy = energy;

  const power = intOrNull(raw.power);
  if (power !== null) card.power = power;

  const might = intOrNull(raw.might);
  if (might !== null) card.might = might;

  const colors = splitList(raw.colors, /[;,]/);
  if (colors.length) card.colors = colors;

  const tags = splitList(raw.tags, /[;,]/);
  if (tags.length) card.tags = tags;

  if (raw.description) card.description = raw.description.trim();

  const imgUrl = (raw.variantImageUrl || '').trim();
  card.variantImageUrl = imgUrl || null;

  return card;
}

/**
 * Fetches all rows from the Google Apps Script endpoint using a local
 * JSONP trampoline (a tiny HTTP server that receives the callback).
 */
function fetchSheetRows() {
  return new Promise((resolve, reject) => {
    const callbackName = `cb_${Date.now()}`;
    let server;

    const timer = setTimeout(() => {
      server && server.close();
      reject(new Error(`Timed out after ${TIMEOUT_MS / 1000}s waiting for sheet data.`));
    }, TIMEOUT_MS);

    // Tiny local server to receive the JSONP callback
    server = createServer((req, res) => {
      res.end();
      server.close();
      clearTimeout(timer);

      // Parse the callback payload from the URL: /callback?data=[...]
      const url = new URL(req.url, 'http://localhost');
      const raw = url.searchParams.get('data');
      if (!raw) {
        reject(new Error('No data received from JSONP callback.'));
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(new Error(`Failed to parse sheet data: ${e.message}`));
      }
    });

    server.listen(0, '127.0.0.1', async () => {
      const port = server.address().port;
      // The JSONP response looks like: cb_123([...])
      // We redirect it to our local server via fetch + eval trick won't work.
      // Instead, use a real HTTP fetch with the callback set to a dummy value,
      // then parse the JSONP string manually.

      const gasUrl = `${GAS_URL}?sheet=${encodeURIComponent(SHEET)}&callback=${callbackName}`;
      server.close();
      clearTimeout(timer);

      // Fetch via global fetch (Node 18+)
      let text;
      try {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), TIMEOUT_MS);
        const resp = await fetch(gasUrl, { signal: controller.signal, redirect: 'follow' });
        clearTimeout(tid);
        text = await resp.text();
      } catch (err) {
        reject(new Error(
          `Network request failed: ${err.message}\n\n` +
          'Make sure you have internet access and the Apps Script URL is still valid.\n' +
          'See README.md for manual export instructions.'
        ));
        return;
      }

      // Strip the JSONP wrapper: `cb_123([...])` → `[...]`
      const match = text.match(/^\s*\w+\s*\(([\s\S]*)\)\s*;?\s*$/);
      if (!match) {
        reject(new Error(
          'Unexpected response format from Apps Script endpoint.\n' +
          `First 200 chars: ${text.slice(0, 200)}`
        ));
        return;
      }
      try {
        resolve(JSON.parse(match[1]));
      } catch (e) {
        reject(new Error(`Failed to parse JSON from JSONP payload: ${e.message}`));
      }
    });
  });
}

async function main() {
  console.log(`Fetching sheet "${SHEET}" from Apps Script…`);
  let rows;
  try {
    rows = await fetchSheetRows();
  } catch (err) {
    console.error(`\nExport failed: ${err.message}`);
    process.exit(1);
  }

  if (!Array.isArray(rows)) {
    console.error('Expected an array of rows but got:', typeof rows);
    process.exit(1);
  }

  console.log(`Received ${rows.length} rows. Normalizing…`);
  const cards = [];
  let skipped = 0;
  for (const raw of rows) {
    const card = normalizeCard(raw);
    if (card) {
      cards.push(card);
    } else {
      skipped++;
    }
  }

  if (skipped) {
    console.warn(`Skipped ${skipped} row(s) with missing/invalid type, variantNumber, or name.`);
  }

  const setData = { code: 'OGN', name: 'Origins', cards };
  const outPath = resolve(ROOT, 'data', 'sets', 'OGN.json');
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(setData, null, 2) + '\n', 'utf8');

  console.log(`Written ${cards.length} cards to ${outPath}`);
  console.log('Run `npm run build` to regenerate data/cards.json.');
}

main();
