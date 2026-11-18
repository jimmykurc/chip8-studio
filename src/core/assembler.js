// A small two-pass CHIP-8 / SUPER-CHIP assembler.
//
// Syntax (case-insensitive mnemonics, Cowgod-style):
//   ; comment            label:             NAME EQU expr   (or NAME = expr)
//   ORG expr             DB expr, ...        DW expr, ...
//   Numbers: 42, #2A, 0x2A, $2A, 0b101010, %101010, 'A'
//   Expressions: terms joined by + and -, e.g. `sprites + 5`, `end - start`.
//
// assemble(source) -> { ok, bytes, errors, symbols, lineOf, addrOf }

import { PROGRAM_START, MEMORY_SIZE } from './chip8.js';

const RESERVED = new Set(['I', 'DT', 'ST', 'K', 'F', 'HF', 'B', 'R']);
const LABEL_RE = /^[A-Za-z_][\w.]*$/;

export class AsmError extends Error {
  constructor(message, line) {
    super(line ? `line ${line}: ${message}` : message);
    this.line = line;
    this.detail = message;
  }
}

function stripComment(line) {
  let out = '';
  let quote = false;
  for (const ch of line) {
    if (ch === "'") quote = !quote;
    if (ch === ';' && !quote) break;
    out += ch;
  }
  return out;
}

function splitOperands(text) {
  if (!text.trim()) return [];
  return text.split(',').map((s) => s.trim());
}

