/* Diarrhea Blasters — a two-player co-op platformer. Master walks. Blaster blasts. */
'use strict';
(() => {
const BUILD = '2026.10.28-a';
// ============================================================ utils
const W = 480, H = 272, T = 16;
const TAU = Math.PI * 2;
const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const approach = (v, t, d) => (v < t ? Math.min(v + d, t) : Math.max(v - d, t));
const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const fmtTime = (s) => { s = Math.max(0, s); const m = Math.floor(s / 60); return m + ':' + (s % 60).toFixed(1).padStart(4, '0'); };
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
};
const SAVE_KEY = 'diarrhea-blasters-v1';
const save = Object.assign({ unlocked: 1, best: {}, muted: false }, store.get(SAVE_KEY) || {});
const persist = () => store.set(SAVE_KEY, save);

// Stages. # ground, T toilet paper, ^ spikes, F fire, - plank, a-e bowls that open doors 1-5,
// M Master, X Blaster, C porta-potty checkpoint, B burrito, P plunger, ? sign (texts in order), G the Golden Throne.
const LEVELS = [
  {
    name: "The Rumbling", theme: 'meadow',
    signs: [
      "MASTER: A/D to walk, W or SPACE to jump. Get to the Golden Throne.",
      "BLASTER: ARROWS to fly. Hold a direction and press / or SHIFT to blast that way. Keep blasting and the ARROWS steer you.",
      "Too tall to jump! BLASTER: get below Master and blast upward to lift him. Master, jump into the stream.",
      "Too wide! Spray the cliff edge to grow a crust bridge, or blast Master across. Crust crumbles!",
      "BLASTER: hold . or ENTER to charge a MEGA BLAST. It launches Master and splats a big crust. Burritos refill your tank.",
    ],
    map: [
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "                                               ##",
      "                                               ##",
      "                        ##                     ##",
      "    X                   ##                B    ##",
      "                        ##                     ##",
      "  M   ?   ?         ?   ## ?         C ?       ##           G",
      "###############  ############      ###############################",
      "###############  ############      ###############################",
      "###############  ############      ###############################",
      "###############  ############      ###############################",
    ],
  },
  {
    name: "Spike Alley", theme: 'dusk',
    signs: [
      "Spikes! BLASTER: spray them until they crust over. Then walk across, quick.",
    ],
    map: [
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "                                            ##",
      "                                            ##                                ####",
      "                                            ##                        B",
      "    X                                    B  ##",
      "                                            ##        #   #   #",
      "  M   ?       ^^^^^^^^    C                 ##     ^^^#^^^#^^^#^^^^ C    ^^^^^^^^^^^^^^^^   G",
      "#################################     ##########################################################",
      "#############################^^^^^^^^^##########################################################",
      "################################################################################################",
      "################################################################################################",
    ],
  },
  {
    name: "Paper Trail", theme: 'bath',
    signs: [
      "A wall of toilet paper. BLASTER: soak it until it dissolves.",
      "Careful. That bridge is paper too.",
    ],
    map: [
      "              ###########################       #######################     ###############",
      "              ###########################       #######################     ###############",
      "              ###########################       #######################     ###############",
      "              TT        TT     TT               #######################     ###############",
      "              TT        TT     TT                                 TT            TT        TT",
      "              TT        TT     TT                                 TT            TT        TT",
      "              TT        TT     TT                                 TT            TT        TT",
      "              TT        TT     TT                                 TT            TT        TT",
      "              TT        TT     TT                                 TT            ##        TT",
      "              TT        TT     TT                                 TT            ##        TT",
      "    X         TT   B    TT     TT                                 ##            ##        TT",
      "              TT        ##     TT                  B              ##            ##        TT",
      "  M   ?       TT        ##     TT    C ?                       C  ##            ##   C    TT       G",
      "#########################################TTTTTTT#####       ##############      ########################",
      "#########################################       #####       ##############      ########################",
      "#########################################       #####       ##############      ########################",
      "#########################################       #####       ##############      ########################",
    ],
  },
  {
    name: "Firewall", theme: 'fire',
    signs: [
      "Fire! BLASTER: you know what to do.",
      "Plungers! Blast them back. A MEGA BLAST sends them home.",
    ],
    map: [
      "",
      "",
      "",
      "",
      "                                                                                    ------",
      "",
      "                                                 B  FFF   P",
      "                                                    #########",
      "                                                    #########                                FF",
      "                                   FFFFFF           #########                                ##",
      "    X                              ######           #########                                ##",
      "                                   ######           #########                                ##",
      "  M   ?     FFF   ?      P    P    ###### C         #########        C     P    P   FFFFFF   ##         G",
      "##############################################      #########      ###########################################",
      "##############################################      #########      ###########################################",
      "##############################################      #########      ###########################################",
      "##############################################      #########      ###########################################",
    ],
  },
  {
    name: "Bowl Movement", theme: 'porcelain',
    signs: [
      "A locked door. BLASTER: fill the toilet bowl with your stream to open it.",
    ],
    map: [
      "         ######################               33              #########                       5",
      "         ######################               33              #########                       5",
      "            a   1             2               33        ###       d   4                       5",
      "                1             2         c     33         d            4                       5",
      "                1             2               33                      4                  e    5",
      "                1             2               33                      4                       5",
      "                1      b      2               33                      4                       5",
      "                1    ######   2               33                      4                       5",
      "                1             2               33                      4          e            5",
      "                1             2               33       ^^^^^          4    B  #######         5",
      "    X           1             2               33       #####          4       #######         5",
      "                1             2               33       #####          4       #######         5",
      "  M   ?         1  b          2  C            33    C  #####   P      4  C    #######         5    G",
      "####################################        ##########################################      ############",
      "####################################        ##########################################      ############",
      "####################################        ##########################################      ############",
      "####################################        ##########################################      ############",
    ],
  },
  {
    name: "Septic Ascent", theme: 'sewer',
    signs: [
      "Up is the only way out. One-way planks can be jumped through from below.",
    ],
    map: [
      "#                            #",
      "#                            #",
      "#                            #",
      "#                            #",
      "#                            #",
      "#              G             #",
      "#        ############        #",
      "#                            #",
      "#                            #",
      "#----                     B  #",
      "#                        ----#",
      "#                            #",
      "#                            #",
      "#                            #",
      "#        ^^^^^^^^^^^^        #",
      "#     ###################    #",
      "#                            #",
      "#                            #",
      "#                            #",
      "#                            #",
      "#                            #",
      "#   C                        #",
      "#############1111111111111111#",
      "#                            #",
      "#                            #",
      "#                            #",
      "#               B          ###",
      "#   FFFFFF                a###",
      "#############              ###",
      "#                            #",
      "#                            #",
      "#                            #",
      "#                            #",
      "#         P        C         #",
      "#############TTTT#############",
      "#            TTTT            #",
      "#                            #",
      "#                            #",
      "#------                      #",
      "#                            #",
      "#                      ------#",
      "#                            #",
      "#                            #",
      "#                            #",
      "#                       B    #",
      "#           C ^^^^^          #",
      "#         #############      #",
      "#                            #",
      "#                            #",
      "#                            #",
      "#--------                    #",
      "#                   FF       #",
      "#                   FF       #",
      "#                   FF       #",
      "#                   FF       #",
      "#             ################",
      "#             ################",
      "#             ################",
      "#      X      ################",
      "#             ################",
      "#   M    ?    ################",
      "##############################",
      "##############################",
      "##############################",
    ],
  },
  {
    name: "The Final Flush", theme: 'gold',
    signs: [
      "The Golden Throne awaits. Everything you have learned. Everything you have eaten.",
    ],
    map: [
      "                                    #######################                                                 ##################",
      "                                    #######################                                                 ##################",
      "                                    #######################                                                 ##################",
      "                                      TT             a   1                              FFFFF                   b            2",
      "                                      TT                 1                              #####                                2",
      "                                      TT                 1            B                 #####                                2         ##",
      "                          B  FF       TT                 1                              #####                                2         ##",
      "                             ##       TT                 1                              #####                                2         ##",
      "                             ##       TT                 1                              #####    P                           2         ##",
      "                             ##       TT                 1               ^^^^           #####  #####      B                  2         ##",
      "    X                        ##       TT                 1               ####           #####                                2         ##",
      "                             ##       TT                 1               ####           #####                      TTT       2         ##",
      "  M   ?     ^^^^^^^          ##   C   TT    P    P       1   C           ####        C  #####FFFFFFFF   C          TTT  b    2         ## ^^^^   G",
      "######################       ###################################         ####      #############################################       ###############",
      "######################       ###################################         ####      #############################################       ###############",
      "######################       ###################################         ####      #############################################   #   ###############",
      "######################       ###################################         ####      #############################################   #   ###############",
    ],
  },
];

const THEMES = {
  meadow: { sky: ['#78c4ee', '#d6f1ff'], far: '#9fd49a', near: '#7cbf6c', ground: '#8a5b33', dark: '#6b4425', top: '#5cb648', topD: '#3f8f35' },
  dusk: { sky: ['#f08a5d', '#ffd9a0'], far: '#c97b63', near: '#a8604f', ground: '#9a6a44', dark: '#774d2f', top: '#d9a35c', topD: '#b07c3a' },
  bath: { sky: ['#bfe3e6', '#eef9f9'], far: '#a6d1d6', near: '#8cc0c6', ground: '#d8dee6', dark: '#aab4c2', top: '#ffffff', topD: '#c9d1dc', tiles: true },
  fire: { sky: ['#3b1c2e', '#a3432f'], far: '#5a2533', near: '#43202b', ground: '#5d4a48', dark: '#3f3131', top: '#8a7270', topD: '#6b5755' },
  porcelain: { sky: ['#e7e0f5', '#fbf8ff'], far: '#cfc5e6', near: '#b8acd6', ground: '#c9c3d9', dark: '#9d95b4', top: '#f4f0ff', topD: '#d6cfe8', tiles: true },
  sewer: { sky: ['#1c2a25', '#35493d'], far: '#26372f', near: '#2d4037', ground: '#56635a', dark: '#3d4840', top: '#7a9a5a', topD: '#56733e' },
  gold: { sky: ['#2a1e52', '#c7699a'], far: '#4b3277', near: '#3a2662', ground: '#7a5a8a', dark: '#5a3f69', top: '#ffd23f', topD: '#c9971a' },
};
const GROUP_COL = ['#e2463c', '#3c7de2', '#36b35a', '#e2a43c', '#a650d8'];

// ============================================================ canvas
const cvs = document.getElementById('game');
const ctx = cvs.getContext('2d');
ctx.imageSmoothingEnabled = false;
function layout() {
  const s = Math.max(1, Math.min(window.innerWidth / W, window.innerHeight / H));
  const k = s >= 2 ? Math.floor(s * 2) / 2 : s;
  cvs.style.width = Math.floor(W * k) + 'px';
  cvs.style.height = Math.floor(H * k) + 'px';
}
window.addEventListener('resize', layout);
layout();

// ============================================================ pixel font (3x5)
const GLYPHS = {
  A: '010,101,111,101,101', B: '110,101,110,101,110', C: '011,100,100,100,011', D: '110,101,101,101,110',
  E: '111,100,110,100,111', F: '111,100,110,100,100', G: '011,100,101,101,011', H: '101,101,111,101,101',
  I: '111,010,010,010,111', J: '001,001,001,101,010', K: '101,101,110,101,101', L: '100,100,100,100,111',
  M: '10001,11011,10101,10001,10001', N: '1001,1101,1011,1001,1001', O: '010,101,101,101,010',
  P: '110,101,110,100,100', Q: '0110,1001,1001,1010,0101', R: '110,101,110,101,101', S: '011,100,010,001,110',
  T: '111,010,010,010,010', U: '101,101,101,101,111', V: '101,101,101,101,010', W: '10001,10001,10101,11011,10001',
  X: '101,101,010,101,101', Y: '101,101,010,010,010', Z: '111,001,010,100,111',
  0: '111,101,101,101,111', 1: '010,110,010,010,111', 2: '110,001,010,100,111', 3: '110,001,010,001,110',
  4: '101,101,111,001,001', 5: '111,100,110,001,110', 6: '011,100,111,101,111', 7: '111,001,010,010,010',
  8: '111,101,111,101,111', 9: '111,101,111,001,110',
  '%': '101,001,010,100,101', '!': '1,1,1,0,1', '?': '110,001,010,000,010', '.': '0,0,0,0,1', ',': '00,00,00,01,10',
  '-': '000,000,111,000,000', '+': '000,010,111,010,000', ':': '0,1,0,1,0', "'": '1,1,0,0,0',
  '/': '001,001,010,100,100', '(': '01,10,10,10,01', ')': '10,01,01,01,10', '>': '100,010,001,010,100',
  '<': '001,010,100,010,001', '·': '0,0,1,0,0', 'Θ': '010,101,111,101,010', '*': '000,101,010,101,000',
  '^': '010,101,000,000,000', '&': '010,101,010,101,011', ' ': '00,00,00,00,00',
};
const FONT = {};
for (const [ch, s] of Object.entries(GLYPHS)) { const rows = s.split(','); FONT[ch] = { w: rows[0].length, rows }; }
const textW = (str, sc = 1) => { let w = 0; for (const ch of String(str).toUpperCase()) w += ((FONT[ch] || FONT[' ']).w + 1) * sc; return Math.max(0, w - sc); };
function drawText(str, x, y, col, sc = 1, align = 'left', shadow = null) {
  str = String(str).toUpperCase();
  if (align === 'center') x -= Math.floor(textW(str, sc) / 2); else if (align === 'right') x -= textW(str, sc);
  x = Math.round(x); y = Math.round(y);
  if (shadow) drawText(str, x + sc, y + sc, shadow, sc);
  ctx.fillStyle = col;
  for (const ch of str) {
    const gl = FONT[ch] || FONT[' '];
    for (let r = 0; r < 5; r++) for (let c = 0; c < gl.w; c++) if (gl.rows[r][c] === '1') ctx.fillRect(x + c * sc, y + r * sc, sc, sc);
    x += (gl.w + 1) * sc;
  }
}
function wrap(str, maxW, sc = 1) {
  const out = []; let line = '';
  for (const word of str.split(' ')) {
    const t = line ? line + ' ' + word : word;
    if (textW(t, sc) > maxW && line) { out.push(line); line = word; } else line = t;
  }
  if (line) out.push(line);
  return out;
}
const R = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(x), Math.round(y), w, h); };
function disc(cx, cy, r, col) { ctx.fillStyle = col; for (let dy = -r; dy <= r; dy++) { const w = Math.floor(Math.sqrt(r * r - dy * dy)); ctx.fillRect(Math.round(cx - w), Math.round(cy + dy), w * 2 + 1, 1); } }
function panel(x, y, w, h, fill = '#1b1210', edge = '#c08a4a') { R(x, y, w, h, edge); R(x + 1, y + 1, w - 2, h - 2, fill); }

