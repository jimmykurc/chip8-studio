import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUIRK_PRESETS } from '../src/core/chip8.js';
import { FONT_BIG_ADDR } from '../src/core/font.js';
import { cpuWith, steps } from './helpers.js';

const q = QUIRK_PRESETS.schip;
const lit = (c) => {
  const out = [];
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (c.pixel(x, y)) out.push([x, y]);
  return out;
};

test('00FF / 00FE switch resolution and clear', () => {
  const c = cpuWith([0x00ff, 0x00fe], { quirks: q });
  c.step();
  assert.deepEqual([c.width, c.height, c.hires], [128, 64, true]);
  c.screen.fill(1);
  c.step();
  assert.deepEqual([c.width, c.height, c.hires], [64, 32, false]);
  assert.ok(c.screen.every((p) => p === 0));
});

test('00FD EXIT halts the interpreter', () => {
  const c = cpuWith([0x00fd, 0x6001], { quirks: q });
  assert.equal(c.runFrame(5), 'halt');
  assert.equal(c.halted, true);
  assert.equal(c.v[0], 0);
});

test('DXY0 draws a 16x16 sprite', () => {
  const c = cpuWith([0x00ff, 0xa20a, 0x6104, 0x6203, 0xd120, 0x8001, 0x0000, 0x0000, 0x0000, 0x0000], { quirks: q });
  // sprite at 0x20A: first row 0x8001, remaining rows 0
  c.memory[0x20a] = 0x80;
  c.memory[0x20b] = 0x01;
  c.memory.fill(0, 0x20c, 0x20a + 32);
  steps(c, 5);
  assert.deepEqual(lit(c), [[4, 3], [19, 3]]);
});

test('00CN scrolls down N pixels', () => {
  const c = cpuWith([0x00ff, 0x00c3], { quirks: q });
  c.step();
  c.screen[0 * 128 + 5] = 1;
  c.screen[62 * 128 + 5] = 1;
  c.step();
  assert.deepEqual(lit(c), [[5, 3]]);
});

test('00FB / 00FC scroll right and left by 4 pixels', () => {
  const c = cpuWith([0x00ff, 0x00fb, 0x00fc, 0x00fc], { quirks: q });
  c.step();
  c.screen[10 * 128 + 2] = 1;
  c.screen[10 * 128 + 126] = 1;
  c.step();
  assert.deepEqual(lit(c), [[6, 10]]);
  c.step();
  assert.deepEqual(lit(c), [[2, 10]]);
  c.step();
  assert.deepEqual(lit(c), [], 'pixels scrolled off the edge are lost');
});

test('scrolling works in low resolution too', () => {
  const c = cpuWith([0x00c1, 0x00fb], { quirks: q });
  c.screen[0 * 64 + 0] = 1;
  steps(c, 2);
  assert.deepEqual(lit(c), [[4, 1]]);
});

test('FX30 points I at the big font', () => {
  const c = steps(cpuWith([0x6107, 0xf130], { quirks: q }), 2);
  assert.equal(c.i, FONT_BIG_ADDR + 70);
  assert.equal(c.memory[FONT_BIG_ADDR], 0x3c);
});

test('FX75 / FX85 save and restore RPL flags across reset', () => {
  const c = steps(cpuWith([0x6011, 0x6122, 0xf175, 0x6000, 0x6100, 0xf185], { quirks: q }), 6);
  assert.deepEqual([c.v[0], c.v[1]], [0x11, 0x22]);
  c.reset();
  assert.equal(c.rpl[1], 0x22);
});
