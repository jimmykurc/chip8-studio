import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUIRK_PRESETS } from '../src/core/chip8.js';
import { cpuWith, steps, quirks } from './helpers.js';

test('presets expose every quirk', () => {
  for (const preset of Object.values(QUIRK_PRESETS)) {
    assert.deepEqual(Object.keys(preset).sort(), ['clip', 'jump', 'loadStore', 'shift', 'vblank', 'vfReset']);
  }
});

test('shift quirk: VY shifted into VX (VIP) vs VX in place (SCHIP)', () => {
  const prog = [0x6108, 0x6203, 0x8126];
  const vip = steps(cpuWith(prog, { quirks: quirks({ shift: false }) }), 3);
  assert.deepEqual([vip.v[1], vip.v[0xf]], [0x01, 1]);
  const schip = steps(cpuWith(prog, { quirks: quirks({ shift: true }) }), 3);
  assert.deepEqual([schip.v[1], schip.v[0xf]], [0x04, 0]);
  const shl = steps(cpuWith([0x6101, 0x6280, 0x812e], { quirks: quirks({ shift: true }) }), 3);
  assert.deepEqual([shl.v[1], shl.v[0xf]], [0x02, 0]);
});

test('loadStore quirk: I incremented by X+1 or left alone', () => {
  const prog = [0xa300, 0xf255];
  assert.equal(steps(cpuWith(prog, { quirks: quirks({ loadStore: true }) }), 2).i, 0x303);
  assert.equal(steps(cpuWith(prog, { quirks: quirks({ loadStore: false }) }), 2).i, 0x300);
  const load = [0xa300, 0xf365];
  assert.equal(steps(cpuWith(load, { quirks: quirks({ loadStore: true }) }), 2).i, 0x304);
});

test('jump quirk: BNNN uses V0, BXNN uses VX', () => {
  const prog = [0x6010, 0x6320, 0xb300];
  assert.equal(steps(cpuWith(prog, { quirks: quirks({ jump: false }) }), 3).pc, 0x310);
  assert.equal(steps(cpuWith(prog, { quirks: quirks({ jump: true }) }), 3).pc, 0x320);
});

test('vfReset quirk: logic ops clear VF', () => {
  for (const op of [0x8121, 0x8122, 0x8123]) {
    const prog = [0x6f05, op];
    assert.equal(steps(cpuWith(prog, { quirks: quirks({ vfReset: true }) }), 2).v[0xf], 0);
    assert.equal(steps(cpuWith(prog, { quirks: quirks({ vfReset: false }) }), 2).v[0xf], 5);
  }
});

test('vblank quirk: one sprite per 60 Hz frame', () => {
  const prog = [0xd005, 0xd005, 0x1204];
  const c = cpuWith(prog, { quirks: quirks({ vblank: true }) });
  assert.equal(c.runFrame(10), 'wait');
  assert.equal(c.pc, 0x202, 'second DRW is stalled');
  c.tickTimers();
  c.runFrame(1);
  assert.equal(c.pc, 0x204);
  const free = cpuWith(prog, { quirks: quirks({ vblank: false }) });
  free.runFrame(2);
  assert.equal(free.pc, 0x204);
});

test('clip quirk: sprites clip or wrap at the edges', () => {
  // font "0" at (62, 30): 4 px wide, 5 tall
  const prog = [0x6000, 0xf029, 0x613e, 0x621e, 0xd125];
  const clip = steps(cpuWith(prog, { quirks: quirks({ clip: true }) }), 5);
  assert.equal(clip.pixel(0, 30), 0);
  assert.equal(clip.pixel(62, 0), 0);
  assert.equal(clip.pixel(63, 31), 0); // row 1 of "0" is #..# -> col 63 empty, sanity
  const wrap = steps(cpuWith(prog, { quirks: quirks({ clip: false }) }), 5);
  assert.equal(wrap.pixel(1, 30), 1, 'columns wrap to the left edge');
  assert.equal(wrap.pixel(62, 0), 1, 'rows wrap to the top');
});