// ============================================================ audio (all synthesized)
let AC = null, OUT = null, NOISE = null;
function audio() {
  if (!AC) {
    try {
      AC = new (window.AudioContext || window.webkitAudioContext)();
      OUT = AC.createGain(); OUT.gain.value = save.muted ? 0 : 0.5; OUT.connect(AC.destination);
      NOISE = AC.createBuffer(1, AC.sampleRate, AC.sampleRate);
      const d = NOISE.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { AC = null; }
  }
  if (AC && AC.state === 'suspended') AC.resume();
  return AC;
}
function env(g, t, a, peak, dur) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
function tone(type, f0, f1, dur, vol, delay = 0) {
  if (!AC || save.muted) return;
  const t = AC.currentTime + delay, o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  env(g, t, 0.005, vol, dur); o.connect(g); g.connect(OUT); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, f0, f1, vol, q = 1, type = 'lowpass', delay = 0) {
  if (!AC || save.muted) return;
  const t = AC.currentTime + delay, s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
  s.buffer = NOISE; s.loop = true; f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  env(g, t, 0.01, vol, dur); s.connect(f); f.connect(g); g.connect(OUT); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
}
function fart(dur, base, vol, delay = 0) {
  if (!AC || save.muted) return;
  const t = AC.currentTime + delay, o = AC.createOscillator(), lfo = AC.createOscillator(), lg = AC.createGain();
  const f = AC.createBiquadFilter(), g = AC.createGain();
  o.type = 'sawtooth'; o.frequency.setValueAtTime(base, t); o.frequency.linearRampToValueAtTime(base * 0.7, t + dur);
  lfo.type = 'square'; lfo.frequency.setValueAtTime(rand(22, 34), t); lfo.frequency.linearRampToValueAtTime(rand(12, 18), t + dur);
  lg.gain.value = base * 0.45; lfo.connect(lg); lg.connect(o.frequency);
  f.type = 'lowpass'; f.frequency.value = 700; f.Q.value = 4;
  env(g, t, 0.02, vol, dur); o.connect(f); f.connect(g); g.connect(OUT);
  o.start(t); lfo.start(t); o.stop(t + dur + 0.02); lfo.stop(t + dur + 0.02);
}
const SFX = {
  squirt() { noise(0.09, rand(500, 900), 180, 0.22, 3); tone('sine', rand(110, 150), 50, 0.07, 0.12); },
  mega() { fart(0.65, rand(70, 90), 0.5); noise(0.5, 900, 120, 0.3, 2); },
  fizzle() { fart(0.25, 140, 0.25); },
  charge() { tone('sine', rand(50, 70), rand(120, 180), 0.12, 0.08); },
  dry() { noise(0.06, 2400, 1200, 0.08, 1, 'highpass'); },
  jump() { tone('square', 260, 440, 0.1, 0.08); },
  land() { tone('sine', 120, 60, 0.05, 0.08); },
  crust() { tone('sine', 140, 55, 0.09, 0.18); noise(0.05, 400, 150, 0.1, 2); },
  crumble() { noise(0.15, 600, 100, 0.08, 1); },
  tp() { noise(0.12, 3000, 800, 0.12, 1, 'bandpass'); },
  douse() { noise(0.35, 3000, 6000, 0.18, 1, 'highpass'); },
  fill() { tone('sine', 700, 900, 0.06, 0.06); },
  bowl() { [523, 659, 784].forEach((f, i) => tone('triangle', f, f, 0.12, 0.12, i * 0.07)); },
  door() { [196, 247, 294, 392].forEach((f, i) => tone('square', f, f, 0.1, 0.08, i * 0.08)); noise(0.5, 300, 80, 0.15, 1); },
  pickup() { [392, 523, 659, 1046].forEach((f, i) => tone('square', f, f, 0.07, 0.07, i * 0.05)); fart(0.2, 160, 0.15, 0.22); },
  check() { tone('triangle', 523, 523, 0.1, 0.12); tone('triangle', 784, 784, 0.18, 0.12, 0.1); },
  die() { fart(0.6, 110, 0.35); tone('square', 400, 60, 0.5, 0.1); },
  pop() { tone('sine', 700, 200, 0.08, 0.12); },
  boing() { tone('triangle', 200, 900, 0.25, 0.15); tone('triangle', 900, 120, 0.3, 0.1, 0.25); },
  menu() { tone('square', 660, 660, 0.05, 0.06); },
  clear() { noise(1.6, 3000, 120, 0.3, 2); [523, 659, 784, 1046, 784, 1046].forEach((f, i) => tone('square', f, f, 0.14, 0.08, 0.6 + i * 0.12)); },
};
const sfx = (n) => { if (AC) SFX[n](); };

// ============================================================ input
const KEYS = {
  mL: ['KeyA'], mR: ['KeyD'], mJ: ['KeyW', 'Space'], mD: ['KeyS'],
  bL: ['ArrowLeft'], bR: ['ArrowRight'], bU: ['ArrowUp'], bD: ['ArrowDown'],
  bS: ['Slash', 'ShiftRight', 'Numpad0', 'KeyL'], bM: ['Period', 'Enter', 'NumpadEnter', 'NumpadDecimal', 'KeyK'],
  pause: ['Escape', 'KeyP'], mute: ['KeyM'], reset: ['KeyR'],
};
const GAME_CODES = new Set(Object.values(KEYS).flat());
const down = new Set(), pressed = new Set(), released = new Set();
window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (GAME_CODES.has(e.code)) e.preventDefault();
  audio();
  if (!down.has(e.code)) pressed.add(e.code);
  down.add(e.code);
});
window.addEventListener('keyup', (e) => { if (down.has(e.code)) released.add(e.code); down.delete(e.code); });
window.addEventListener('blur', () => { down.clear(); if (state === 'play') state = 'pause'; });
window.addEventListener('pointerdown', () => audio());
const kd = (a) => KEYS[a].some((c) => down.has(c));
const kp = (a) => KEYS[a].some((c) => pressed.has(c));
const kr = (a) => KEYS[a].some((c) => released.has(c));

