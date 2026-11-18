// Keyboard mapping and on-screen hex keypad.
//
//   CHIP-8 keypad     Keyboard (physical keys, QWERTY labels)
//   1 2 3 C           1 2 3 4
//   4 5 6 D           Q W E R
//   7 8 9 E           A S D F
//   A 0 B F           Z X C V
//   Arrows map to 2 / 4 / 6 / 8 and Space to 5.

export const KEYPAD_LAYOUT = [0x1, 0x2, 0x3, 0xc, 0x4, 0x5, 0x6, 0xd, 0x7, 0x8, 0x9, 0xe, 0xa, 0x0, 0xb, 0xf];

const CODES = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyZ', 'KeyX', 'KeyC', 'KeyV'];
const LABELS = ['1', '2', '3', '4', 'Q', 'W', 'E', 'R', 'A', 'S', 'D', 'F', 'Z', 'X', 'C', 'V'];

export const KEY_MAP = Object.fromEntries(CODES.map((code, k) => [code, KEYPAD_LAYOUT[k]]));
Object.assign(KEY_MAP, { ArrowUp: 0x2, ArrowLeft: 0x4, ArrowRight: 0x6, ArrowDown: 0x8, Space: 0x5 });

const isTyping = (el) => el && (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || (el.tagName === 'INPUT' && el.type !== 'range' && el.type !== 'checkbox'));

/**
 * Wire the physical keyboard and build the on-screen keypad.
 * `onKey(key, down)` is called for every change.
 */
export function setupInput(keypadEl, onKey) {
  const held = new Map(); // key -> number of sources holding it
  const buttons = new Map();

  const press = (key, down) => {
    const count = (held.get(key) ?? 0) + (down ? 1 : -1);
    const was = (held.get(key) ?? 0) > 0;
    held.set(key, Math.max(0, count));
    const now = count > 0;
    buttons.get(key)?.classList.toggle('down', now);
    if (now !== was) onKey(key, now);
  };

  KEYPAD_LAYOUT.forEach((key, k) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'key';
    b.innerHTML = `<span class="hex">${key.toString(16).toUpperCase()}</span><span class="kbd">${LABELS[k]}</span>`;
    b.setAttribute('aria-label', `Key ${key.toString(16).toUpperCase()} (keyboard ${LABELS[k]})`);
    let active = false;
    const down = (e) => {
      e.preventDefault();
      if (active) return;
      active = true;
      b.setPointerCapture?.(e.pointerId);
      press(key, true);
    };
    const up = () => {
      if (!active) return;
      active = false;
      press(key, false);
    };
    b.addEventListener('pointerdown', down);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('lostpointercapture', up);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    buttons.set(key, b);
    keypadEl.append(b);
  });

  const physical = new Set();
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || isTyping(document.activeElement)) return;
    const key = KEY_MAP[e.code];
    if (key === undefined) return;
    e.preventDefault();
    if (physical.has(e.code)) return; // auto-repeat
    physical.add(e.code);
    press(key, true);
  });
  window.addEventListener('keyup', (e) => {
    const key = KEY_MAP[e.code];
    if (key === undefined || !physical.has(e.code)) return;
    physical.delete(e.code);
    press(key, false);
  });
  window.addEventListener('blur', () => {
    for (const code of physical) press(KEY_MAP[code], false);
    physical.clear();
  });
}