export function parseNumber(tok) {
  const t = tok.trim();
  let m;
  if ((m = /^'(.)'$/.exec(t))) return m[1].charCodeAt(0);
  if ((m = /^(?:#|0x|\$)([0-9a-f]+)$/i.exec(t))) return parseInt(m[1], 16);
  if ((m = /^(?:0b|%)([01]+)$/i.exec(t))) return parseInt(m[1], 2);
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  return null;
}

/** Evaluate `a + b - c`. Returns a number, or throws AsmError (unknown symbols when `strict`). */
function evaluate(expr, symbols, line, strict) {
  const src = expr.replace(/\s+/g, '');
  if (!src) throw new AsmError('missing value', line);
  const re = /([+-]?)([^+-]+)/g;
  let total = 0;
  let consumed = 0;
  let m;
  while ((m = re.exec(src))) {
    consumed += m[0].length;
    const term = m[2];
    let value = parseNumber(term);
    if (value === null) {
      if (!LABEL_RE.test(term)) throw new AsmError(`bad value "${term}"`, line);
      const key = term.toLowerCase();
      if (symbols.has(key)) value = symbols.get(key);
      else if (strict) throw new AsmError(`unknown label "${term}"`, line);
      else value = 0;
    }
    total += m[1] === '-' ? -value : value;
  }
  if (consumed !== src.length) throw new AsmError(`bad expression "${expr}"`, line);
  return total;
}

function operand(tok) {
  const u = tok.toUpperCase();
  if (/^V[0-9A-F]$/.test(u)) return { t: 'V', r: parseInt(u[1], 16) };
  if (u === '[I]') return { t: '[I]' };
  if (RESERVED.has(u)) return { t: u };
  return { t: 'N', expr: tok };
}

// Instruction table: mnemonic -> list of [signature, encoder].
// Signature letters: V register, N number, or a literal operand name.
const TABLE = {
  CLS: [['', () => 0x00e0]],
  RET: [['', () => 0x00ee]],
  SCD: [['N', (a) => 0x00c0 | a[0].n4]],
  SCR: [['', () => 0x00fb]],
  SCL: [['', () => 0x00fc]],
  EXIT: [['', () => 0x00fd]],
  LOW: [['', () => 0x00fe]],
  HIGH: [['', () => 0x00ff]],
  SYS: [['N', (a) => a[0].addr]],
  JP: [
    ['N', (a) => 0x1000 | a[0].addr],
    ['V N', (a, line) => {
      const nnn = a[1].addr;
      if (a[0].r !== 0 && a[0].r !== nnn >> 8) throw new AsmError('JP Vx, addr requires V0 (or X equal to the high nibble of addr)', line);
      return 0xb000 | nnn;
    }],
  ],
  CALL: [['N', (a) => 0x2000 | a[0].addr]],
  SE: [
    ['V N', (a) => 0x3000 | (a[0].r << 8) | a[1].byte],
    ['V V', (a) => 0x5000 | (a[0].r << 8) | (a[1].r << 4)],
  ],
  SNE: [
    ['V N', (a) => 0x4000 | (a[0].r << 8) | a[1].byte],
    ['V V', (a) => 0x9000 | (a[0].r << 8) | (a[1].r << 4)],
  ],
  LD: [
    ['V N', (a) => 0x6000 | (a[0].r << 8) | a[1].byte],
    ['V V', (a) => 0x8000 | (a[0].r << 8) | (a[1].r << 4)],
    ['I N', (a) => 0xa000 | a[1].addr],
    ['V DT', (a) => 0xf007 | (a[0].r << 8)],
    ['V K', (a) => 0xf00a | (a[0].r << 8)],
    ['DT V', (a) => 0xf015 | (a[1].r << 8)],
    ['ST V', (a) => 0xf018 | (a[1].r << 8)],
    ['F V', (a) => 0xf029 | (a[1].r << 8)],
    ['HF V', (a) => 0xf030 | (a[1].r << 8)],
    ['B V', (a) => 0xf033 | (a[1].r << 8)],
    ['[I] V', (a) => 0xf055 | (a[1].r << 8)],
    ['V [I]', (a) => 0xf065 | (a[0].r << 8)],
    ['R V', (a) => 0xf075 | (a[1].r << 8)],
    ['V R', (a) => 0xf085 | (a[0].r << 8)],
  ],
  ADD: [
    ['V N', (a) => 0x7000 | (a[0].r << 8) | a[1].byte],
    ['V V', (a) => 0x8004 | (a[0].r << 8) | (a[1].r << 4)],
    ['I V', (a) => 0xf01e | (a[1].r << 8)],
  ],
  OR: [['V V', (a) => 0x8001 | (a[0].r << 8) | (a[1].r << 4)]],
  AND: [['V V', (a) => 0x8002 | (a[0].r << 8) | (a[1].r << 4)]],
  XOR: [['V V', (a) => 0x8003 | (a[0].r << 8) | (a[1].r << 4)]],
  SUB: [['V V', (a) => 0x8005 | (a[0].r << 8) | (a[1].r << 4)]],
  SUBN: [['V V', (a) => 0x8007 | (a[0].r << 8) | (a[1].r << 4)]],
  SHR: [
    ['V', (a) => 0x8006 | (a[0].r << 8) | (a[0].r << 4)],
    ['V V', (a) => 0x8006 | (a[0].r << 8) | (a[1].r << 4)],
  ],
  SHL: [
    ['V', (a) => 0x800e | (a[0].r << 8) | (a[0].r << 4)],
    ['V V', (a) => 0x800e | (a[0].r << 8) | (a[1].r << 4)],
  ],
  RND: [['V N', (a) => 0xc000 | (a[0].r << 8) | a[1].byte]],
  DRW: [['V V N', (a) => 0xd000 | (a[0].r << 8) | (a[1].r << 4) | a[2].n4]],
  SKP: [['V', (a) => 0xe09e | (a[0].r << 8)]],
  SKNP: [['V', (a) => 0xe0a1 | (a[0].r << 8)]],
};

export const MNEMONICS = Object.keys(TABLE);

function encode(mnemonic, ops, symbols, line) {
  const forms = TABLE[mnemonic];
  const sig = ops.map((o) => o.t).join(' ');
  const form = forms.find(([s]) => s === sig);
  if (!form) {
    const expected = forms.map(([s]) => `${mnemonic} ${s.split(' ').filter(Boolean).map((t) => (t === 'V' ? 'Vx' : t === 'N' ? 'n' : t)).join(', ')}`.trim());
    throw new AsmError(`invalid operands for ${mnemonic} (expected ${expected.join(' | ')})`, line);
  }
  const args = ops.map((o) => {
    if (o.t !== 'N') return o;
    const value = evaluate(o.expr, symbols, line, true);
    return {
      ...o,
      get addr() {
        if (value < 0 || value > 0xfff) throw new AsmError(`address out of range: ${value}`, line);
        return value;
      },
      get byte() {
        if (value < -128 || value > 255) throw new AsmError(`byte out of range: ${value}`, line);
        return value & 0xff;
      },
      get n4() {
        if (value < 0 || value > 15) throw new AsmError(`nibble out of range: ${value}`, line);
        return value;
      },
    };
  });
  return form[1](args, line);
}

export function assemble(source, { origin = PROGRAM_START } = {}) {
  const errors = [];
  const symbols = new Map();
  const items = []; // { line, addr, kind, ... }
  let addr = origin;

  const lines = source.split(/\r?\n/);

  // ---- pass 1: sizes, labels, constants --------------------------------
  lines.forEach((raw, idx) => {
    const line = idx + 1;
    try {
      let text = stripComment(raw).trim();
      let m;
      while ((m = /^([A-Za-z_][\w.]*)\s*:/.exec(text))) {
        define(m[1], addr, line);
        text = text.slice(m[0].length).trim();
      }
      if (!text) return;

      if ((m = /^([A-Za-z_][\w.]*)\s+(?:equ\b|=)\s*(.*)$/i.exec(text)) || (m = /^([A-Za-z_][\w.]*)\s*=\s*(.*)$/.exec(text))) {
        define(m[1], evaluate(m[2], symbols, line, true), line);
        return;
      }

      const sp = text.search(/\s/);
      const word = (sp < 0 ? text : text.slice(0, sp)).toUpperCase();
      const rest = sp < 0 ? '' : text.slice(sp + 1);

      if (word === 'ORG') {
        const target = evaluate(rest, symbols, line, true);
        if (target < 0 || target >= MEMORY_SIZE) throw new AsmError(`ORG out of range: ${target}`, line);
        if (target < addr) throw new AsmError('ORG cannot move backwards', line);
        addr = target;
        return;
      }
      if (word === 'DB' || word === 'DW') {
        const values = splitOperands(rest);
        if (!values.length) throw new AsmError(`${word} needs at least one value`, line);
        const size = word === 'DB' ? 1 : 2;
        items.push({ line, addr, kind: word, values });
        addr += values.length * size;
        return;
      }
      if (!TABLE[word]) throw new AsmError(`unknown instruction "${word}"`, line);
      if (addr & 1) throw new AsmError('instruction at odd address (add a DB 0 to align)', line);
      items.push({ line, addr, kind: 'op', mnemonic: word, ops: splitOperands(rest).map(operand) });
      addr += 2;
    } catch (e) {
      if (e instanceof AsmError) errors.push({ line: e.line, message: e.detail });
      else throw e;
    }
  });

  function define(name, value, line) {
    if (/^V[0-9A-F]$/i.test(name) || RESERVED.has(name.toUpperCase()) || TABLE[name.toUpperCase()]) {
      throw new AsmError(`"${name}" is a reserved word`, line);
    }
    const key = name.toLowerCase();
    if (symbols.has(key)) throw new AsmError(`duplicate label "${name}"`, line);
    symbols.set(key, value);
  }

  if (addr > MEMORY_SIZE) errors.push({ line: lines.length, message: `program too large (${addr - origin} bytes)` });

  // ---- pass 2: encode ----------------------------------------------------
  const end = Math.min(addr, MEMORY_SIZE);
  const bytes = new Uint8Array(Math.max(0, end - origin));
  const lineOf = new Map(); // address -> source line
  const addrOf = new Map(); // source line -> address
  const put = (a, b) => { if (a >= origin && a < end) bytes[a - origin] = b & 0xff; };

  for (const it of items) {
    try {
      lineOf.set(it.addr, it.line);
      addrOf.set(it.line, it.addr);
      if (it.kind === 'op') {
        const word = encode(it.mnemonic, it.ops, symbols, it.line);
        put(it.addr, word >> 8);
        put(it.addr + 1, word);
      } else {
        it.values.forEach((expr, k) => {
          const value = evaluate(expr, symbols, it.line, true);
          if (it.kind === 'DB') {
            if (value < -128 || value > 255) throw new AsmError(`byte out of range: ${value}`, it.line);
            put(it.addr + k, value);
          } else {
            if (value < -32768 || value > 0xffff) throw new AsmError(`word out of range: ${value}`, it.line);
            put(it.addr + k * 2, value >> 8);
            put(it.addr + k * 2 + 1, value);
          }
        });
      }
    } catch (e) {
      if (e instanceof AsmError) errors.push({ line: e.line, message: e.detail });
      else throw e;
    }
  }

  errors.sort((a, b) => a.line - b.line);
  return { ok: errors.length === 0, bytes, errors, symbols, lineOf, addrOf };
}
