// CHIP-8 / SUPER-CHIP 1.1 interpreter core.
// Pure logic: no DOM, no timers. The host drives it with step()/runFrame()
// and tickTimers() at 60 Hz, and reads `screen`, `width`, `height`, `st`.

import { FONT_SMALL, FONT_BIG, FONT_SMALL_ADDR, FONT_BIG_ADDR } from './font.js';

export const MEMORY_SIZE = 0x1000;
export const PROGRAM_START = 0x200;
export const STACK_DEPTH = 16;

/**
 * Quirks — behaviours that differ between historical interpreters.
 *  shift    : 8XY6/8XYE shift VX in place (true) or VY into VX (false, COSMAC VIP)
 *  loadStore: FX55/FX65 leave I incremented by X+1 (true, VIP) or unchanged (false)
 *  jump     : BNNN jumps to XNN + VX (true, SUPER-CHIP) or NNN + V0 (false)
 *  vblank   : DXYN waits for the next 60 Hz tick before drawing (true, VIP)
 *  vfReset  : 8XY1/2/3 reset VF to 0 (true, VIP)
 *  clip     : sprites are clipped at screen edges (true) or wrap around (false)
 */
export const QUIRK_PRESETS = Object.freeze({
  chip8: Object.freeze({ shift: false, loadStore: true, jump: false, vblank: true, vfReset: true, clip: true }),
  schip: Object.freeze({ shift: true, loadStore: false, jump: true, vblank: false, vfReset: false, clip: true }),
  xochip: Object.freeze({ shift: false, loadStore: true, jump: false, vblank: false, vfReset: false, clip: false }),
});

export const PRESET_LABELS = {
  chip8: 'CHIP-8 (COSMAC VIP)',
  schip: 'SUPER-CHIP 1.1',
  xochip: 'Modern (Octo / XO-CHIP)',
};

export class Chip8Error extends Error {
  constructor(message, pc, opcode) {
    super(message);
    this.name = 'Chip8Error';
    this.pc = pc;
    this.opcode = opcode;
  }
}

const hex = (n, w = 4) => n.toString(16).toUpperCase().padStart(w, '0');

export class Chip8 {
  constructor({ quirks = QUIRK_PRESETS.chip8, random } = {}) {
    this.quirks = { ...quirks };
    this.random = random ?? (() => (Math.random() * 256) | 0);
    this.memory = new Uint8Array(MEMORY_SIZE);
    this.v = new Uint8Array(16);
    this.rpl = new Uint8Array(16); // SUPER-CHIP "RPL user flags", survive reset
    this.screen = new Uint8Array(128 * 64);
    this.keys = new Array(16).fill(false);
    this.rom = new Uint8Array(0);
    this.reset();
  }

  /** Restore power-on state and reload the current ROM. */
  reset() {
    this.memory.fill(0);
    this.memory.set(FONT_SMALL, FONT_SMALL_ADDR);
    this.memory.set(FONT_BIG, FONT_BIG_ADDR);
    this.memory.set(this.rom, PROGRAM_START);
    this.v.fill(0);
    this.i = 0;
    this.pc = PROGRAM_START;
    this.stack = [];
    this.dt = 0;
    this.st = 0;
    this.hires = false;
    this.screen.fill(0);
    this.waitReg = -1; // FX0A target register while waiting
    this.waitKey = -1; // key pressed during FX0A, completes on release
    this.halted = false;
    this.vblankReady = true;
    this.stalled = false;
    this.dirty = true;
    this.cycles = 0;
    this.keys.fill(false);
  }

