import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chip8, Chip8Error, PROGRAM_START } from '../src/core/chip8.js';
import { FONT_SMALL_ADDR } from '../src/core/font.js';
import { cpuWith, steps, quirks } from './helpers.js';

const q = quirks();

test('reset state and fonts', () => {
  const c = new Chip8();
  assert.equal(c.pc, PROGRAM_START);
  assert.equal(c.memory[FONT_SMALL_ADDR], 0xf0);
  assert.equal(c.width, 64);
  assert.equal(c.height, 32);
});

test('rejects oversized ROMs', () => {
  assert.throws(() => new Chip8().loadRom(new Uint8Array(4000)), Chip8Error);
});

test('0x00E0 CLS clears the screen', () => {
  const c = cpuWith([0x00e0], { quirks: q });
  c.screen.fill(1);
  c.step();
  assert.ok(c.screen.every((p) => p === 0));
});

test('1NNN JP, 2NNN CALL, 00EE RET', () => {
  const c = cpuWith([0x2206, 0x0000, 0x0000, 0x00ee], { quirks: q });
  c.step();
  assert.equal(c.pc, 0x206);
  assert.deepEqual(c.stack, [0x202]);
  c.step();
  assert.equal(c.pc, 0x202);
  assert.equal(c.stack.length, 0);
  const j = cpuWith([0x1abc], { quirks: q });
  j.step();
  assert.equal(j.pc, 0xabc);
});

test('stack underflow and overflow throw', () => {
  assert.throws(() => cpuWith([0x00ee]).step(), /underflow/);
  const c = cpuWith([0x2200]);
  assert.throws(() => steps(c, 17), /overflow/);
});

test('3XNN / 4XNN / 5XY0 / 9XY0 skips', () => {
  const cases = [
    [[0x6105, 0x3105], 0x206], [[0x6105, 0x3106], 0x204],
    [[0x6105, 0x4106], 0x206], [[0x6105, 0x4105], 0x204],
    [[0x6105, 0x6205, 0x5120], 0x208], [[0x6105, 0x6206, 0x5120], 0x206],
    [[0x6105, 0x6206, 0x9120], 0x208], [[0x6105, 0x6205, 0x9120], 0x206],
  ];
  for (const [prog, pc] of cases) {
    const c = steps(cpuWith(prog, { quirks: q }), prog.length);
    assert.equal(c.pc, pc, prog.map((w) => w.toString(16)).join(' '));
  }
});

test('6XNN LD and 7XNN ADD (wraps, no carry flag)', () => {
  const c = steps(cpuWith([0x6afe, 0x7a05, 0x6f00], { quirks: q }), 3);
  assert.equal(c.v[0xa], 0x03);
  assert.equal(c.v[0xf], 0);
});

test('8XY0..8XY3 move and logic', () => {
  const run = (op) => steps(cpuWith([0x613c, 0x620f, op], { quirks: quirks({ vfReset: false }) }), 3).v[1];
  assert.equal(run(0x8120), 0x0f);
  assert.equal(run(0x8121), 0x3f);
  assert.equal(run(0x8122), 0x0c);
  assert.equal(run(0x8123), 0x33);
});

test('8XY4 ADD sets carry', () => {
  let c = steps(cpuWith([0x61f0, 0x6220, 0x8124], { quirks: q }), 3);
  assert.deepEqual([c.v[1], c.v[0xf]], [0x10, 1]);
  c = steps(cpuWith([0x6110, 0x6220, 0x8124], { quirks: q }), 3);
  assert.deepEqual([c.v[1], c.v[0xf]], [0x30, 0]);
});

test('8XY5 SUB and 8XY7 SUBN set NOT borrow', () => {
  let c = steps(cpuWith([0x6110, 0x6220, 0x8125], { quirks: q }), 3);
  assert.deepEqual([c.v[1], c.v[0xf]], [0xf0, 0]);
  c = steps(cpuWith([0x6120, 0x6220, 0x8125], { quirks: q }), 3);
  assert.deepEqual([c.v[1], c.v[0xf]], [0x00, 1]);
  c = steps(cpuWith([0x6110, 0x6230, 0x8127], { quirks: q }), 3);
  assert.deepEqual([c.v[1], c.v[0xf]], [0x20, 1]);
  c = steps(cpuWith([0x6130, 0x6210, 0x8127], { quirks: q }), 3);
  assert.deepEqual([c.v[1], c.v[0xf]], [0xe0, 0]);
});

test('8XY6 / 8XYE shifts put the shifted-out bit in VF', () => {
  let c = steps(cpuWith([0x6205, 0x8126], { quirks: q }), 2);
  assert.deepEqual([c.v[1], c.v[0xf]], [0x02, 1]);
  c = steps(cpuWith([0x6281, 0x812e], { quirks: q }), 2);
  assert.deepEqual([c.v[1], c.v[0xf]], [0x02, 1]);
});

