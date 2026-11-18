import { Chip8, QUIRK_PRESETS } from '../src/core/chip8.js';

/** Build a CPU with `words` (16-bit opcodes) loaded at 0x200. */
export function cpuWith(words, { quirks = QUIRK_PRESETS.chip8, ...opts } = {}) {
  const bytes = [];
  for (const w of words) bytes.push(w >> 8, w & 0xff);
  const cpu = new Chip8({ quirks, ...opts });
  cpu.loadRom(bytes);
  return cpu;
}

/** Execute `n` instructions. */
export function steps(cpu, n) {
  for (let k = 0; k < n; k++) cpu.step();
  return cpu;
}

export const quirks = (overrides) => ({ ...QUIRK_PRESETS.chip8, vblank: false, ...overrides });