// gamepads: first connected pad plays Master, second plays Blaster
const pad = [null, null], padPrev = [{}, {}];
function readPads() {
  const list = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : [];
  for (let i = 0; i < 2; i++) {
    const g = list[i];
    const b = (n) => !!(g && g.buttons[n] && g.buttons[n].pressed);
    const cur = g ? {
      x: Math.abs(g.axes[0]) > 0.3 ? g.axes[0] : (b(15) ? 1 : 0) - (b(14) ? 1 : 0),
      y: Math.abs(g.axes[1]) > 0.3 ? g.axes[1] : (b(13) ? 1 : 0) - (b(12) ? 1 : 0),
      a: b(0), fire: b(0) || b(7) || b(5), mega: b(1) || b(2) || b(6) || b(4), start: b(9), back: b(1),
    } : {};
    pad[i] = g ? cur : null;
    pad[i + 2] = padPrev[i];
    padPrev[i] = cur;
  }
}
const pp = (i, k) => !!(pad[i] && pad[i][k] && !pad[i + 2][k]);
const pRel = (i, k) => !!(pad[i] && !pad[i][k] && pad[i + 2][k]);
const anyPad = (k) => pp(0, k) || pp(1, k);
// menu navigation from either player's controls
const menuUp = () => pressed.has('KeyW') || pressed.has('ArrowUp') || [0, 1].some((i) => pad[i] && pad[i].y < -0.5 && !(pad[i + 2].y < -0.5));
const menuDown = () => pressed.has('KeyS') || pressed.has('ArrowDown') || [0, 1].some((i) => pad[i] && pad[i].y > 0.5 && !(pad[i + 2].y > 0.5));
const menuOk = () => pressed.has('Enter') || pressed.has('Space') || pressed.has('NumpadEnter') || anyPad('a') || anyPad('start');
const menuBack = () => pressed.has('Escape') || anyPad('back');

// ============================================================ level state
const EMPTY = 0, SOLID = 1, PAPER = 2, BOWL = 3, DOOR = 4, SPIKE = 5, FIRE = 6, PLANK = 7;
const CRUST_LIFE = 8, FILL_STEP = 0.12, PAPER_HITS = 6, FIRE_HITS = 10, BOWL_HITS = 16;
let LW = 0, LH = 0, tile, hp, crust, fill, group, active;
let lvl = null, lvlIndex = 0, theme = THEMES.meadow;
let master, blaster, plungers, items, signs, parts, blobs, fx, cam, groups;
let stageTime = 0, deaths = 0, dirt = 0, shake = 0, spawn = { x: 0, y: 0 }, signText = null, banner = 0;

function loadStage(i) {
  lvlIndex = i; lvl = LEVELS[i]; theme = THEMES[lvl.theme];
  LH = lvl.map.length; LW = Math.max(...lvl.map.map((r) => r.length));
  const n = LW * LH;
  tile = new Uint8Array(n); hp = new Float32Array(n); crust = new Float32Array(n); fill = new Float32Array(n);
  group = new Int8Array(n).fill(-1); active = new Set();
  plungers = []; items = []; signs = []; parts = []; blobs = []; fx = [];
  groups = [];
  const getGroup = (k) => (groups[k] = groups[k] || { bowls: [], doors: [], open: false });
  let ms = { x: 2, y: LH - 5 }, bs = null, si = 0;
  for (let y = 0; y < LH; y++) for (let x = 0; x < LW; x++) {
    const c = lvl.map[y][x] || ' ', i2 = y * LW + x;
    const px = x * T, py = y * T;
    if (c === '#') tile[i2] = SOLID;
    else if (c === 'T') { tile[i2] = PAPER; hp[i2] = 1; }
    else if (c === '^') tile[i2] = SPIKE;
    else if (c === 'F') { tile[i2] = FIRE; hp[i2] = 1; }
    else if (c === '-') tile[i2] = PLANK;
    else if (c >= 'a' && c <= 'e') { const k = c.charCodeAt(0) - 97; tile[i2] = BOWL; group[i2] = k; getGroup(k).bowls.push(i2); }
    else if (c >= '1' && c <= '5') { const k = c.charCodeAt(0) - 49; tile[i2] = DOOR; group[i2] = k; getGroup(k).doors.push(i2); }
    else if (c === 'M') ms = { x, y };
    else if (c === 'X') bs = { x, y };
    else if (c === 'C') items.push({ kind: 'check', x: px, y: py - 10, w: 16, h: 26, on: false });
    else if (c === 'G') items.push({ kind: 'goal', x: px - 4, y: py - 8, w: 24, h: 24 });
    else if (c === 'B') items.push({ kind: 'burrito', x: px + 2, y: py + 4, w: 12, h: 8, gone: 0 });
    else if (c === 'P') plungers.push({ x: px + 2, y: py + 2, w: 12, h: 14, vx: -28, ex: 0, vy: 0, hit: 0, hp: 8, dead: false, ground: false });
    else if (c === '?') signs.push({ x: px, y: py, text: lvl.signs[si++] || '' });
  }
  spawn = { x: ms.x * T + 3, y: ms.y * T + 2 };
  master = { x: spawn.x, y: spawn.y, w: 10, h: 14, vx: 0, ex: 0, vy: 0, face: 1, ground: false, coyote: 0, buffer: 0, jumping: false, drop: 0, dead: false, deadT: 0, anim: 0, dirtSpots: [] };
  const b0 = bs ? { x: bs.x * T + 1, y: bs.y * T + 2 } : { x: spawn.x - 20, y: spawn.y - 40 };
  blaster = { x: b0.x, y: b0.y, w: 14, h: 12, vx: 0, vy: 0, aim: { x: 1, y: 0 }, ang: 0, tank: 100, dry: false, idle: 1, emit: 0, sndT: 0, charge: 0, spicy: 0, firing: false, bob: 0, lockMega: true, streamT: 0 };
  cam = { x: 0, y: 0 };
  snapCam();
  stageTime = 0; deaths = 0; dirt = 0; shake = 0; banner = 2.5; signText = null;
}

// ============================================================ tiles
const inside = (cx, cy) => cx >= 0 && cx < LW && cy >= 0 && cy < LH;
const tAt = (cx, cy) => (inside(cx, cy) ? tile[cy * LW + cx] : (cx < 0 || cx >= LW ? SOLID : EMPTY));
const hardTile = (t) => t === SOLID || t === PAPER || t === BOWL || t === DOOR;
function solidBody(cx, cy) { // Master and plungers stand on crust
  if (cx < 0 || cx >= LW) return true;
  if (!inside(cx, cy)) return false;
  const i = cy * LW + cx;
  return hardTile(tile[i]) || crust[i] > 0;
}
const solidBlaster = (cx, cy) => (cx < 0 || cx >= LW) || (inside(cx, cy) && hardTile(tile[cy * LW + cx]));
const solidShot = (cx, cy) => solidBody(cx, cy);

