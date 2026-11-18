// Debugger panel: registers, timers, stack, disassembly with breakpoints,
// memory view and a sprite preview of the bytes at I.

import { disassemble } from '../core/disasm.js';

const hx = (n, w = 2) => n.toString(16).toUpperCase().padStart(w, '0');
const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

const DISASM_LINES = 22;
const MEM_ROWS = 16;

export class Debugger {
  constructor(els, { onToggleBreakpoint }) {
    this.els = els;
    this.onToggleBreakpoint = onToggleBreakpoint;
    this.breakpoints = new Set();
    this.labels = new Map(); // addr -> label name
    this.windowStart = 0x200;
    this.memFollow = 'pc';
    this.memStart = 0x200;
    this.prev = null;
    this.buildRegisters();

    els.disasm.addEventListener('click', (e) => {
      const row = e.target.closest('[data-addr]');
      if (row) this.onToggleBreakpoint(Number(row.dataset.addr));
    });
    els.memFollow.addEventListener('change', () => {
      this.memFollow = els.memFollow.value;
      this.dirty = true;
    });
    els.memGoto.addEventListener('change', () => {
      const a = parseInt(els.memGoto.value.replace(/^(#|0x|\$)/i, ''), 16);
      if (Number.isNaN(a)) return;
      this.memFollow = 'none';
      els.memFollow.value = 'none';
      this.memStart = Math.max(0, Math.min(0x1000 - MEM_ROWS * 16, a & 0xff0));
      this.dirty = true;
    });
    this.spriteCtx = els.sprite.getContext('2d');
  }

  /** `labels`: Map address -> name, from the assembler (or null). */
  setLabels(labels) {
    this.labels = labels ?? new Map();
  }

  buildRegisters() {
    const cells = [];
    for (let r = 0; r < 16; r++) cells.push(`<div class="reg" id="reg-v${r}"><span>V${hx(r, 1)}</span><b>00</b></div>`);
    for (const name of ['PC', 'I', 'SP', 'DT', 'ST']) cells.push(`<div class="reg${['PC', 'I', 'SP'].includes(name) ? ' wide' : ''}" id="reg-${name.toLowerCase()}"><span>${name}</span><b>00</b></div>`);
    this.els.regs.innerHTML = cells.join('');
    this.regEls = {};
    for (const el of this.els.regs.querySelectorAll('.reg')) this.regEls[el.id.slice(4)] = el.querySelector('b');
  }

  update(cpu) {
    this.updateRegisters(cpu);
    this.updateDisassembly(cpu);
    this.updateStack(cpu);
    this.updateMemory(cpu);
    this.updateSprite(cpu);
  }

  updateRegisters(cpu) {
    const now = {
      pc: hx(cpu.pc, 3), i: hx(cpu.i, 3), sp: String(cpu.stack.length), dt: hx(cpu.dt), st: hx(cpu.st),
    };
    for (let r = 0; r < 16; r++) now['v' + r] = hx(cpu.v[r]);
    for (const [k, val] of Object.entries(now)) {
      const el = this.regEls[k];
      if (el.textContent !== val) {
        el.textContent = val;
        if (this.prev) {
          el.parentElement.classList.remove('changed');
          void el.offsetWidth; // restart the flash animation
          el.parentElement.classList.add('changed');
        }
      }
    }
    this.prev = now;
  }

  updateDisassembly(cpu) {
    const pc = cpu.pc;
    const span = DISASM_LINES * 2;
    const parityOk = ((pc - this.windowStart) & 1) === 0;
    if (!parityOk || pc < this.windowStart + 4 || pc >= this.windowStart + span - 6) {
      this.windowStart = Math.max(0, Math.min(0x1000 - span, pc - 8));
    }
    const rows = [];
    for (let k = 0; k < DISASM_LINES; k++) {
      const addr = this.windowStart + k * 2;
      const op = cpu.opcodeAt(addr);
      const label = this.labels.get(addr);
      const cls = ['line'];
      if (addr === pc) cls.push('current');
      if (this.breakpoints.has(addr)) cls.push('bp');
      let text = esc(disassemble(op));
      // show label names for jump / call / LD I targets
      text = text.replace(/#([0-9A-F]{3})$/, (m, a) => {
        const name = this.labels.get(parseInt(a, 16));
        return name && /^(JP|CALL|LD I)/.test(text) ? `<i>${esc(name)}</i>` : m;
      });
      rows.push(
        (label ? `<div class="label">${esc(label)}:</div>` : '') +
        `<div class="${cls.join(' ')}" data-addr="${addr}" title="Click to toggle a breakpoint"><span class="dot"></span><span class="addr">${hx(addr, 3)}</span><span class="op">${hx(op, 4)}</span><span class="txt">${text}</span></div>`,
      );
    }
    this.els.disasm.innerHTML = rows.join('');
  }

  updateStack(cpu) {
    const rows = [];
    for (let k = 15; k >= 0; k--) {
      const v = cpu.stack[k];
      rows.push(`<div class="slot${v === undefined ? ' empty' : ''}${k === cpu.stack.length - 1 ? ' top' : ''}"><span>${hx(k, 1)}</span>${v === undefined ? '---' : hx(v, 3)}</div>`);
    }
    this.els.stack.innerHTML = rows.join('');
  }

  updateMemory(cpu) {
    if (this.memFollow === 'pc' || this.memFollow === 'i') {
      const target = this.memFollow === 'pc' ? cpu.pc : cpu.i;
      if (target < this.memStart || target >= this.memStart + MEM_ROWS * 16) {
        this.memStart = Math.max(0, Math.min(0x1000 - MEM_ROWS * 16, (target & 0xff0) - 0x40));
      }
    }
    const mem = cpu.memory;
    const out = [];
    for (let r = 0; r < MEM_ROWS; r++) {
      const base = this.memStart + r * 16;
      let line = `<span class="addr">${hx(base, 3)}</span>`;
      for (let c = 0; c < 16; c++) {
        const a = base + c;
        const cls = a === cpu.pc || a === cpu.pc + 1 ? 'pc' : a === cpu.i ? 'i' : mem[a] === 0 ? 'zero' : '';
        line += `<span class="${cls}">${hx(mem[a])}</span>`;
      }
      out.push(`<div>${line}</div>`);
    }
    this.els.memory.innerHTML = out.join('');
  }

  updateSprite(cpu) {
    const ctx = this.spriteCtx;
    const { width, height } = this.els.sprite;
    const color = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#3dff8b';
    ctx.clearRect(0, 0, width, height);
    const rows = 16;
    const cell = Math.floor(height / rows);
    ctx.fillStyle = color;
    for (let r = 0; r < rows; r++) {
      const byte = cpu.memory[(cpu.i + r) & 0xfff];
      for (let b = 0; b < 8; b++) if (byte & (0x80 >> b)) ctx.fillRect(b * cell + 1, r * cell + 1, cell - 2, cell - 2);
    }
    this.els.spriteAddr.textContent = hx(cpu.i, 3);
  }
}
