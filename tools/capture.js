#!/usr/bin/env node
// Capture README media from the running page with headless Chrome (DevTools protocol).
//   1. python3 -m http.server 8000
//   2. node tools/capture.js [http://localhost:8000/]
// Writes docs/screenshot.png, docs/mobile.png and PNG frames in docs/frames/
// (turn the frames into docs/demo.gif with tools/frames-to-gif.py).

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.argv[2] ?? 'http://localhost:8000/';
const PORT = 9333;
const docs = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = join(tmpdir(), `chip8-capture-${process.pid}`);
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required', 'about:blank',
], { stdio: 'ignore' });

let ws;
let nextId = 1;
const pending = new Map();
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = nextId++;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});

async function connect() {
  for (let k = 0; k < 50; k++) {
    try {
      const pages = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = pages.find((p) => p.type === 'page');
      if (page) {
        ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((r) => ws.addEventListener('open', r, { once: true }));
        ws.addEventListener('message', (e) => {
          const msg = JSON.parse(e.data);
          const p = pending.get(msg.id);
          if (!p) return;
          pending.delete(msg.id);
          msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
        });
        return;
      }
    } catch { /* not up yet */ }
    await sleep(200);
  }
  throw new Error('Chrome did not start');
}

const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result.value;

async function shot(file, clip) {
  const { data } = await send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}), captureBeyondViewport: false });
  writeFileSync(file, Buffer.from(data, 'base64'));
  console.log('wrote', file);
}

async function key(code, down) {
  await send('Input.dispatchKeyEvent', { type: down ? 'keyDown' : 'keyUp', code, key: code.replace(/^Key/, '').toLowerCase() });
}

async function open(url, width, height, scale = 1, mobile = false) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile });
  await send('Page.navigate', { url });
  await sleep(2500);
  await evaluate('document.fonts.ready.then(() => true)');
}

try {
  await connect();
  await send('Page.enable');
  await send('Runtime.enable');
  mkdirSync(docs, { recursive: true });

  // Desktop overview: boot demo running for a few seconds
  await open(`${BASE}#bounce`, 1440, 1190, 1);
  await sleep(4000);
  await shot(join(docs, 'screenshot.png'));

  // Mobile layout
  await open(`${BASE}#catch`, 390, 1500, 2, true);
  await key('KeyW', true); await sleep(80); await key('KeyW', false);
  await sleep(1500);
  await shot(join(docs, 'mobile.png'));

  // Gameplay frames of Starfall (screen element only)
  await open(`${BASE}#starfall`, 1440, 1000, 1);
  await key('KeyW', true); await sleep(80); await key('KeyW', false);
  const rect = await evaluate(`(() => { const r = document.querySelector('.bezel').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })()`);
  const framesDir = join(docs, 'frames');
  rmSync(framesDir, { recursive: true, force: true });
  mkdirSync(framesDir, { recursive: true });
  let dir = 'KeyQ';
  for (let f = 0; f < 90; f++) {
    if (f % 18 === 0) { await key(dir, false); dir = dir === 'KeyQ' ? 'KeyE' : 'KeyQ'; await key(dir, true); }
    await shot(join(framesDir, `f${String(f).padStart(3, '0')}.png`), rect);
    await sleep(50);
  }
  await key(dir, false);
} finally {
  ws?.close();
  chrome.kill();
  await sleep(300);
  rmSync(profile, { recursive: true, force: true });
}
