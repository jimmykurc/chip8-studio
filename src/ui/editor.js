// Lightweight code editor: a textarea over a syntax-highlighted <pre>,
// with a line-number gutter, error markers and the current-line marker.

import { MNEMONICS } from '../core/assembler.js';

const MNEMONIC_SET = new Set(MNEMONICS);
const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

function highlightLine(line) {
  let code = line;
  let comment = '';
  const semi = line.indexOf(';');
  if (semi >= 0) {
    code = line.slice(0, semi);
    comment = line.slice(semi);
  }
  const html = esc(code).replace(
    /([A-Za-z_][\w.]*:)|(\b[Vv][0-9A-Fa-f]\b|\[I\]|\b(?:I|DT|ST|K|HF|F|B|R)\b)|((?:#|\$|0x)[0-9A-Fa-f]+\b|(?:0b|%)[01]+\b|\b\d+\b)|(\b[A-Za-z]+\b)/g,
    (m, label, reg, num, word) => {
      if (label) return `<span class="t-label">${label}</span>`;
      if (reg) return `<span class="t-reg">${reg}</span>`;
      if (num) return `<span class="t-num">${num}</span>`;
      const u = word.toUpperCase();
      if (MNEMONIC_SET.has(u)) return `<span class="t-op">${word}</span>`;
      if (u === 'DB' || u === 'DW' || u === 'ORG' || u === 'EQU') return `<span class="t-dir">${word}</span>`;
      return word;
    },
  );
  return html + (comment ? `<span class="t-comment">${esc(comment)}</span>` : '');
}

export class Editor {
  constructor({ textarea, highlight, gutter }, { onChange, onRun }) {
    this.ta = textarea;
    this.hl = highlight;
    this.gutter = gutter;
    this.errors = new Map();
    this.currentLine = 0;
    this.onChange = onChange;

    this.ta.addEventListener('input', () => {
      this.render();
      this.onChange?.();
    });
    this.ta.addEventListener('scroll', () => this.syncScroll());
    this.ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        onRun?.();
      } else if (e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        document.execCommand?.('insertText', false, '  ') || this.insert('  ');
      }
    });
  }

  insert(text) {
    const { selectionStart: a, selectionEnd: b, value } = this.ta;
    this.ta.value = value.slice(0, a) + text + value.slice(b);
    this.ta.selectionStart = this.ta.selectionEnd = a + text.length;
    this.render();
  }

  get value() { return this.ta.value; }

  set value(text) {
    this.ta.value = text;
    this.ta.scrollTop = 0;
    this.errors = new Map();
    this.currentLine = 0;
    this.render();
  }

  setErrors(list) {
    this.errors = new Map(list.map((e) => [e.line, e.message]));
    this.render();
  }

  setCurrentLine(line) {
    if (line === this.currentLine) return;
    this.currentLine = line;
    this.renderGutter();
    this.renderHighlight();
  }

  goToLine(line) {
    const lines = this.ta.value.split('\n');
    const start = lines.slice(0, line - 1).reduce((n, l) => n + l.length + 1, 0);
    this.ta.focus();
    this.ta.setSelectionRange(start, start + (lines[line - 1]?.length ?? 0));
    const lh = parseFloat(getComputedStyle(this.ta).lineHeight) || 18;
    this.ta.scrollTop = Math.max(0, (line - 5) * lh);
  }

  render() {
    this.renderGutter();
    this.renderHighlight();
    this.syncScroll();
  }

  renderGutter() {
    const count = this.ta.value.split('\n').length;
    let out = '';
    for (let n = 1; n <= count; n++) {
      const cls = this.errors.has(n) ? 'err' : n === this.currentLine ? 'cur' : '';
      out += cls ? `<span class="${cls}" title="${esc(this.errors.get(n) ?? 'current instruction')}">${n}</span>\n` : `${n}\n`;
    }
    this.gutter.innerHTML = out;
  }

  renderHighlight() {
    const lines = this.ta.value.split('\n');
    this.hl.innerHTML = lines
      .map((l, k) => {
        const n = k + 1;
        const body = highlightLine(l) || ' ';
        if (this.errors.has(n)) return `<span class="l-err">${body}</span>`;
        if (n === this.currentLine) return `<span class="l-cur">${body}</span>`;
        return body;
      })
      .join('\n') + '\n';
  }

  syncScroll() {
    this.hl.style.transform = `translate(${-this.ta.scrollLeft}px, ${-this.ta.scrollTop}px)`;
    this.gutter.style.transform = `translateY(${-this.ta.scrollTop}px)`;
  }
}
