// CHIP-8 Studio: wires the emulator core to the page.

import { Chip8, Chip8Error, QUIRK_PRESETS, PRESET_LABELS } from './core/chip8.js';
import { assemble } from './core/assembler.js';
import { Display, THEMES } from './ui/display.js';
import { Beeper } from './ui/audio.js';
import { setupInput } from './ui/input.js';
import { Debugger } from './ui/debugger.js';
import { Editor } from './ui/editor.js';
import { ROMS } from './roms.js';

const $ = (id) => document.getElementById(id);
const FRAME_MS = 1000 / 60;
const EXAMPLES = [{ id: 'hello', title: 'Hello (tutorial)' }, ...ROMS];

const store = {
  get(key, fallback) {
    try { return localStorage.getItem('chip8studio.' + key) ?? fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem('chip8studio.' + key, value); } catch { /* private mode */ }
  },
};

// ---- state -----------------------------------------------------------------

const cpu = new Chip8({ quirks: QUIRK_PRESETS.schip });
const display = new Display($('screen'));
const beeper = new Beeper();
const state = {
  running: false,
  ipf: 30,
  romName: '',
  lineOf: null, // address -> editor line, when the program came from the editor source
  sourceClean: false,
  lastError: null,
  frame: 0,
};

const dbg = new Debugger(
  {
    regs: $('regs'), disasm: $('disasm'), stack: $('stack'), memory: $('memory'),
    memFollow: $('mem-follow'), memGoto: $('mem-goto'), sprite: $('sprite'), spriteAddr: $('sprite-addr'),
  },
  {
    onToggleBreakpoint(addr) {
      if (dbg.breakpoints.has(addr)) dbg.breakpoints.delete(addr);
      else dbg.breakpoints.add(addr);
      refreshDebugger();
      setStatus(`Breakpoint ${dbg.breakpoints.has(addr) ? 'set' : 'cleared'} at ${hex(addr, 3)}`);
    },
  },
);

const editor = new Editor(
  { textarea: $('source'), highlight: $('highlight'), gutter: $('gutter') },
  {
    onChange() {
      state.sourceClean = false;
      editor.setCurrentLine(0);
    },
    onRun: assembleAndRun,
  },
);

const hex = (n, w = 2) => '#' + n.toString(16).toUpperCase().padStart(w, '0');

// ---- main loop -------------------------------------------------------------

let last = performance.now();
let acc = 0;

function loop(now) {
  acc += Math.min(now - last, 100);
  last = now;
  let frames = 0;
  while (acc >= FRAME_MS) {
    acc -= FRAME_MS;
    frame();
    frames++;
  }
  if (frames) {
    display.render(cpu);
    if (!state.running || state.frame % 4 === 0) refreshDebugger();
  }
  requestAnimationFrame(loop);
}

function frame() {
  state.frame++;
  if (!state.running) {
    beeper.set(false);
    return;
  }
  try {
    const result = cpu.runFrame(state.ipf, (pc) => dbg.breakpoints.has(pc));
    if (result === 'break') {
      pause(`Breakpoint hit at ${hex(cpu.pc, 3)}`);
    } else if (result === 'halt') {
      pause('Program exited (00FD)');
    }
  } catch (e) {
    if (!(e instanceof Chip8Error)) throw e;
    state.lastError = e.message;
    pause(e.message, true);
  }
  cpu.tickTimers();
  beeper.set(cpu.st > 0);
}

function refreshDebugger() {
  dbg.update(cpu);
  if (state.lineOf && state.sourceClean) editor.setCurrentLine(state.lineOf.get(cpu.pc) ?? 0);
  $('cycles').textContent = cpu.cycles.toLocaleString('en-US');
  $('mode').textContent = `${cpu.width}x${cpu.height}${cpu.waiting ? ' · waiting for key' : ''}`;
}

// ---- run control -------------------------------------------------------------