  loadRom(bytes) {
    const rom = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes);
    if (rom.length > MEMORY_SIZE - PROGRAM_START) {
      throw new Chip8Error(`ROM too large: ${rom.length} bytes (max ${MEMORY_SIZE - PROGRAM_START})`, PROGRAM_START, 0);
    }
    this.rom = rom.slice();
    this.reset();
  }

  get width() { return this.hires ? 128 : 64; }
  get height() { return this.hires ? 64 : 32; }
  get waiting() { return this.waitReg >= 0; }

  pixel(x, y) { return this.screen[y * this.width + x]; }

  keyDown(k) {
    k &= 0xf;
    this.keys[k] = true;
    if (this.waitReg >= 0 && this.waitKey < 0) this.waitKey = k;
  }

  keyUp(k) {
    k &= 0xf;
    this.keys[k] = false;
    if (this.waitReg >= 0 && this.waitKey === k) {
      this.v[this.waitReg] = k;
      this.waitReg = -1;
      this.waitKey = -1;
    }
  }

  /** Call at 60 Hz. */
  tickTimers() {
    if (this.dt > 0) this.dt--;
    if (this.st > 0) this.st--;
    this.vblankReady = true;
  }

  opcodeAt(addr) {
    return (this.memory[addr & 0xfff] << 8) | this.memory[(addr + 1) & 0xfff];
  }

  /**
   * Execute one instruction. Returns false when nothing ran
   * (halted, waiting for a key, or stalled on vblank).
   */
  step() {
    if (this.halted || this.waitReg >= 0) return false;
    const pc = this.pc;
    const op = this.opcodeAt(pc);
    this.pc = (pc + 2) & 0xfff;
    this.stalled = false;
    this.execute(op, pc);
    if (this.stalled) return false;
    this.cycles++;
    return true;
  }

  /**
   * Run up to `count` instructions. `shouldBreak(pc)` is consulted before each
   * one (except the very first, so a paused breakpoint can be resumed).
   * Returns 'done' | 'break' | 'wait' | 'halt'.
   */
  runFrame(count, shouldBreak) {
    for (let n = 0; n < count; n++) {
      if (this.halted) return 'halt';
      if (n > 0 && shouldBreak && shouldBreak(this.pc)) return 'break';
      if (!this.step()) return this.halted ? 'halt' : 'wait';
    }
    return 'done';
  }

  skip() { this.pc = (this.pc + 2) & 0xfff; }

  illegal(op, pc) {
    throw new Chip8Error(`Unknown opcode ${hex(op)} at ${hex(pc, 3)}`, pc, op);
  }

  execute(op, pc) {
    const v = this.v;
    const x = (op >> 8) & 0xf;
    const y = (op >> 4) & 0xf;
    const n = op & 0xf;
    const nn = op & 0xff;
    const nnn = op & 0xfff;

    switch (op >> 12) {
      case 0x0:
        if (op === 0x00e0) this.clear();
        else if (op === 0x00ee) {
          if (this.stack.length === 0) throw new Chip8Error(`Stack underflow at ${hex(pc, 3)}`, pc, op);
          this.pc = this.stack.pop();
        } else if ((op & 0xfff0) === 0x00c0) this.scrollDown(n);
        else if (op === 0x00fb) this.scrollRight();
        else if (op === 0x00fc) this.scrollLeft();
        else if (op === 0x00fd) { this.halted = true; this.pc = pc; }
        else if (op === 0x00fe) this.setHires(false);
        else if (op === 0x00ff) this.setHires(true);
        else this.illegal(op, pc);
        break;
      case 0x1:
        this.pc = nnn;
        break;
      case 0x2:
        if (this.stack.length >= STACK_DEPTH) throw new Chip8Error(`Stack overflow at ${hex(pc, 3)}`, pc, op);
        this.stack.push(this.pc);
        this.pc = nnn;
        break;
      case 0x3:
        if (v[x] === nn) this.skip();
        break;
      case 0x4:
        if (v[x] !== nn) this.skip();
        break;
      case 0x5:
        if (n !== 0) this.illegal(op, pc);
        if (v[x] === v[y]) this.skip();
        break;
      case 0x6:
        v[x] = nn;
        break;
      case 0x7:
        v[x] = (v[x] + nn) & 0xff;
        break;
      case 0x8:
        this.alu(x, y, n, op, pc);
        break;
      case 0x9:
        if (n !== 0) this.illegal(op, pc);
        if (v[x] !== v[y]) this.skip();
        break;
      case 0xa:
        this.i = nnn;
        break;
      case 0xb:
        this.pc = (nnn + v[this.quirks.jump ? x : 0]) & 0xfff;
        break;
      case 0xc:
        v[x] = this.random() & nn;
        break;
      case 0xd:
        this.draw(x, y, n, pc);
        break;
      case 0xe:
        if (nn === 0x9e) { if (this.keys[v[x] & 0xf]) this.skip(); }
        else if (nn === 0xa1) { if (!this.keys[v[x] & 0xf]) this.skip(); }
        else this.illegal(op, pc);
        break;
      case 0xf:
        this.misc(x, nn, op, pc);
        break;
    }
  }

  alu(x, y, n, op, pc) {
    const v = this.v;
    const vx = v[x];
    const vy = v[y];
    switch (n) {
      case 0x0: v[x] = vy; break;
      case 0x1: v[x] = vx | vy; if (this.quirks.vfReset) v[0xf] = 0; break;
      case 0x2: v[x] = vx & vy; if (this.quirks.vfReset) v[0xf] = 0; break;
      case 0x3: v[x] = vx ^ vy; if (this.quirks.vfReset) v[0xf] = 0; break;
      case 0x4: { const s = vx + vy; v[x] = s & 0xff; v[0xf] = s > 0xff ? 1 : 0; break; }
      case 0x5: v[x] = (vx - vy) & 0xff; v[0xf] = vx >= vy ? 1 : 0; break;
      case 0x6: { const s = this.quirks.shift ? vx : vy; v[x] = s >> 1; v[0xf] = s & 1; break; }
      case 0x7: v[x] = (vy - vx) & 0xff; v[0xf] = vy >= vx ? 1 : 0; break;
      case 0xe: { const s = this.quirks.shift ? vx : vy; v[x] = (s << 1) & 0xff; v[0xf] = s >> 7; break; }
      default: this.illegal(op, pc);
    }
  }

  misc(x, nn, op, pc) {
    const v = this.v;
    const mem = this.memory;
    switch (nn) {
      case 0x07: v[x] = this.dt; break;
      case 0x0a: this.waitReg = x; this.waitKey = -1; break;
      case 0x15: this.dt = v[x]; break;
      case 0x18: this.st = v[x]; break;
      case 0x1e: this.i = (this.i + v[x]) & 0xfff; break;
      case 0x29: this.i = FONT_SMALL_ADDR + (v[x] & 0xf) * 5; break;
      case 0x30: this.i = FONT_BIG_ADDR + (v[x] & 0xf) * 10; break;
      case 0x33:
        mem[this.i & 0xfff] = Math.floor(v[x] / 100);
        mem[(this.i + 1) & 0xfff] = Math.floor(v[x] / 10) % 10;
        mem[(this.i + 2) & 0xfff] = v[x] % 10;
        break;
      case 0x55:
        for (let r = 0; r <= x; r++) mem[(this.i + r) & 0xfff] = v[r];
        if (this.quirks.loadStore) this.i = (this.i + x + 1) & 0xfff;
        break;
      case 0x65:
        for (let r = 0; r <= x; r++) v[r] = mem[(this.i + r) & 0xfff];
        if (this.quirks.loadStore) this.i = (this.i + x + 1) & 0xfff;
        break;
      case 0x75: for (let r = 0; r <= x; r++) this.rpl[r] = v[r]; break;
      case 0x85: for (let r = 0; r <= x; r++) v[r] = this.rpl[r]; break;
      default: this.illegal(op, pc);
    }
  }

  // ---- display ----------------------------------------------------------

  clear() {
    this.screen.fill(0);
    this.dirty = true;
  }

  setHires(on) {
    this.hires = on;
    this.clear();
  }

  draw(xr, yr, n, pc) {
    if (this.quirks.vblank) {
      if (!this.vblankReady) {
        this.pc = pc; // retry this instruction after the next 60 Hz tick
        this.stalled = true;
        return;
      }
      this.vblankReady = false;
    }
    const W = this.width;
    const H = this.height;
    const clip = this.quirks.clip;
    const x0 = this.v[xr] % W;
    const y0 = this.v[yr] % H;
    const big = n === 0; // SUPER-CHIP 16x16 sprite
    const w = big ? 16 : 8;
    const h = big ? 16 : n;
    const mem = this.memory;
    const scr = this.screen;
    let collision = 0;
    for (let row = 0; row < h; row++) {
      let py = y0 + row;
      if (py >= H) { if (clip) break; py %= H; }
      const a = this.i + (big ? row * 2 : row);
      const bits = big ? (mem[a & 0xfff] << 8) | mem[(a + 1) & 0xfff] : mem[a & 0xfff];
      if (!bits) continue;
      for (let col = 0; col < w; col++) {
        if (!(bits & (1 << (w - 1 - col)))) continue;
        let px = x0 + col;
        if (px >= W) { if (clip) break; px %= W; }
        const idx = py * W + px;
        if (scr[idx]) collision = 1;
        scr[idx] ^= 1;
      }
    }
    this.v[0xf] = collision;
    this.dirty = true;
  }

  scrollDown(n) {
    const W = this.width, H = this.height, s = this.screen;
    for (let y = H - 1; y >= 0; y--) {
      for (let x = 0; x < W; x++) s[y * W + x] = y >= n ? s[(y - n) * W + x] : 0;
    }
    this.dirty = true;
  }

  scrollRight(n = 4) {
    const W = this.width, H = this.height, s = this.screen;
    for (let y = 0; y < H; y++) {
      for (let x = W - 1; x >= 0; x--) s[y * W + x] = x >= n ? s[y * W + x - n] : 0;
    }
    this.dirty = true;
  }

  scrollLeft(n = 4) {
    const W = this.width, H = this.height, s = this.screen;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) s[y * W + x] = x + n < W ? s[y * W + x + n] : 0;
    }
    this.dirty = true;
  }
}