function moveX(b, dx, solid) {
  b.x += dx;
  const y0 = Math.floor(b.y / T), y1 = Math.floor((b.y + b.h - 0.01) / T);
  if (dx > 0) { const cx = Math.floor((b.x + b.w - 0.01) / T); for (let y = y0; y <= y1; y++) if (solid(cx, y)) { b.x = cx * T - b.w; return true; } }
  else if (dx < 0) { const cx = Math.floor(b.x / T); for (let y = y0; y <= y1; y++) if (solid(cx, y)) { b.x = (cx + 1) * T; return true; } }
  return false;
}
function moveY(b, dy, solid, planks) {
  const prevBottom = b.y + b.h;
  b.y += dy;
  const x0 = Math.floor(b.x / T), x1 = Math.floor((b.x + b.w - 0.01) / T);
  if (dy > 0) {
    const cy = Math.floor((b.y + b.h - 0.01) / T);
    for (let x = x0; x <= x1; x++) {
      if (solid(x, cy) || (planks && !(b.drop > 0) && tAt(x, cy) === PLANK && prevBottom <= cy * T + 0.5)) { b.y = cy * T - b.h; return 1; }
    }
  } else if (dy < 0) {
    const cy = Math.floor(b.y / T);
    for (let x = x0; x <= x1; x++) if (solid(x, cy)) { b.y = (cy + 1) * T; return -1; }
  }
  return 0;
}
function boxHitsSolid(b, solid) {
  const x0 = Math.floor(b.x / T), x1 = Math.floor((b.x + b.w - 0.01) / T), y0 = Math.floor(b.y / T), y1 = Math.floor((b.y + b.h - 0.01) / T);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (solid(x, y)) return true;
  return false;
}
function cellBlocked(cx, cy) { // never crust over a body
  const c = { x: cx * T, y: cy * T, w: T, h: T };
  if (!master.dead && overlap(c, master)) return true;
  return plungers.some((p) => !p.dead && overlap(c, p));
}
function makeCrust(cx, cy) {
  if (!inside(cx, cy)) return false;
  const i = cy * LW + cx, t = tile[i];
  if ((t !== EMPTY && t !== SPIKE && t !== PLANK) || crust[i] > 0 || cellBlocked(cx, cy)) return false;
  crust[i] = CRUST_LIFE; fill[i] = 0; active.add(i);
  return true;
}
function addFill(cx, cy, amt) {
  if (!inside(cx, cy)) return;
  const i = cy * LW + cx, t = tile[i];
  if ((t !== EMPTY && t !== SPIKE && t !== PLANK) || crust[i] > 0) return;
  fill[i] = Math.min(1, fill[i] + amt); active.add(i);
  if (fill[i] >= 1 && makeCrust(cx, cy)) { sfx('crust'); puff(cx * T + 8, cy * T + 8, 6, '#7a4a22'); }
}
function hitPaper(i, dmg) {
  hp[i] -= dmg;
  if (hp[i] <= 0) { tile[i] = EMPTY; const x = (i % LW) * T + 8, y = Math.floor(i / LW) * T + 8; puff(x, y, 8, '#f4f1e8'); sfx('tp'); }
}
function hitFire(i, dmg) {
  hp[i] -= dmg;
  if (hp[i] <= 0) { tile[i] = EMPTY; const x = (i % LW) * T + 8, y = Math.floor(i / LW) * T + 8; puff(x, y, 10, '#c9c9c9', -40); sfx('douse'); }
}
function hitBowl(i, amt) {
  const g = groups[group[i]];
  if (hp[i] >= 1 || !g) return;
  hp[i] = Math.min(1, hp[i] + amt);
  if (hp[i] >= 1) {
    sfx('bowl'); puff((i % LW) * T + 8, Math.floor(i / LW) * T + 4, 8, '#ffe36a', -30);
    if (!g.open && g.bowls.every((b) => hp[b] >= 1)) {
      g.open = true; sfx('door'); shake = 0.3;
      for (const d of g.doors) { tile[d] = EMPTY; puff((d % LW) * T + 8, Math.floor(d / LW) * T + 8, 3, GROUP_COL[group[d] % 5]); }
    }
  } else if (Math.random() < 0.3) sfx('fill');
}

// ============================================================ effects
function puff(x, y, n, col, vy = 0) {
  for (let k = 0; k < n; k++) fx.push({ x, y, vx: rand(-60, 60), vy: rand(-60, 30) + vy, life: rand(0.3, 0.7), max: 0.7, col, g: vy < 0 ? -20 : 200, s: Math.random() < 0.5 ? 2 : 1 });
}
const BROWNS = ['#5a3416', '#6b4220', '#7d4f26', '#8f5d2c', '#4a2b12'];
const SPICY = ['#8a3a12', '#a5481a', '#c0581e', '#7d3610', '#d26a22'];

// ============================================================ the stream
function fireStream(dt) {
  const b = blaster, rate = b.spicy > 0 ? 70 : 48;
  b.emit += rate * dt;
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  while (b.emit >= 1) {
    b.emit -= 1;
    const spread = b.spicy > 0 ? 0.16 : 0.09, a = Math.atan2(b.aim.y, b.aim.x) + rand(-spread, spread), sp = rand(255, 300);
    parts.push({ x: cx + b.aim.x * 7, y: cy + b.aim.y * 7, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1.6, col: (b.spicy > 0 ? SPICY : BROWNS)[Math.floor(rand(5))] });
  }
  b.vx -= b.aim.x * 60 * dt; b.vy -= b.aim.y * 60 * dt;
  if (b.spicy <= 0) b.tank = Math.max(0, b.tank - 24 * dt);
  b.sndT -= dt; if (b.sndT <= 0) { sfx('squirt'); b.sndT = 0.085; }
}
function updateParts(dt) {
  const m = master;
  for (let k = parts.length - 1; k >= 0; k--) {
    const p = parts[k];
    p.life -= dt; p.vy += 330 * dt;
    const ox = p.x, oy = p.y;
    p.x += p.vx * dt; p.y += p.vy * dt;
    let gone = p.life <= 0 || p.y > LH * T + 40 || p.x < -10 || p.x > LW * T + 10;
    if (!gone && !m.dead && p.x > m.x - 2 && p.x < m.x + m.w + 2 && p.y > m.y - 2 && p.y < m.y + m.h + 2) {
      const s = Math.hypot(p.vx, p.vy) || 1;
      // the stream lifts more than it shoves, so a diagonal jet carries Master up instead of out of the jet
      m.ex = clamp(m.ex + (p.vx / s) * 18, -320, 320);
      m.vy = Math.max(-300, m.vy + (p.vy / s) * (p.vy < 0 ? 52 : 30));
      if (p.vy < 0) m.jumping = false;
      dirt++; if (m.dirtSpots.length < 24 && Math.random() < 0.15) m.dirtSpots.push([Math.floor(rand(m.w)), Math.floor(rand(2, m.h + 4))]);
      gone = true;
    }
    if (!gone) for (const pl of plungers) {
      if (!pl.dead && p.x > pl.x && p.x < pl.x + pl.w && p.y > pl.y && p.y < pl.y + pl.h) {
        pl.ex = clamp(pl.ex + Math.sign(p.vx || 1) * 26, -220, 220); pl.hit = 0.15; pl.hp -= 1;
        if (pl.hp <= 0) killPlunger(pl, p.vx);
        gone = true; break;
      }
    }
    if (!gone) {
      const cx = Math.floor(p.x / T), cy = Math.floor(p.y / T);
      const t = tAt(cx, cy), i = cy * LW + cx;
      if (inside(cx, cy) && t === FIRE && crust[i] <= 0) { hitFire(i, 1 / FIRE_HITS); gone = true; if (Math.random() < 0.3) puff(p.x, p.y, 1, '#bbbbbb', -30); }
      else if (inside(cx, cy) && t === SPIKE && crust[i] <= 0) { addFill(cx, cy, FILL_STEP); gone = true; }
      else if (solidShot(cx, cy)) {
        gone = true;
        const pcx = Math.floor(ox / T), pcy = Math.floor(oy / T);
        if (inside(cx, cy) && t === PAPER) hitPaper(i, 1 / PAPER_HITS);
        else if (inside(cx, cy) && t === BOWL) hitBowl(i, 1 / BOWL_HITS);
        else if (pcx !== cx || pcy !== cy) addFill(pcx, pcy, FILL_STEP);
        if (Math.random() < 0.35) fx.push({ x: ox, y: oy, vx: rand(-30, 30), vy: rand(-50, 0), life: 0.3, max: 0.3, col: p.col, g: 300, s: 1 });
      }
    }
    if (gone) parts.splice(k, 1);
  }
}
function fireMega() {
  const b = blaster;
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2, sp = 340;
  blobs.push({ x: cx + b.aim.x * 8, y: cy + b.aim.y * 8, vx: b.aim.x * sp, vy: b.aim.y * sp, life: 2 });
  b.vx -= b.aim.x * 220; b.vy -= b.aim.y * 220;
  sfx('mega'); shake = 0.25;
}
function updateBlobs(dt) {
  const m = master;
  for (let k = blobs.length - 1; k >= 0; k--) {
    const o = blobs[k];
    o.life -= dt; o.vy += 240 * dt;
    const ox = o.x, oy = o.y;
    o.x += o.vx * dt; o.y += o.vy * dt;
    let boom = false;
    if (!m.dead && o.x > m.x - 5 && o.x < m.x + m.w + 5 && o.y > m.y - 5 && o.y < m.y + m.h + 5) {
      const s = Math.hypot(o.vx, o.vy) || 1;
      m.ex = (o.vx / s) * 380; m.vx = 0; m.vy = Math.min((o.vy / s) * 480, -120);
      m.jumping = false; m.ground = false; dirt += 25;
      puff(o.x, o.y, 14, '#6b4220'); sfx('crust'); blobs.splice(k, 1); shake = 0.2; continue;
    }
    for (const pl of plungers) if (!pl.dead && o.x > pl.x - 4 && o.x < pl.x + pl.w + 4 && o.y > pl.y - 4 && o.y < pl.y + pl.h + 4) { killPlunger(pl, o.vx); boom = true; }
    const cx = Math.floor(o.x / T), cy = Math.floor(o.y / T);
    if (boom || o.life <= 0 || solidShot(cx, cy) || (inside(cx, cy) && (tile[cy * LW + cx] === FIRE || tile[cy * LW + cx] === SPIKE))) {
      if (o.life > 0) explode(Math.floor(ox / T), Math.floor(oy / T), ox, oy);
      blobs.splice(k, 1);
    } else if (o.y > LH * T + 40) blobs.splice(k, 1);
  }
}
function explode(cx, cy, x, y) {
  shake = 0.3; puff(x, y, 22, '#6b4220'); puff(x, y, 8, '#8f5d2c');
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const X = cx + dx, Y = cy + dy;
    if (!inside(X, Y)) continue;
    const i = Y * LW + X, t = tile[i], d = Math.abs(dx) + Math.abs(dy);
    if (t === PAPER && d <= 3) hitPaper(i, 2);
    else if (t === FIRE && d <= 3) hitFire(i, 2);
    else if (t === BOWL && d <= 2) hitBowl(i, 0.5);
    else if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1 && t !== FIRE) makeCrust(X, Y);
  }
  sfx('crust');
  const m = master, mx = m.x + m.w / 2, my = m.y + m.h / 2, dist = Math.hypot(mx - x, my - y);
  if (!m.dead && dist < 34) { // rocket jump
    const k = (1 - dist / 34) * 300;
    m.ex = clamp(m.ex + ((mx - x) / (dist || 1)) * k, -320, 320); m.vy = Math.min(m.vy, -((my - y + 8) / (dist || 1)) * k - 60); m.jumping = false;
  }
}
function killPlunger(pl, dir) {
  if (pl.dead) return;
  pl.dead = true; pl.vy = -200; pl.ex = Math.sign(dir || 1) * 120; pl.spin = 0;
  sfx('boing'); puff(pl.x + 6, pl.y + 6, 8, '#d23b3b');
}