function setStatus(text, error = false) {
  const el = $('status');
  el.textContent = text;
  el.classList.toggle('error', error);
}

function run() {
  if (cpu.halted) cpu.reset();
  state.running = true;
  state.lastError = null;
  $('run').textContent = 'Pause';
  $('run').classList.add('active');
  document.body.classList.add('running');
  setStatus(`Running ${state.romName}`);
}

function pause(reason = 'Paused', error = false) {
  state.running = false;
  beeper.set(false);
  $('run').textContent = 'Run';
  $('run').classList.remove('active');
  document.body.classList.remove('running');
  setStatus(reason, error);
  refreshDebugger();
}

function step() {
  if (state.running) pause();
  try {
    if (!cpu.step()) setStatus(cpu.waiting ? 'Waiting for a key press (FX0A)' : cpu.halted ? 'Program exited' : 'Waiting for vblank');
    else setStatus(`Stepped to ${hex(cpu.pc, 3)}`);
  } catch (e) {
    if (!(e instanceof Chip8Error)) throw e;
    setStatus(e.message, true);
  }
  display.render(cpu);
  refreshDebugger();
}

function stepFrame() {
  if (state.running) pause();
  state.running = true;
  frame();
  if (state.running) {
    state.running = false;
    setStatus(`Ran one frame (${state.ipf} instructions)`);
  }
  display.render(cpu);
  refreshDebugger();
}

function reset() {
  cpu.reset();
  display.render(cpu);
  run();
}

// ---- loading -----------------------------------------------------------------

function loadBytes(bytes, { name, preset, speed, lineOf = null, labels = null } = {}) {
  if (preset) applyPreset(preset);
  if (speed) setSpeed(speed);
  try {
    cpu.loadRom(bytes);
  } catch (e) {
    setStatus(e.message, true);
    return false;
  }
  state.romName = name;
  state.lineOf = lineOf;
  dbg.setLabels(labels);
  dbg.breakpoints.clear();
  $('rom-info').textContent = `${name} · ${bytes.length} bytes`;
  document.title = `${name} · CHIP-8 Studio`;
  run();
  return true;
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.text();
}

async function loadCatalogRom(id) {
  const meta = ROMS.find((r) => r.id === id) ?? ROMS[0];
  $('rom-select').value = meta.id;
  $('rom-about').innerHTML = `<b>${meta.title}</b> · ${meta.about} <span class="controls">${meta.controls}</span>`;
  try {
    const [bin, src] = await Promise.all([
      fetch(`roms/${meta.id}.ch8`).then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); }),
      fetchText(`roms/${meta.id}.asm`).catch(() => null),
    ]);
    let lineOf = null;
    let labels = null;
    if (src) {
      editor.value = src;
      $('example-select').value = meta.id;
      const built = assemble(src);
      if (built.ok) ({ lineOf, labels } = built);
    }
    state.sourceClean = Boolean(src);
    loadBytes(new Uint8Array(bin), { name: meta.title, preset: meta.quirks, speed: meta.speed, lineOf, labels });
    if (location.hash !== `#${meta.id}`) history.replaceState(null, '', `#${meta.id}`);
  } catch (e) {
    setStatus(`Could not load ${meta.id}: ${e.message}`, true);
  }
}

