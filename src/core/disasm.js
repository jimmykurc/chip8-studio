// Disassembler. Output uses the same syntax the assembler accepts,
// so `assemble(disassemble(op))` round-trips for every valid opcode.

const h = (n, w) => '#' + n.toString(16).toUpperCase().padStart(w, '0');
const V = (r) => 'V' + r.toString(16).toUpperCase();

export function disassemble(op) {
  const x = (op >> 8) & 0xf;
  const y = (op >> 4) & 0xf;
  const n = op & 0xf;
  const nn = op & 0xff;
  const nnn = op & 0xfff;
  const vx = V(x);
  const vy = V(y);

  switch (op >> 12) {
    case 0x0:
      if (op === 0x00e0) return 'CLS';
      if (op === 0x00ee) return 'RET';
      if ((op & 0xfff0) === 0x00c0) return `SCD ${n}`;
      if (op === 0x00fb) return 'SCR';
      if (op === 0x00fc) return 'SCL';
      if (op === 0x00fd) return 'EXIT';
      if (op === 0x00fe) return 'LOW';
      if (op === 0x00ff) return 'HIGH';
      return `SYS ${h(nnn, 3)}`;
    case 0x1: return `JP ${h(nnn, 3)}`;
    case 0x2: return `CALL ${h(nnn, 3)}`;
    case 0x3: return `SE ${vx}, ${h(nn, 2)}`;
    case 0x4: return `SNE ${vx}, ${h(nn, 2)}`;
    case 0x5: if (n === 0) return `SE ${vx}, ${vy}`; break;
    case 0x6: return `LD ${vx}, ${h(nn, 2)}`;
    case 0x7: return `ADD ${vx}, ${h(nn, 2)}`;
    case 0x8:
      switch (n) {
        case 0x0: return `LD ${vx}, ${vy}`;
        case 0x1: return `OR ${vx}, ${vy}`;
        case 0x2: return `AND ${vx}, ${vy}`;
        case 0x3: return `XOR ${vx}, ${vy}`;
        case 0x4: return `ADD ${vx}, ${vy}`;
        case 0x5: return `SUB ${vx}, ${vy}`;
        case 0x6: return x === y ? `SHR ${vx}` : `SHR ${vx}, ${vy}`;
        case 0x7: return `SUBN ${vx}, ${vy}`;
        case 0xe: return x === y ? `SHL ${vx}` : `SHL ${vx}, ${vy}`;
      }
      break;
    case 0x9: if (n === 0) return `SNE ${vx}, ${vy}`; break;
    case 0xa: return `LD I, ${h(nnn, 3)}`;
    case 0xb: return `JP V0, ${h(nnn, 3)}`;
    case 0xc: return `RND ${vx}, ${h(nn, 2)}`;
    case 0xd: return `DRW ${vx}, ${vy}, ${n}`;
    case 0xe:
      if (nn === 0x9e) return `SKP ${vx}`;
      if (nn === 0xa1) return `SKNP ${vx}`;
      break;
    case 0xf:
      switch (nn) {
        case 0x07: return `LD ${vx}, DT`;
        case 0x0a: return `LD ${vx}, K`;
        case 0x15: return `LD DT, ${vx}`;
        case 0x18: return `LD ST, ${vx}`;
        case 0x1e: return `ADD I, ${vx}`;
        case 0x29: return `LD F, ${vx}`;
        case 0x30: return `LD HF, ${vx}`;
        case 0x33: return `LD B, ${vx}`;
        case 0x55: return `LD [I], ${vx}`;
        case 0x65: return `LD ${vx}, [I]`;
        case 0x75: return `LD R, ${vx}`;
        case 0x85: return `LD ${vx}, R`;
      }
      break;
  }
  return `DW ${h(op, 4)}`;
}

/** Disassemble `count` instructions from `start`. */
export function disassembleRange(memory, start, count) {
  const out = [];
  for (let k = 0; k < count; k++) {
    const addr = (start + k * 2) & 0xfff;
    const op = (memory[addr] << 8) | memory[(addr + 1) & 0xfff];
    out.push({ addr, op, text: disassemble(op) });
  }
  return out;
}