// ============================================================ update
let state = 'title', menuSel = 0, pauseSel = 0, clearInfo = null, titleT = 0;
const STEP = 1 / 60;

function updateMaster(dt) {
  const m = master;
  if (m.dead) { m.deadT -= dt; if (m.deadT <= 0) respawn(); return; }
  const P = pad[0] || {};
  const dir = (kd('mR') || P.x > 0.3 ? 1 : 0) - (kd('mL') || P.x < -0.3 ? 1 : 0);
  const jp = kp('mJ') || pp(0, 'a'), jh = kd('mJ') || !!P.a, dn = kd('mD') || P.y > 0.5;
  if (dir) m.face = dir;
  m.vx = approach(m.vx, dir * 100, (m.ground ? 1400 : 900) * dt);
  m.ex *= Math.exp(-(m.ground ? 9 : 2) * dt);
  if (Math.abs(m.ex) < 2) m.ex = 0;
  m.coyote = m.ground ? 0.09 : m.coyote - dt;
  m.buffer = jp ? 0.12 : m.buffer - dt;
  m.drop -= dt;
  if (m.buffer > 0 && dn && m.ground && standingOnPlank()) { m.drop = 0.25; m.buffer = 0; }
  else if (m.buffer > 0 && m.coyote > 0) { m.vy = -275; m.jumping = true; m.coyote = 0; m.buffer = 0; m.ground = false; sfx('jump'); }
  if (m.jumping && !jh && m.vy < -110) m.vy = -110;
  m.vy = Math.min(m.vy + 900 * dt, 420);
  if (moveX(m, (m.vx + m.ex) * dt, solidBody)) { m.vx = 0; m.ex = 0; }
  const wasGround = m.ground, vy = m.vy, hy = moveY(m, m.vy * dt, solidBody, true);
  m.ground = hy === 1;
  if (hy !== 0) { m.vy = 0; if (hy === 1) { m.jumping = false; if (!wasGround && vy > 200) sfx('land'); } }
  m.anim += Math.abs(m.vx) * dt;
  // hazards
  const x0 = Math.floor((m.x + 2) / T), x1 = Math.floor((m.x + m.w - 2) / T), y0 = Math.floor((m.y + 2) / T), y1 = Math.floor((m.y + m.h - 1) / T);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (!inside(x, y)) continue;
    const i = y * LW + x, t = tile[i];
    if (t === SPIKE && crust[i] <= 0 && m.y + m.h > y * T + 8) return kill();
    if (t === FIRE && crust[i] <= 0) return kill();
  }
  if (m.y > LH * T + 24) return kill();
  for (const pl of plungers) if (!pl.dead && overlap({ x: m.x + 1, y: m.y + 2, w: m.w - 2, h: m.h - 2 }, pl)) return kill();
  for (const it of items) {
    if (!overlap(m, it)) continue;
    if (it.kind === 'check' && !it.on) { items.forEach((o) => { if (o.kind === 'check') o.on = false; }); it.on = true; spawn = { x: it.x + 3, y: it.y + it.h - 14 }; sfx('check'); puff(it.x + 8, it.y, 8, '#7ee07e', -40); }
    if (it.kind === 'goal') return stageClear();
  }
}
function standingOnPlank() {
  const m = master, cy = Math.floor((m.y + m.h + 1) / T);
  for (let x = Math.floor(m.x / T); x <= Math.floor((m.x + m.w - 0.01) / T); x++) if (tAt(x, cy) === PLANK) return true;
  return false;
}
function kill() {
  const m = master;
  if (m.dead) return;
  m.dead = true; m.deadT = 1; deaths++; shake = 0.35;
  puff(m.x + 5, m.y + 7, 20, '#6b4220'); puff(m.x + 5, m.y + 7, 6, '#2a2a3a');
  sfx('die');
}
function respawn() {
  const m = master;
  Object.assign(m, { x: spawn.x, y: spawn.y, vx: 0, ex: 0, vy: 0, dead: false, ground: false, jumping: false });
  for (let k = 0; k < 4 && boxHitsSolid(m, solidBody); k++) m.y -= T; // something crusted over the spawn
  snapCam();
  const b = blaster;
  b.x = clamp(m.x - 18, cam.x + 4, cam.x + W - 20); b.y = m.y - 36; b.vx = b.vy = 0; b.tank = 100; b.dry = false; b.charge = 0;
}
function updateBlaster(dt) {
  const b = blaster, P = pad[1] || {};
  let ax = (kd('bR') ? 1 : 0) - (kd('bL') ? 1 : 0), ay = (kd('bD') ? 1 : 0) - (kd('bU') ? 1 : 0);
  if (P.x || P.y) { if (Math.abs(P.x) > 0.3) ax = P.x; if (Math.abs(P.y) > 0.3) ay = P.y; }
  const streamHeld = kd('bS') || !!P.fire, megaHeld = !b.lockMega && (kd('bM') || !!P.mega);
  if (b.lockMega && !(kd('bM') || P.mega)) b.lockMega = false;
  const megaRel = !b.lockMega && (kr('bM') || pRel(1, 'mega'));
  const busy = streamHeld || megaHeld;
  const len = Math.hypot(ax, ay);
  b.streamT = streamHeld && !megaHeld ? b.streamT + dt : 0;
  // charging a mega, or the first moment of a stream: arrows aim. Then the stream's aim locks and arrows steer.
  if (megaHeld || (streamHeld && b.streamT < 0.15)) {
    if (len > 0.3) b.aim = { x: ax / len, y: ay / len };
    b.vx *= Math.exp(-6 * dt); b.vy *= Math.exp(-6 * dt);
  } else {
    const s = len > 0 ? (streamHeld ? 85 : 130) / Math.max(1, len) : 0;
    b.vx = approach(b.vx, ax * s, 700 * dt); b.vy = approach(b.vy, ay * s, 700 * dt);
  }
  if (b.dry && b.tank >= 25) b.dry = false;
  b.firing = false;
  if (streamHeld && !megaHeld) {
    if ((b.tank > 0 && !b.dry) || b.spicy > 0) { fireStream(dt); b.firing = true; b.idle = 0; }
    else { b.dry = true; b.sndT -= dt; if (b.sndT <= 0) { sfx('dry'); b.sndT = 0.25; } }
  }
  if (b.tank <= 0 && b.spicy <= 0) b.dry = true;
  if (megaHeld) {
    const before = b.charge;
    b.charge = Math.min(0.7, b.charge + dt);
    if (Math.floor(b.charge * 12) !== Math.floor(before * 12)) sfx('charge');
    b.idle = 0;
  }
  if (megaRel && b.charge > 0) {
    if (b.charge >= 0.35 && (b.tank >= 30 || b.spicy > 0)) { fireMega(); if (b.spicy <= 0) b.tank -= 30; }
    else sfx('fizzle');
    b.charge = 0;
  }
  if (!busy) { b.idle += dt; b.charge = 0; }
  if (b.idle > 0.6) b.tank = Math.min(100, b.tank + 15 * dt);
  b.spicy = Math.max(0, b.spicy - dt);
  // move: blocked by walls unless already stuck inside one (e.g. dragged along by the camera)
  const stuck = boxHitsSolid(b, solidBlaster);
  if (stuck) { b.x += b.vx * dt; b.y += b.vy * dt; }
  else {
    if (moveX(b, b.vx * dt, solidBlaster)) b.vx = 0;
    if (moveY(b, b.vy * dt, solidBlaster, false)) b.vy = 0;
  }
  b.x = clamp(b.x, cam.x + 2, cam.x + W - b.w - 2);
  b.y = clamp(b.y, cam.y + 12, cam.y + H - b.h - 2);
  b.bob += dt;
  const want = b.firing || megaHeld ? Math.atan2(b.aim.y, b.aim.x) : Math.hypot(b.vx, b.vy) > 20 ? Math.atan2(-b.vy, -b.vx) : b.ang;
  let d = want - b.ang; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU;
  b.ang += d * Math.min(1, dt * 14);
  for (const it of items) if (it.kind === 'burrito' && !it.gone && (overlap(b, it) || (!master.dead && overlap(master, it)))) {
    it.gone = 20; b.tank = 100; b.dry = false; b.spicy = 8; sfx('pickup'); puff(it.x + 6, it.y + 4, 10, '#ffb347', -30);
  }
}
function updatePlungers(dt) {
  for (const pl of plungers) {
    if (pl.dead) {
      if (pl.y < LH * T + 60) { pl.vy += 700 * dt; pl.x += pl.ex * dt; pl.y += pl.vy * dt; pl.spin = (pl.spin || 0) + dt * 12; }
      continue;
    }
    pl.hit -= dt;
    pl.ex *= Math.exp(-(pl.ground ? 7 : 2) * dt);
    pl.vy = Math.min(pl.vy + 900 * dt, 420);
    const walk = Math.abs(pl.ex) > 20 ? 0 : pl.vx;
    if (moveX(pl, (walk + pl.ex) * dt, solidBody)) { pl.vx = -pl.vx; pl.ex = 0; }
    pl.ground = moveY(pl, pl.vy * dt, solidBody, true) === 1;
    if (pl.ground) pl.vy = 0;
    if (pl.ground && Math.abs(pl.ex) < 20) { // turn at ledges and in front of hazards
      const fx2 = pl.vx > 0 ? pl.x + pl.w + 1 : pl.x - 1, cx = Math.floor(fx2 / T), cy = Math.floor((pl.y + pl.h + 2) / T);
      const ahead = tAt(cx, Math.floor((pl.y + pl.h - 2) / T));
      if ((!solidBody(cx, cy) && tAt(cx, cy) !== PLANK) || ahead === SPIKE || ahead === FIRE) pl.vx = -pl.vx;
    }
    if (pl.y > LH * T + 30) pl.dead = true;
  }
}
function updateWorld(dt) {
  for (const i of active) {
    if (crust[i] > 0) {
      crust[i] -= dt;
      if (crust[i] <= 0) { crust[i] = 0; puff((i % LW) * T + 8, Math.floor(i / LW) * T + 8, 5, '#7a4a22'); if (Math.random() < 0.5) sfx('crumble'); if (fill[i] <= 0) active.delete(i); }
    } else {
      fill[i] -= 0.2 * dt;
      if (fill[i] <= 0) { fill[i] = 0; active.delete(i); }
    }
  }
  for (const it of items) if (it.kind === 'burrito' && it.gone > 0) it.gone = Math.max(0, it.gone - dt);
  for (let k = fx.length - 1; k >= 0; k--) {
    const f = fx[k]; f.life -= dt; f.vy += f.g * dt; f.x += f.vx * dt; f.y += f.vy * dt;
    if (f.life <= 0) fx.splice(k, 1);
  }
  if (fx.length > 600) fx.splice(0, fx.length - 600);
}
function snapCam() { const t = camTarget(); cam.x = t.x; cam.y = t.y; }
function camTarget() {
  const m = master;
  return {
    x: clamp(m.x + m.w / 2 - W / 2 + m.face * 24, 0, Math.max(0, LW * T - W)),
    y: clamp(m.y - H * 0.55, 0, Math.max(0, LH * T - H)),
  };
}
function updateCam(dt) {
  if (!master.dead) {
    const t = camTarget(), k = Math.min(1, dt * 5);
    cam.x += (t.x - cam.x) * k; cam.y += (t.y - cam.y) * k;
  }
  shake = Math.max(0, shake - dt);
  signText = null;
  for (const s of signs) {
    const c = { x: s.x - 16, y: s.y - 24, w: 48, h: 48 };
    if (overlap(master, c) || overlap(blaster, c)) { signText = s.text; break; }
  }
}
function stageClear() {
  state = 'clear';
  const dignity = Math.max(0, Math.round(100 - dirt * 0.08));
  const prev = save.best[lvlIndex];
  const record = !prev || stageTime < prev.t;
  if (!prev || stageTime < prev.t) save.best[lvlIndex] = { t: stageTime, d: deaths, g: dignity };
  if (lvlIndex + 2 > save.unlocked) save.unlocked = Math.min(LEVELS.length, lvlIndex + 2);
  persist();
  clearInfo = { t: stageTime, d: deaths, g: dignity, record, last: lvlIndex === LEVELS.length - 1, T: 0 };
  sfx('clear');
}