async function loadFile(file) {
  if (!file) return;
  if (/\.(asm|8o|txt|s)$/i.test(file.name)) {
    editor.value = await file.text();
    $('example-select').value = '';
    assembleAndRun(file.name);
    return;
  }
  if (file.size > 4096 - 512) {
    setStatus(`${file.name} is too large for CHIP-8 (${file.size} bytes)`, true);
    return;
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  state.sourceClean = false;
  editor.setCurrentLine(0);
  $('rom-select').value = '';
  $('rom-about').innerHTML = `<b>${escapeHtml(file.name)}</b> · your own ROM. If it misbehaves, try another quirk preset below.`;
  loadBytes(bytes, { name: file.name });
  history.replaceState(null, '', location.pathname);
}

function assembleAndRun(name) {
  const result = assemble(editor.value);
  editor.setErrors(result.errors);
  const out = $('asm-output');
  if (!result.ok) {
    out.className = 'asm-output error';
    out.innerHTML = result.errors
      .map((e) => `<button type="button" data-line="${e.line}">line ${e.line}</button> ${escapeHtml(e.message)}`)
      .join('<br>');
    setStatus(`Assembly failed: ${result.errors.length} error${result.errors.length > 1 ? 's' : ''}`, true);
    return;
  }
  out.className = 'asm-output ok';
  out.textContent = `Assembled ${result.bytes.length} bytes, ${result.labels.size} labels. Running.`;
  state.sourceClean = true;
  state.lastBuild = result.bytes;
  const title = typeof name === 'string' ? name : 'Editor program';
  $('rom-select').value = '';
  history.replaceState(null, '', location.pathname);
  loadBytes(result.bytes, { name: title, lineOf: result.lineOf, labels: result.labels });
}

function downloadBuild() {
  const result = assemble(editor.value);
  if (!result.ok) return assembleAndRun();
  const blob = new Blob([result.bytes], { type: 'application/octet-stream' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = ($('example-select').value || 'program') + '.ch8';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// ---- settings ----------------------------------------------------------------

const QUIRK_KEYS = ['shift', 'loadStore', 'jump', 'vblank', 'vfReset', 'clip'];

function applyPreset(name) {
  const preset = QUIRK_PRESETS[name];
  if (!preset) return;
  cpu.quirks = { ...preset };
  $('preset').value = name;
  syncQuirkBoxes();
}

function syncQuirkBoxes() {
  for (const k of QUIRK_KEYS) $(`q-${k}`).checked = cpu.quirks[k];
}

function setSpeed(ipf) {
  state.ipf = Number(ipf);
  $('speed').value = state.ipf;
  $('speed-out').textContent = `${state.ipf} / frame · ${(state.ipf * 60).toLocaleString('en-US')} Hz`;
}

function setTheme(name) {
  const theme = THEMES[name] ? name : 'phosphor';
  display.setTheme(theme);
  const t = THEMES[theme];
  const root = document.documentElement.style;
  root.setProperty('--accent', t.accent);
  root.setProperty('--screen-bg', t.bg);
  root.setProperty('--pixel', t.fg);
  $('theme').value = theme;
  store.set('theme', theme);
  display.render(cpu);
  refreshDebugger();
}

// ---- wiring ------------------------------------------------------------------

function init() {
  // selects
  $('rom-select').innerHTML = ROMS.map((r) => `<option value="${r.id}">${r.title}</option>`).join('') + '<option value="" hidden>Your file</option>';
  $('example-select').innerHTML = '<option value="">Examples…</option>' + EXAMPLES.map((r) => `<option value="${r.id}">${r.title}</option>`).join('');
  $('theme').innerHTML = Object.entries(THEMES).map(([id, t]) => `<option value="${id}">${t.label}</option>`).join('');
  $('preset').innerHTML = Object.entries(PRESET_LABELS).map(([id, l]) => `<option value="${id}">${l}</option>`).join('') + '<option value="custom" hidden>Custom</option>';

  $('rom-select').addEventListener('change', (e) => e.target.value && loadCatalogRom(e.target.value));
  $('open-file').addEventListener('click', () => $('file-input').click());
  $('file-input').addEventListener('change', (e) => { loadFile(e.target.files[0]); e.target.value = ''; });
  $('theme').addEventListener('change', (e) => setTheme(e.target.value));
  $('persistence').addEventListener('change', (e) => { display.persistence = e.target.checked; store.set('persistence', e.target.checked ? '1' : '0'); });
  $('scanlines').addEventListener('change', (e) => { document.body.classList.toggle('no-scanlines', !e.target.checked); store.set('scanlines', e.target.checked ? '1' : '0'); });

  $('run').addEventListener('click', () => (state.running ? pause() : run()));
  $('step').addEventListener('click', step);
  $('step-frame').addEventListener('click', stepFrame);
  $('reset').addEventListener('click', reset);
  $('mute').addEventListener('click', () => {
    beeper.muted = !beeper.muted;
    $('mute').textContent = beeper.muted ? 'Sound off' : 'Sound on';
    $('mute').classList.toggle('active', !beeper.muted);
    $('mute').setAttribute('aria-pressed', String(!beeper.muted));
  });
  $('speed').addEventListener('input', (e) => setSpeed(e.target.value));
  $('preset').addEventListener('change', (e) => applyPreset(e.target.value));
  for (const k of QUIRK_KEYS) {
    $(`q-${k}`).addEventListener('change', (e) => {
      cpu.quirks[k] = e.target.checked;
      const match = Object.entries(QUIRK_PRESETS).find(([, p]) => QUIRK_KEYS.every((q) => p[q] === cpu.quirks[q]));
      $('preset').value = match ? match[0] : 'custom';
    });
  }
  $('clear-bp').addEventListener('click', () => { dbg.breakpoints.clear(); refreshDebugger(); setStatus('Breakpoints cleared'); });

  $('assemble').addEventListener('click', () => assembleAndRun());
  $('download').addEventListener('click', downloadBuild);
  $('example-select').addEventListener('change', async (e) => {
    const id = e.target.value;
    if (!id) return;
    try {
      editor.value = await fetchText(`roms/${id}.asm`);
      state.sourceClean = false;
      $('asm-output').className = 'asm-output';
      $('asm-output').textContent = 'Loaded. Press "Assemble & run" (Ctrl+Enter) to try it.';
    } catch (err) {
      setStatus(err.message, true);
    }
  });
  $('asm-output').addEventListener('click', (e) => {
    const line = e.target.dataset?.line;
    if (line) editor.goToLine(Number(line));
  });

  setupInput($('keypad'), (key, down) => {
    beeper.unlock();
    if (down) cpu.keyDown(key);
    else cpu.keyUp(key);
  });

  // shortcuts outside text fields: P run/pause, N step, M frame step
  window.addEventListener('keydown', (e) => {
    const el = document.activeElement;
    if (e.ctrlKey || e.metaKey || e.altKey || (el && /^(TEXTAREA|INPUT|SELECT)$/.test(el.tagName) && el.type !== 'range' && el.type !== 'checkbox')) return;
    if (e.code === 'KeyP') { e.preventDefault(); state.running ? pause() : run(); }
    else if (e.code === 'KeyN') { e.preventDefault(); step(); }
    else if (e.code === 'KeyM') { e.preventDefault(); stepFrame(); }
  });
  for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, () => beeper.unlock(), { capture: true });

  // drag and drop anywhere on the page
  let depth = 0;
  window.addEventListener('dragenter', (e) => { e.preventDefault(); depth++; document.body.classList.add('dragging'); });
  window.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; document.body.classList.remove('dragging'); } });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    depth = 0;
    document.body.classList.remove('dragging');
    loadFile(e.dataTransfer?.files?.[0]);
  });

  // restore preferences
  setTheme(store.get('theme', 'phosphor'));
  display.persistence = store.get('persistence', '1') === '1';
  $('persistence').checked = display.persistence;
  const scan = store.get('scanlines', '1') === '1';
  $('scanlines').checked = scan;
  document.body.classList.toggle('no-scanlines', !scan);
  setSpeed(state.ipf);
  syncQuirkBoxes();

  window.addEventListener('hashchange', () => {
    const id = location.hash.slice(1);
    if (ROMS.some((r) => r.id === id)) loadCatalogRom(id);
  });

  const initial = location.hash.slice(1);
  loadCatalogRom(ROMS.some((r) => r.id === initial) ? initial : 'bounce');
  requestAnimationFrame(loop);
}

init();
