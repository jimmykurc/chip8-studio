// Canvas renderer with palette themes and phosphor persistence.
// The canvas is drawn at native resolution (64x32 or 128x64) and scaled
// up by CSS with `image-rendering: pixelated`. Lit pixels are drawn with
// alpha on a transparent canvas so a CSS drop-shadow gives them a glow.

export const THEMES = {
  phosphor: { label: 'Phosphor green', bg: '#04140b', fg: '#3dff8b', accent: '#3dff8b' },
  amber: { label: 'Amber terminal', bg: '#140b02', fg: '#ffb000', accent: '#ffb000' },
  ice: { label: 'Ice blue', bg: '#030d18', fg: '#6fd8ff', accent: '#6fd8ff' },
  synth: { label: 'Synthwave', bg: '#14061f', fg: '#ff4fd8', accent: '#ff4fd8' },
  gameboy: { label: 'Pocket LCD', bg: '#0f380f', fg: '#9bbc0f', accent: '#9bbc0f' },
  paper: { label: 'Paper white', bg: '#101010', fg: '#f4f1e8', accent: '#f4f1e8' },
};

const rgb = (hex) => [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16));

export class Display {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.fade = new Float32Array(128 * 64);
    this.persistence = true;
    this.setTheme('phosphor');
    this.resize(64, 32);
  }

  setTheme(name) {
    this.theme = THEMES[name] ?? THEMES.phosphor;
    this.color = rgb(this.theme.fg);
  }

  resize(w, h) {
    this.canvas.width = w;
    this.canvas.height = h;
    this.image = this.ctx.createImageData(w, h);
    this.fade.fill(0);
  }

  /** Draw the CPU screen; call once per 60 Hz frame so the fade is time-based. */
  render(cpu) {
    const w = cpu.width;
    const h = cpu.height;
    if (this.canvas.width !== w || this.canvas.height !== h) this.resize(w, h);
    const px = this.image.data;
    const [r, g, b] = this.color;
    const decay = this.persistence ? 0.5 : 0;
    const scr = cpu.screen;
    const fade = this.fade;
    for (let k = 0, n = w * h; k < n; k++) {
      const level = scr[k] ? 1 : fade[k] * decay;
      fade[k] = level < 0.02 ? 0 : level;
      const o = k * 4;
      px[o] = r;
      px[o + 1] = g;
      px[o + 2] = b;
      px[o + 3] = fade[k] * 255;
    }
    this.ctx.putImageData(this.image, 0, 0);
  }
}
