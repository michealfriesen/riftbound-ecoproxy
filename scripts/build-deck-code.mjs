#!/usr/bin/env node
import { build } from 'esbuild';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputs = [
  resolve(root, 'deck-code.bundle.js'),
  resolve(root, 'live', 'deck-code.bundle.js'),
];

for (const outfile of outputs) {
  await build({
    entryPoints: [resolve(root, 'src', 'deck-code-browser.js')],
    bundle: true,
    format: 'iife',
    minify: true,
    outfile,
    target: ['es2020'],
  });
  console.log(`Written: ${outfile}`);
}