function update(dt) {
  readPads();
  titleT += dt;
  if (kp('mute')) { save.muted = !save.muted; persist(); if (OUT) OUT.gain.value = save.muted ? 0 : 0.5; }
  if (state === 'title') {
    if (menuOk()) { state = 'select'; menuSel = Math.min(save.unlocked - 1, LEVELS.length - 1); sfx('menu'); }
  } else if (state === 'select') {
    if (menuUp()) { menuSel = (menuSel + LEVELS.length - 1) % LEVELS.length; sfx('menu'); }
    if (menuDown()) { menuSel = (menuSel + 1) % LEVELS.length; sfx('menu'); }
    if (menuOk() && menuSel < save.unlocked) { loadStage(menuSel); state = 'play'; sfx('check'); }
    if (menuBack()) state = 'title';
  } else if (state === 'play') {
    if (kp('pause') || anyPad('start')) { state = 'pause'; pauseSel = 0; return; }
    if (kp('reset') && !master.dead) kill();
    stageTime += dt; banner = Math.max(0, banner - dt);
    updateBlaster(dt); updateMaster(dt); updatePlungers(dt);
    updateParts(dt); updateBlobs(dt); updateWorld(dt);
    if (state === 'play') updateCam(dt);
  } else if (state === 'pause') {
    if (menuUp()) { pauseSel = (pauseSel + 2) % 3; sfx('menu'); }
    if (menuDown()) { pauseSel = (pauseSel + 1) % 3; sfx('menu'); }
    if (kp('pause') || anyPad('start')) state = 'play';
    else if (menuOk()) {
      if (pauseSel === 0) { state = 'play'; blaster.lockMega = true; }
      else if (pauseSel === 1) { loadStage(lvlIndex); state = 'play'; }
      else { state = 'select'; menuSel = lvlIndex; }
    }
  } else if (state === 'clear') {
    clearInfo.T += dt;
    updateWorld(dt);
    if (clearInfo.T > 1.2 && menuOk()) {
      if (clearInfo.last) state = 'end';
      else { loadStage(lvlIndex + 1); state = 'play'; }
    } else if (clearInfo.T > 1.2 && menuBack()) { state = 'select'; menuSel = Math.min(lvlIndex + 1, LEVELS.length - 1); }
  } else if (state === 'end') {
    if (titleT > 1 && menuOk()) { state = 'select'; menuSel = 0; }
  }
}

