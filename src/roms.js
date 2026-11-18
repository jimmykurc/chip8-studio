// Catalog of the ROMs shipped with CHIP-8 Studio.
// Every ROM is an original program written with the built-in assembler;
// the .asm source lives next to the assembled .ch8 file in /roms.

export const ROMS = [
  {
    id: 'bounce',
    title: 'Bounce (boot demo)',
    quirks: 'schip',
    speed: 30,
    about: 'A chip bouncing DVD-logo style in SUPER-CHIP hi-res. The corner counts the wall hits.',
    controls: 'None, just watch it bounce.',
  },
  {
    id: 'catch',
    title: 'Catch-8 (game)',
    quirks: 'schip',
    speed: 30,
    about: 'Catch the falling bytes with your paddle. Three misses and it is over.',
    controls: '4 / 6 to move (Q / E or arrow keys). Any key to start.',
  },
  {
    id: 'starfall',
    title: 'Starfall (game)',
    quirks: 'schip',
    speed: 40,
    about: 'Dodge falling stars. Shows off hi-res, hardware scrolling and the big font.',
    controls: '4 / 6 to move (Q / E or arrow keys). Any key to start.',
  },
  {
    id: 'keypad',
    title: 'Keypad tester',
    quirks: 'chip8',
    speed: 20,
    about: 'Each key of the hex keypad lights up while it is held.',
    controls: 'Press any key.',
  },
];