test('VF as destination: flag wins', () => {
  const c = steps(cpuWith([0x6fff, 0x6101, 0x8f14], { quirks: q }), 3);
  assert.equal(c.v[0xf], 1);
});

test('ANNN, BNNN, CXNN', () => {
  let c = steps(cpuWith([0xa123], { quirks: q }), 1);
  assert.equal(c.i, 0x123);
  c = steps(cpuWith([0x6004, 0xb300], { quirks: q }), 2);
  assert.equal(c.pc, 0x304);
  c = steps(cpuWith([0xc10f], { quirks: q, random: () => 0xab }), 1);
  assert.equal(c.v[1], 0x0b);
});

test('DXYN draws with XOR and reports collisions', () => {
  // draw font "0" at (1,2), twice
  const c = cpuWith([0x6000, 0xf029, 0x6101, 0x6202, 0xd125, 0xd125], { quirks: q });
  steps(c, 5);
  assert.equal(c.pixel(1, 2), 1);
  assert.equal(c.pixel(4, 2), 1);
  assert.equal(c.pixel(2, 3), 0);
  assert.equal(c.v[0xf], 0);
  c.step();
  assert.ok(c.screen.every((p) => p === 0));
  assert.equal(c.v[0xf], 1);
});

test('DXYN start position wraps around the screen', () => {
  const c = steps(cpuWith([0x6000, 0xf029, 0x6142, 0x6221, 0xd125], { quirks: q }), 5);
  assert.equal(c.pixel(2, 1), 1); // 0x42 % 64 = 2, 0x21 % 32 = 1
});

test('EX9E / EXA1 key skips', () => {
  let c = cpuWith([0x6107, 0xe19e], { quirks: q });
  c.keyDown(7);
  steps(c, 2);
  assert.equal(c.pc, 0x206);
  c = cpuWith([0x6107, 0xe1a1], { quirks: q });
  steps(c, 2);
  assert.equal(c.pc, 0x206);
  c = cpuWith([0x6107, 0xe1a1], { quirks: q });
  c.keyDown(7);
  steps(c, 2);
  assert.equal(c.pc, 0x204);
});

test('FX07 / FX15 / FX18 timers', () => {
  const c = steps(cpuWith([0x6110, 0xf115, 0xf118], { quirks: q }), 3);
  assert.deepEqual([c.dt, c.st], [0x10, 0x10]);
  c.tickTimers();
  c.loadRom([0xf2, 0x07]);
  c.dt = 9;
  c.step();
  assert.equal(c.v[2], 9);
});

test('FX0A waits for a key press and release', () => {
  const c = cpuWith([0xf30a, 0x6401], { quirks: q });
  c.step();
  assert.equal(c.step(), false);
  assert.equal(c.pc, 0x202);
  c.keyDown(0xb);
  assert.equal(c.step(), false, 'still waiting until release');
  c.keyUp(0xb);
  assert.equal(c.v[3], 0xb);
  assert.equal(c.step(), true);
  assert.equal(c.v[4], 1);
});

test('FX1E, FX29, FX33', () => {
  const c = steps(cpuWith([0xa300, 0x61fe, 0xf11e, 0x620a, 0xf229], { quirks: q }), 5);
  assert.equal(c.i, FONT_SMALL_ADDR + 50);
  const b = steps(cpuWith([0xa300, 0x61fe, 0xf133], { quirks: q }), 3);
  assert.deepEqual([...b.memory.slice(0x300, 0x303)], [2, 5, 4]);
});

test('FX55 / FX65 store and load V0..VX', () => {
  const c = cpuWith([0x6011, 0x6122, 0x6233, 0xa400, 0xf255, 0x6000, 0x6100, 0xa400, 0xf165], { quirks: q });
  steps(c, 9);
  assert.deepEqual([...c.memory.slice(0x400, 0x403)], [0x11, 0x22, 0x33]);
  assert.deepEqual([c.v[0], c.v[1], c.v[2]], [0x11, 0x22, 0x33]);
});

test('timers count down at 60 Hz and stop at zero', () => {
  const c = new Chip8();
  c.dt = 2;
  c.st = 1;
  c.tickTimers(); c.tickTimers(); c.tickTimers();
  assert.deepEqual([c.dt, c.st], [0, 0]);
});

test('unknown opcodes throw Chip8Error with the address', () => {
  for (const op of [0x5121, 0x9121, 0x8128, 0xe1ff, 0xf1ff, 0x0123]) {
    const c = cpuWith([op], { quirks: q });
    assert.throws(() => c.step(), (e) => e instanceof Chip8Error && e.pc === 0x200);
  }
});

test('runFrame stops on breakpoints but resumes past them', () => {
  const c = cpuWith([0x6001, 0x6002, 0x6003, 0x1200], { quirks: q });
  assert.equal(c.runFrame(10, (pc) => pc === 0x204), 'break');
  assert.equal(c.pc, 0x204);
  assert.equal(c.runFrame(1, (pc) => pc === 0x204), 'done');
  assert.equal(c.v[0], 3);
});