// ============================================================ drawing: world
function drawBackground() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, theme.sky[0]); g.addColorStop(1, theme.sky[1]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const base = H - (cam.y - Math.max(0, LH * T - H)) * 0.2;
  for (const [layer, par, amp, step, col] of [[0, 0.2, 40, 90, theme.far], [1, 0.45, 26, 60, theme.near]]) {
    ctx.fillStyle = col;
    const off = cam.x * par;
    for (let x = -2; x < W + 4; x += 4) {
      const wx = (x + off) / step;
      const h = amp * (0.55 + 0.3 * Math.sin(wx * 1.3 + layer) + 0.15 * Math.sin(wx * 3.1));
      ctx.fillRect(x, Math.round(base - 70 + layer * 34 - h), 4, H);
    }
  }
}
function drawTiles() {
  const x0 = Math.max(0, Math.floor(cam.x / T)), x1 = Math.min(LW - 1, Math.floor((cam.x + W) / T));
  const y0 = Math.max(0, Math.floor(cam.y / T)), y1 = Math.min(LH - 1, Math.floor((cam.y + H) / T));
  const tm = performance.now() / 1000;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = y * LW + x, t = tile[i], px = x * T - Math.round(cam.x), py = y * T - Math.round(cam.y);
    if (t === SOLID) {
      R(px, py, T, T, theme.ground);
      if (theme.tiles) { R(px, py + 15, T, 1, theme.dark); R(px + 15, py, 1, T, theme.dark); }
      else for (let k = 0; k < 3; k++) { const h1 = hash(x * 3 + k, y); R(px + Math.floor(h1 * 13), py + Math.floor(hash(x, y * 5 + k) * 13), 3, 2, theme.dark); }
      if (tAt(x, y - 1) !== SOLID) { R(px, py, T, 4, theme.top); R(px, py + 4, T, 1, theme.topD); if (!theme.tiles) for (let k = 0; k < 4; k++) R(px + k * 4 + Math.floor(hash(x, k) * 3), py + 4, 1, 2, theme.topD); }
      if (tAt(x - 1, y) !== SOLID && x > 0) R(px, py, 1, T, theme.dark);
      if (tAt(x + 1, y) !== SOLID && x < LW - 1) R(px + 15, py, 1, T, theme.dark);
    } else if (t === PAPER) {
      const k = hp[i];
      R(px + 1, py, 14, T, '#f4f1e8'); R(px + 1, py, 1, T, '#d8d3c4'); R(px + 14, py, 1, T, '#d8d3c4');
      for (let s = 3; s < 16; s += 4) R(px + 2, py + s, 12, 1, '#e2ddcc');
      if (k < 1) for (let s = 0; s < (1 - k) * 10; s++) R(px + 2 + Math.floor(hash(i, s) * 11), py + Math.floor(hash(s, i) * 14), 3, 2, '#9b7a4e');
    } else if (t === BOWL) {
      const col = GROUP_COL[group[i] % 5];
      R(px, py, T, T, col); R(px + 2, py + 2, 12, 12, '#ffffff'); R(px + 3, py + 3, 10, 9, '#cfe9f2');
      const lv = Math.round(hp[i] * 9); if (lv > 0) R(px + 3, py + 12 - lv, 10, lv, '#6b4220');
      if (hp[i] >= 1 && Math.sin(tm * 6 + x) > 0.6) { R(px + 7, py - 3, 2, 2, '#ffe36a'); }
    } else if (t === DOOR) {
      const col = GROUP_COL[group[i] % 5];
      R(px, py, T, T, '#4a4f5a'); R(px + 2, py, 12, T, '#6c7380');
      for (let s = 0; s < 16; s += 8) R(px + 2, py + ((s + Math.floor(y * 3)) % 16), 12, 3, col);
      R(px + 7, py + 6, 2, 4, '#2a2e35');
    } else if (t === SPIKE && crust[i] <= 0) {
      for (let s = 0; s < 2; s++) for (let r = 0; r < 8; r++) { const w = 2 * Math.floor(r / 2) + 2; R(px + s * 8 + 4 - w / 2, py + 8 + r, w, 1, r < 2 ? '#ffffff' : '#a9b2bc'); R(px + s * 8 + 4 - w / 2, py + 8 + r, 1, 1, '#6e7780'); }
      R(px, py + 15, T, 1, '#5e666e');
    } else if (t === FIRE) {
      const k = Math.max(0.3, hp[i]);
      for (let s = 0; s < 4; s++) {
        const h = Math.round((8 + 6 * Math.sin(tm * 11 + s * 1.7 + x)) * k);
        R(px + s * 4, py + 16 - h, 4, h, '#e2462a'); R(px + s * 4 + 1, py + 16 - Math.round(h * 0.6), 2, Math.round(h * 0.6), '#ffb02e');
      }
      R(px + 6, py + 12, 4, 4, '#fff1a8');
    } else if (t === PLANK) {
      R(px, py, T, 5, '#a8743f'); R(px, py + 4, T, 1, '#6e4a26'); R(px + 3, py + 1, 1, 2, '#6e4a26'); R(px + 11, py + 1, 1, 2, '#6e4a26');
    }
    if (crust[i] > 0) {
      const life = crust[i];
      if (!(life < 2 && Math.floor(life * 8) % 2 === 0)) {
        R(px, py + 1, T, 15, '#6b4220'); R(px + 1, py, 14, 1, '#7d4f26');
        R(px + 2, py + 2, 5, 3, '#8f5d2c'); R(px + 9, py + 7, 4, 3, '#8f5d2c'); R(px + 4, py + 11, 3, 2, '#4a2b12'); R(px + 11, py + 2, 2, 2, '#4a2b12');
        if (life < 3) R(px + 5, py + 4, 1, 8, '#3a200c');
      }
    } else if (fill[i] > 0.05) {
      const n = Math.ceil(fill[i] * 10);
      for (let s = 0; s < n; s++) R(px + Math.floor(hash(i, s) * 13), py + Math.floor(hash(s, i) * 13), 3, 3, '#6b4220');
    }
  }
}
function drawItems() {
  const tm = performance.now() / 1000, cx = Math.round(cam.x), cy = Math.round(cam.y);
  for (const s of signs) {
    const x = s.x - cx, y = s.y - cy;
    R(x + 7, y + 6, 2, 10, '#6e4a26'); R(x + 1, y, 14, 9, '#6e4a26'); R(x + 2, y + 1, 12, 7, '#c9975a');
    R(x + 4, y + 3, 8, 1, '#6e4a26'); R(x + 4, y + 5, 6, 1, '#6e4a26');
  }
  for (const it of items) {
    const x = Math.round(it.x) - cx, y = Math.round(it.y) - cy;
    if (it.kind === 'check') {
      R(x, y, 16, 26, '#2f6fb8'); R(x + 1, y + 1, 14, 3, '#5a94d6'); R(x + 3, y + 6, 10, 20, '#2a5f9e');
      R(x + 6, y + 8, 4, 2, '#e8d070'); R(x + 11, y + 15, 1, 3, '#c9d1dc');
      R(x + 6, y - 4, 4, 4, it.on ? '#7ee07e' : '#d23b3b');
      if (it.on && Math.sin(tm * 5) > 0) R(x + 5, y - 5, 6, 1, '#c8ffc8');
    } else if (it.kind === 'goal') {
      R(x + 4, y, 10, 10, '#d9a520'); R(x + 5, y + 1, 8, 8, '#ffd23f');
      R(x + 2, y + 10, 20, 4, '#ffd23f'); R(x + 3, y + 11, 18, 2, '#fff1a8'); R(x + 6, y + 14, 12, 6, '#d9a520'); R(x + 4, y + 20, 16, 4, '#b9861a');
      for (let k = 0; k < 3; k++) { const a = tm * 2 + k * 2.1; if (Math.sin(tm * 7 + k * 3) > 0.2) R(x + 12 + Math.cos(a) * 16, y + 8 + Math.sin(a) * 12, 2, 2, '#fff8c0'); }
    } else if (it.kind === 'burrito' && !it.gone) {
      const by = y + Math.round(Math.sin(tm * 4 + it.x) * 2);
      R(x, by + 1, 12, 6, '#d9b26e'); R(x + 1, by, 10, 8, '#e8c88a'); R(x + 3, by + 1, 1, 6, '#b48a4a'); R(x + 7, by + 1, 1, 6, '#b48a4a');
      R(x + 11, by + 2, 2, 4, '#5aa83a'); R(x + 12, by + 3, 1, 2, '#c43a2a');
    }
  }
}
function drawPlungers() {
  const cx = Math.round(cam.x), cy = Math.round(cam.y), tm = performance.now() / 1000;
  for (const pl of plungers) {
    if (pl.dead && pl.y > LH * T + 50) continue;
    const x = Math.round(pl.x) - cx, y = Math.round(pl.y) - cy;
    if (pl.dead) { ctx.save(); ctx.translate(x + 6, y + 7); ctx.rotate(pl.spin || 0); ctx.translate(-6, -7); }
    const wob = pl.dead ? 0 : Math.round(Math.sin(tm * 10 + pl.x) * 1);
    const red = pl.hit > 0 ? '#ffffff' : '#d23b3b';
    const ox = pl.dead ? 0 : x, oy = pl.dead ? 0 : y;
    R(ox + 5 + wob, oy, 2, 7, '#b88a52');
    R(ox + 1, oy + 7, 10, 5, red); R(ox, oy + 11, 12, 3, pl.hit > 0 ? '#ffffff' : '#a52a2a');
    const ex = pl.vx > 0 ? 2 : 0;
    R(ox + 3 + ex, oy + 8, 2, 2, '#fff'); R(ox + 6 + ex, oy + 8, 2, 2, '#fff'); R(ox + 4 + ex, oy + 9, 1, 1, '#000'); R(ox + 7 + ex, oy + 9, 1, 1, '#000');
    if (pl.dead) ctx.restore();
  }
}
function drawMaster() {
  const m = master;
  if (m.dead) return;
  const x = Math.round(m.x - cam.x), y = Math.round(m.y - cam.y), f = m.face;
  const P = (dx, dy, w, h, col) => R(f > 0 ? x + dx : x + m.w - dx - w, y + dy, w, h, col);
  const step = m.ground && Math.abs(m.vx) > 10 ? Math.floor(m.anim / 6) % 2 : 0;
  const air = !m.ground;
  // legs
  P(2, 11, 2, air ? 2 : 3 - step, '#22222e'); P(6, 11, 2, air ? 3 : 2 + step, '#22222e');
  P(1, 13 - (air ? 1 : step), 3, 1, '#111'); P(6, 13 - (air ? 0 : 1 - step), 3, 1, '#111');
  // suit
  P(1, 5, 8, 6, '#2b2b3d'); P(4, 5, 2, 4, '#f4f4f4'); P(4, 5, 2, 1, '#d23b3b');
  P(8, 6, 2, 3, '#2b2b3d');
  // head
  P(2, 0, 6, 5, '#f2c9a0'); P(6, 2, 1, 1, '#222'); P(4, 4, 4, 1, '#5a3a20');
  P(5, 1, 3, 3, '#ffd23f'); P(6, 2, 1, 1, '#222');
  // top hat
  P(1, -1, 8, 1, '#111'); P(2, -6, 6, 5, '#1a1a24'); P(2, -3, 6, 1, '#7a2a6a');
  for (const [dx, dy] of m.dirtSpots) P(dx, dy - 4, 1, 1, '#6b4220');
}
function drawBlaster() {
  const b = blaster, x = Math.round(b.x - cam.x + b.w / 2), y = Math.round(b.y - cam.y + b.h / 2 + Math.sin(b.bob * 4) * (b.firing ? 0 : 1));
  const shakeB = b.charge > 0 ? Math.round(rand(-1, 1) * b.charge * 3) : 0;
  // aim guide
  if (b.firing || b.charge > 0) {
    for (let k = 1; k <= 3; k++) R(x + b.aim.x * (10 + k * 7) - 1, y + b.aim.y * (10 + k * 7) - 1, 2, 2, b.charge >= 0.35 ? '#ffd23f' : 'rgba(255,255,255,0.6)');
  }
  ctx.save();
  ctx.translate(x + shakeB, y);
  ctx.rotate(b.ang);
  if (Math.cos(b.ang) < 0) ctx.scale(1, -1);
  // cape
  R(-9, -6, 6, 10, '#c0392b');
  // body (round, green spandex)
  disc(0, 0, 6, '#3fa84a'); disc(-1, -1, 4, '#5cc866');
  // cheeks pointing at the target
  disc(5, -2, 3, '#f2c9a0'); disc(5, 2, 3, '#e8b48a'); R(6, -1, 3, 1, '#6b4220');
  // head on the far side, goggles on
  disc(-5, -5, 3, '#f2c9a0'); R(-8, -6, 6, 2, '#222'); R(-7, -6, 2, 1, '#7ff7ff');
  ctx.restore();
  if (b.charge > 0) { const w = Math.round(16 * Math.min(1, b.charge / 0.35)); R(x - 8, y - 14, 16, 2, '#1b1210'); R(x - 8, y - 14, w, 2, b.charge >= 0.35 ? '#ffd23f' : '#c08a4a'); }
}
function drawShots() {
  const cx = cam.x, cy = cam.y;
  for (const p of parts) R(p.x - cx - 1, p.y - cy - 1, 2, 2, p.col);
  for (const o of blobs) { disc(o.x - cx, o.y - cy, 5, '#5a3416'); disc(o.x - cx - 1, o.y - cy - 1, 3, '#7d4f26'); R(o.x - cx - 2, o.y - cy - 3, 2, 1, '#a57a4a'); }
  for (const f of fx) { ctx.globalAlpha = clamp(f.life / f.max * 1.5, 0, 1); R(f.x - cx, f.y - cy, f.s, f.s, f.col); }
  ctx.globalAlpha = 1;
}
function drawHUD() {
  drawText((lvlIndex + 1) + '. ' + lvl.name, 6, 5, '#fff4d6', 1, 'left', '#1b1210');
  drawText(fmtTime(stageTime), W / 2, 5, '#fff4d6', 1, 'center', '#1b1210');
  drawText('DEATHS ' + deaths, W - 6, 5, '#fff4d6', 1, 'right', '#1b1210');
  const b = blaster;
  drawText('TANK', 6, H - 11, b.spicy > 0 ? '#ffb347' : '#fff4d6', 1, 'left', '#1b1210');
  R(23, H - 13, 84, 9, '#c9975a'); R(24, H - 12, 82, 7, '#1b1210');
  R(25, H - 11, Math.round(80 * b.tank / 100), 5, b.spicy > 0 ? (Math.floor(titleT * 10) % 2 ? '#ff7a2a' : '#ffd23f') : b.dry ? '#a52a2a' : '#8f5d2c');
  if (b.spicy > 0) drawText('SPICY!', 110, H - 11, '#ff7a2a', 1, 'left', '#1b1210');
  const dg = Math.max(0, Math.round(100 - dirt * 0.08));
  drawText('MASTER DIGNITY ' + dg + '%', W - 6, H - 11, dg > 50 ? '#fff4d6' : '#c08a4a', 1, 'right', '#1b1210');
  if (signText) {
    const lines = wrap(signText, 300);
    const h = lines.length * 8 + 10, y = 18;
    panel(W / 2 - 160, y, 320, h, '#2a1d14', '#c9975a');
    lines.forEach((l, k) => drawText(l, W / 2, y + 6 + k * 8, '#fff4d6', 1, 'center'));
  }
  if (banner > 0 && !signText && state === 'play') {
    const a = Math.min(1, banner);
    ctx.globalAlpha = a;
    drawText('STAGE ' + (lvlIndex + 1), W / 2, 60, '#ffd23f', 2, 'center', '#1b1210');
    drawText(lvl.name, W / 2, 76, '#fff4d6', 3, 'center', '#1b1210');
    ctx.globalAlpha = 1;
  }
}
function drawWorld() {
  const sx = shake > 0 ? Math.round(rand(-2, 2)) : 0, sy = shake > 0 ? Math.round(rand(-2, 2)) : 0;
  ctx.save(); ctx.translate(sx, sy);
  drawBackground(); drawTiles(); drawItems(); drawPlungers(); drawMaster(); drawBlaster(); drawShots();
  ctx.restore();
}

