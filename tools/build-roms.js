#!/usr/bin/env node
// Assemble every roms/*.asm into roms/*.ch8 with the built-in assembler.
// Usage: node tools/build-roms.js

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assemble } from '../src/core/assembler.js';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'roms');
let failed = false;

for (const file of readdirSync(dir).filter((f) => f.endsWith('.asm')).sort()) {
  const result = assemble(readFileSync(join(dir, file), 'utf8'));
  if (!result.ok) {
    failed = true;
    for (const e of result.errors) console.error(`${file}:${e.line}: ${e.message}`);
    continue;
  }
  const out = file.replace(/\.asm$/, '.ch8');
  writeFileSync(join(dir, out), result.bytes);
  console.log(`${file} -> ${out} (${result.bytes.length} bytes)`);
}

process.exit(failed ? 1 : 0);
