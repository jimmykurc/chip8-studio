import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { assemble, parseNumber } from '../src/core/assembler.js';
import { disassemble } from '../src/core/disasm.js';
import { Chip8, QUIRK_PRESETS } from '../src/core/chip8.js';

const words = (src) => {
  const r = assemble(src);
  assert.deepEqual(r.errors, []);
  const out = [];
  for (let k = 0; k < r.bytes.length; k += 2) out.push((r.bytes[k] << 8) | r.bytes[k + 1]);
  return out;
};

test('number formats', () => {
  for (const t of ['42', '#2A', '#2a', '0x2A', '$2A', '0b101010', '%101010', "'*'"]) assert.equal(parseNumber(t), 42, t);
  assert.equal(parseNumber('nope'), null);
});

test('encodes every instruction form', () => {
  const table = {
    'CLS': 0x00e0, 'RET': 0x00ee, 'SCD 5': 0x00c5, 'SCR': 0x00fb, 'SCL': 0x00fc, 'EXIT': 0x00fd,
    'LOW': 0x00fe, 'HIGH': 0x00ff, 'SYS #123': 0x0123, 'JP #345': 0x1345, 'JP V0, #345': 0xb345,
    'CALL #456': 0x2456, 'SE V1, #22': 0x3122, 'SNE V1, #22': 0x4122, 'SE V1, V2': 0x5120,
    'LD V1, #22': 0x6122, 'ADD V1, #22': 0x7122, 'LD V1, V2': 0x8120, 'OR V1, V2': 0x8121,
    'AND V1, V2': 0x8122, 'XOR V1, V2': 0x8123, 'ADD V1, V2': 0x8124, 'SUB V1, V2': 0x8125,
    'SHR V1': 0x8116, 'SHR V1, V2': 0x8126, 'SUBN V1, V2': 0x8127, 'SHL V1': 0x811e, 'SHL V1, V2': 0x812e,
    'SNE V1, V2': 0x9120, 'LD I, #567': 0xa567, 'RND VA, #0F': 0xca0f, 'DRW V1, V2, 5': 0xd125,
    'SKP V3': 0xe39e, 'SKNP V3': 0xe3a1, 'LD V3, DT': 0xf307, 'LD V3, K': 0xf30a, 'LD DT, V3': 0xf315,
    'LD ST, V3': 0xf318, 'ADD I, V3': 0xf31e, 'LD F, V3': 0xf329, 'LD HF, V3': 0xf330, 'LD B, V3': 0xf333,
    'LD [I], V3': 0xf355, 'LD V3, [I]': 0xf365, 'LD R, V3': 0xf375, 'LD V3, R': 0xf385,
  };
  for (const [src, op] of Object.entries(table)) assert.deepEqual(words(src), [op], src);
  assert.deepEqual(words('ld vf, #ff\ndrw va, vb, 0'), [0x6fff, 0xdab0], 'case-insensitive');
});

test('disassembler round-trips every valid opcode', () => {
  let checked = 0;
  for (let op = 0; op <= 0xffff; op++) {
    const text = disassemble(op);
    if (text.startsWith('DW')) continue;
    const r = assemble(text);
    assert.ok(r.ok, `${op.toString(16)} -> ${text}: ${JSON.stringify(r.errors)}`);
    assert.equal((r.bytes[0] << 8) | r.bytes[1], op, text);
    checked++;
  }
  assert.ok(checked > 40000, `checked ${checked}`);
});

test('labels, forward references and expressions', () => {
  const src = `
start:  JP end          ; forward reference
data:   DB 1, 2, 3, 4
        LD I, data + 2
loop:   JP loop
end:    LD V0, end - start
`;
  assert.deepEqual(words(src).slice(0, 1), [0x120a]);
  const r = assemble(src);
  assert.equal(r.symbols.get('data'), 0x202);
  assert.equal((r.bytes[6] << 8) | r.bytes[7], 0xa204);
  assert.equal((r.bytes[10] << 8) | r.bytes[11], 0x600a);
});

test('EQU / = constants, DB, DW and ORG', () => {
  const r = assemble(`
SPEED EQU 3
LIVES = SPEED + 2
  LD V1, LIVES
  ORG #210
  DW #BEEF, 0b1000000000000001
  DB -1, 'A'
`);
  assert.ok(r.ok, JSON.stringify(r.errors));
  assert.deepEqual([...r.bytes.slice(0, 2)], [0x61, 0x05]);
  assert.equal(r.bytes.length, 0x16);
  assert.deepEqual([...r.bytes.slice(0x10)], [0xbe, 0xef, 0x80, 0x01, 0xff, 0x41]);
});

test('source map links addresses and lines', () => {
  const r = assemble('CLS\n\n; comment\nloop: JP loop');
  assert.equal(r.lineOf.get(0x200), 1);
  assert.equal(r.lineOf.get(0x202), 4);
  assert.equal(r.addrOf.get(4), 0x202);
});

test('reports errors with line numbers', () => {
  const r = assemble('CLS\nFOO V1\nLD V1, nowhere\nLD V1, 300\nDRW V1, V2, 16\nADD V1\nx: CLS\nx: CLS\nV1: CLS\nJP #1000');
  assert.equal(r.ok, false);
  const lines = r.errors.map((e) => e.line);
  assert.deepEqual(lines, [2, 3, 4, 5, 6, 8, 9, 10]);
  assert.match(r.errors[0].message, /unknown instruction/);
  assert.match(r.errors[1].message, /unknown label/);
  assert.match(r.errors[2].message, /byte out of range/);
  assert.match(r.errors[3].message, /nibble/);
  assert.match(r.errors[4].message, /invalid operands/);
  assert.match(r.errors[5].message, /duplicate/);
  assert.match(r.errors[6].message, /reserved/);
});

test('rejects instructions at odd addresses', () => {
  const r = assemble('DB 1\nCLS');
  assert.match(r.errors[0].message, /odd address/);
});

test('shipped ROMs assemble and match the committed .ch8 files', () => {
  const dir = new URL('../roms/', import.meta.url);
  const sources = readdirSync(dir).filter((f) => f.endsWith('.asm'));
  assert.ok(sources.length >= 3);
  for (const file of sources) {
    const r = assemble(readFileSync(new URL(file, dir), 'utf8'));
    assert.ok(r.ok, `${file}: ${JSON.stringify(r.errors)}`);
    const built = readFileSync(new URL(file.replace('.asm', '.ch8'), dir));
    assert.deepEqual([...r.bytes], [...built], `${file} is out of date, run npm run build:roms`);
  }
});

test('shipped ROMs run for 10 seconds without errors under every preset', () => {
  const dir = new URL('../roms/', import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.ch8'))) {
    for (const [name, quirks] of Object.entries(QUIRK_PRESETS)) {
      const c = new Chip8({ quirks });
      c.loadRom(readFileSync(new URL(file, dir)));
      let drew = false;
      for (let f = 0; f < 600; f++) {
        if (f === 10) c.keyDown(5);
        if (f === 12) c.keyUp(5);
        c.runFrame(40);
        c.tickTimers();
        drew ||= c.screen.some((p) => p);
      }
      assert.ok(drew, `${file} (${name}) drew something`);
      assert.equal(c.halted, false);
    }
  }
});