// ============================================================ drawing: screens
function dripTitle(str, y, sc) {
  const w = textW(str, sc), x0 = Math.round(W / 2 - w / 2);
  drawText(str, x0 + sc, y + sc, '#2a1508', sc);
  drawText(str, x0, y, '#7d4f26', sc);
  drawText(str, x0, y, '#8f5d2c', sc); // base
  // drips
  for (let k = 0; k < Math.floor(w / 9); k++) {
    const dx = x0 + Math.floor(hash(k, 7) * w), len = Math.floor((hash(k, 3) * 0.6 + 0.4) * (6 + 6 * ((Math.sin(titleT * 1.5 + k) + 1) / 2)));
    R(dx, y + sc * 5, 2, len, '#7d4f26'); R(dx, y + sc * 5 + len, 2, 2, '#5a3416');
  }
}
function drawTitle() {
  drawBackgroundScreen('#2b1a10', '#5a3a20');
  dripTitle('DIARRHEA', 34, 6);
  dripTitle('BLASTERS', 76, 6);
  drawText('A TWO-PLAYER CO-OP PLATFORMER', W / 2, 122, '#ffd23f', 1, 'center');
  const cy = 140;
  panel(28, cy, 200, 70, '#1b1210', '#3fa84a');
  panel(252, cy, 200, 70, '#1b1210', '#c0392b');
  drawText('PLAYER 1: MASTER', 128, cy + 6, '#7ee07e', 1, 'center');
  drawText('GETS FROM START TO FINISH', 128, cy + 16, '#fff4d6', 1, 'center');
  drawText('A / D   WALK', 128, cy + 30, '#fff4d6', 1, 'center');
  drawText('W OR SPACE   JUMP', 128, cy + 40, '#fff4d6', 1, 'center');
  drawText('S + JUMP   DROP THROUGH', 128, cy + 50, '#fff4d6', 1, 'center');
  drawText('PLAYER 2: BLASTER', 352, cy + 6, '#ff8a7a', 1, 'center');
  drawText('GETS MASTER OVER OBSTACLES', 352, cy + 16, '#fff4d6', 1, 'center');
  drawText('ARROWS   FLY', 352, cy + 30, '#fff4d6', 1, 'center');
  drawText('HOLD A DIRECTION + / (OR R-SHIFT, L)   BLAST', 352, cy + 40, '#fff4d6', 1, 'center');
  drawText('HOLD . (OR ENTER, K) TO CHARGE   MEGA BLAST', 352, cy + 50, '#fff4d6', 1, 'center');
  drawText('GAMEPADS: PAD 1 = MASTER, PAD 2 = BLASTER', W / 2, cy + 78, '#b5a68c', 1, 'center');
  if (Math.floor(titleT * 2) % 2 === 0) drawText('PRESS ENTER', W / 2, cy + 92, '#ffd23f', 2, 'center', '#1b1210');
  drawText('BY ONEISNOTPRIME & Θ · A CLAUDE CODE AGENT · M MUTE · BUILD ' + BUILD, W / 2, H - 9, '#8a7a66', 1, 'center');
}
function drawBackgroundScreen(a, b) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, a); g.addColorStop(1, b);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  for (let k = 0; k < 40; k++) {
    const x = (hash(k, 1) * W + titleT * (10 + hash(k, 2) * 20)) % W, y = (hash(k, 3) * H + titleT * 30 * hash(k, 4)) % H;
    R(x, y, 2, 2, 'rgba(143,93,44,0.5)');
  }
}
function drawSelect() {
  drawBackgroundScreen('#2b1a10', '#5a3a20');
  drawText('CHOOSE A STAGE', W / 2, 18, '#ffd23f', 3, 'center', '#1b1210');
  const y0 = 54;
  LEVELS.forEach((L, i) => {
    const y = y0 + i * 24, sel = i === menuSel, locked = i >= save.unlocked;
    panel(70, y, 340, 20, sel ? '#3a2616' : '#1b1210', sel ? '#ffd23f' : '#5a3a20');
    drawText((i + 1) + '. ' + (locked ? '???' : L.name), 80, y + 5, locked ? '#6b5a48' : '#fff4d6', 2);
    const bst = save.best[i];
    if (bst) drawText(fmtTime(bst.t) + '  ' + bst.d + ' DEATHS  ' + bst.g + '%', 400, y + 8, '#b5a68c', 1, 'right');
    else if (locked) drawText('LOCKED', 400, y + 8, '#6b5a48', 1, 'right');
  });
  drawText('UP/DOWN TO PICK · ENTER TO PLAY · ESC BACK', W / 2, H - 12, '#b5a68c', 1, 'center');
}
function drawPause() {
  ctx.fillStyle = 'rgba(20,10,5,0.7)'; ctx.fillRect(0, 0, W, H);
  drawText('PAUSED', W / 2, 70, '#ffd23f', 4, 'center', '#1b1210');
  ['RESUME', 'RESTART STAGE', 'STAGE SELECT'].forEach((s, i) => drawText((i === pauseSel ? '> ' : '  ') + s, W / 2, 120 + i * 18, i === pauseSel ? '#fff4d6' : '#8a7a66', 2, 'center'));
  drawText('R = RESPAWN AT LAST PORTA-POTTY', W / 2, 190, '#b5a68c', 1, 'center');
}
function drawClear() {
  const c = clearInfo;
  ctx.fillStyle = 'rgba(20,10,5,' + Math.min(0.75, c.T) + ')'; ctx.fillRect(0, 0, W, H);
  drawText('FLUSHED!', W / 2, 50, '#ffd23f', 5, 'center', '#1b1210');
  drawText(lvl.name + ' CLEAR', W / 2, 88, '#fff4d6', 2, 'center');
  const rows = [['TIME', fmtTime(c.t) + (c.record ? '  NEW BEST!' : '')], ['DEATHS', String(c.d)], ["MASTER'S DIGNITY", c.g + '%']];
  rows.forEach(([a, b], i) => { if (c.T > 0.4 + i * 0.25) { drawText(a, W / 2 - 10, 120 + i * 16, '#b5a68c', 2, 'right'); drawText(b, W / 2 + 10, 120 + i * 16, '#fff4d6', 2); } });
  if (c.T > 1.2 && Math.floor(titleT * 2) % 2 === 0) drawText(c.last ? 'ENTER: CONTINUE' : 'ENTER: NEXT STAGE · ESC: STAGE SELECT', W / 2, 200, '#ffd23f', 1, 'center');
}
function drawEnd() {
  drawBackgroundScreen('#2a1e52', '#c7699a');
  dripTitle('THE THRONE', 40, 5);
  dripTitle('IS YOURS', 76, 5);
  const lines = ['MASTER REACHED THE GOLDEN THRONE.', 'HIS DIGNITY DID NOT.', '', 'BLASTER IS VERY TIRED AND A LITTLE DEHYDRATED.', 'PLEASE DRINK WATER, BLASTER.'];
  lines.forEach((l, i) => drawText(l, W / 2, 130 + i * 12, '#fff4d6', 1, 'center'));
  let t = 0, d = 0;
  for (let i = 0; i < LEVELS.length; i++) if (save.best[i]) { t += save.best[i].t; d += save.best[i].d; }
  drawText('BEST TOTAL: ' + fmtTime(t) + ' · ' + d + ' DEATHS', W / 2, 206, '#ffd23f', 1, 'center');
  if (Math.floor(titleT * 2) % 2 === 0) drawText('PRESS ENTER', W / 2, 232, '#ffd23f', 2, 'center');
}
function draw() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (state === 'title') return drawTitle();
  if (state === 'select') return drawSelect();
  if (state === 'end') return drawEnd();
  drawWorld(); drawHUD();
  if (state === 'pause') drawPause();
  if (state === 'clear') drawClear();
}

// ============================================================ loop
let last = performance.now(), acc = 0;
function frame(now) {
  acc += Math.min(0.1, (now - last) / 1000); last = now;
  while (acc >= STEP) { update(STEP); acc -= STEP; pressed.clear(); released.clear(); }
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
// debug/test hook
window.DB = { get state() { return state; }, set state(v) { state = v; }, loadStage, get master() { return master; }, get blaster() { return blaster; }, get cam() { return cam; }, tileAt: (x, y) => tAt(x, y), crustAt: (x, y) => crust[y * LW + x], LEVELS, save };
})();
