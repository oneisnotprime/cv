/* Sign of the Times — a pixel sign-spinning combo game. The store behind you is hiring. */
'use strict';
(() => {
const BUILD = '2026.10.19-a';
// ============================================================ utils
const VW = 320, VH = 180, GROUND = 128, PX = 140, DOOR_X = 255;
const TAU = Math.PI * 2;
const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const money = (n) => (n < 0 ? '-$' : '$') + fmt(Math.abs(n));
const $ = (id) => document.getElementById(id);
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
};
const mulberry = (a) => () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const rgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mix = (a, b, t) => { const A = rgb(a), B = rgb(b); return '#' + A.map((v, i) => Math.round(lerp(v, B[i], t)).toString(16).padStart(2, '0')).join(''); };

// ============================================================ canvas
const cvs = $('game');
const ctx = cvs.getContext('2d');
ctx.imageSmoothingEnabled = false;
const stage = $('stage'), pad = $('pad'), ov = $('overlay');
let isTouch = window.matchMedia && matchMedia('(pointer: coarse)').matches;
function layout() {
  const w = window.innerWidth, h = window.innerHeight, portrait = h > w;
  document.body.classList.toggle('touch', isTouch);
  document.body.classList.toggle('portrait', portrait);
  pad.hidden = !isTouch;
  const availH = isTouch && portrait ? h - Math.min(h * 0.45, 320) - 96 : h;
  const availW = isTouch && !portrait ? w - 270 : w;
  let s = Math.min(availW / VW, availH / VH);
  if (s >= 2) s = Math.floor(s * 2) / 2;
  stage.style.width = Math.floor(VW * s) + 'px';
  stage.style.height = Math.floor(VH * s) + 'px';
  stage.style.setProperty('--u', s + 'px');
}
window.addEventListener('resize', layout);
layout();

// ============================================================ pixel font (3x5, a few wide glyphs)
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
  '-': '000,000,111,000,000', '+': '000,010,111,010,000', '*': '000,101,010,101,000', ':': '0,1,0,1,0',
  "'": '1,1,0,0,0', '/': '001,001,010,100,100', '$': '011,110,010,011,110', '&': '010,101,010,101,011',
  '#': '101,111,101,111,101', '(': '01,10,10,10,01', ')': '10,01,01,01,10', '>': '100,010,001,010,100',
  '<': '001,010,100,010,001', '@': '01010,11111,11111,01110,00100', ' ': '00,00,00,00,00',
};
const FONT = {};
for (const [ch, s] of Object.entries(GLYPHS)) { const rows = s.split(','); FONT[ch] = { w: rows[0].length, rows }; }
const textW = (str, sc = 1) => { let w = 0; for (const ch of String(str).toUpperCase()) w += ((FONT[ch] || FONT[' ']).w + 1) * sc; return Math.max(0, w - sc); };
function drawText(g, str, x, y, col, sc = 1, align = 'left', shadow = null) {
  str = String(str).toUpperCase();
  if (align === 'center') x -= Math.floor(textW(str, sc) / 2); else if (align === 'right') x -= textW(str, sc);
  x = Math.round(x); y = Math.round(y);
  if (shadow) drawText(g, str, x + sc, y + sc, shadow, sc);
  g.fillStyle = col;
  for (const ch of str) {
    const gl = FONT[ch] || FONT[' '];
    for (let r = 0; r < 5; r++) for (let c = 0; c < gl.w; c++) if (gl.rows[r][c] === '1') g.fillRect(x + c * sc, y + r * sc, sc, sc);
    x += (gl.w + 1) * sc;
  }
}

// ============================================================ drawing helpers
let OX = 0, OY = 0; // screen shake
const R = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(x), Math.round(y), w, h); };
function pline(x0, y0, x1, y1, col) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy; ctx.fillStyle = col;
  for (let i = 0; i < 200; i++) {
    ctx.fillRect(x0, y0, 2, 2);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}
function disc(g, cx, cy, r, col) { g.fillStyle = col; for (let dy = -r; dy <= r; dy++) { const w = Math.floor(Math.sqrt(r * r - dy * dy)); g.fillRect(Math.round(cx - w), Math.round(cy + dy), w * 2 + 1, 1); } }
function ring(cx, cy, r, col) { ctx.fillStyle = col; const n = Math.max(12, Math.round(r * 5)); for (let i = 0; i < n; i++) { const a = (i / n) * TAU; ctx.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), 1, 1); } }

// ============================================================ the sign
const SIGN_W = 64, SIGN_H = 16;
function signMask(x, y) {
  if (x >= 1 && x <= 49 && y >= 2 && y <= 13) return true;
  if (x >= 50 && x <= 63) return Math.abs(y + 0.5 - 8) <= (63 - x) * 8 / 14 + 0.01;
  return false;
}
function buildSign(front, back, bg = '#ffd23f', ink = '#2a1a10', backBg = '#f4efe0', backInk = '#c0392b') {
  const face = (txt, mirror, fill, fg) => {
    const c = document.createElement('canvas'); c.width = SIGN_W; c.height = SIGN_H;
    const g = c.getContext('2d');
    for (let y = 0; y < SIGN_H; y++) for (let x = 0; x < SIGN_W; x++) {
      if (!signMask(x, y)) continue;
      const edge = !signMask(x - 1, y) || !signMask(x + 1, y) || !signMask(x, y - 1) || !signMask(x, y + 1);
      g.fillStyle = edge ? ink : y <= 3 ? mix(fill, '#ffffff', 0.35) : y >= 12 ? mix(fill, '#000000', 0.15) : fill;
      g.fillRect(x, y, 1, 1);
    }
    if (!mirror) drawText(g, txt, 28, 6, fg, 1, 'center');
    else {
      const t = document.createElement('canvas'); t.width = SIGN_W; t.height = SIGN_H;
      drawText(t.getContext('2d'), txt, SIGN_W - 1 - 28, 6, fg, 1, 'center');
      g.save(); g.scale(-1, 1); g.drawImage(t, -SIGN_W, 0); g.restore();
    }
    return c;
  };
  return { f: face(front, false, bg, ink), b: face(back, true, backBg, backInk) };
}
function drawSign(tex, x, y, p) {
  const c = Math.cos(p.r), s = Math.sin(p.r);
  let sx = p.sx;
  if (Math.abs(sx) < 0.07) sx = sx < 0 ? -0.07 : 0.07;
  ctx.setTransform(c * sx, s * sx, -s * p.sy, c * p.sy, Math.round(x) + OX, Math.round(y) + OY);
  ctx.drawImage(sx < 0 ? tex.b : tex.f, Math.round(-SIGN_W / 2 - p.g), -SIGN_H / 2);
  ctx.setTransform(1, 0, 0, 1, OX, OY);
}

// ============================================================ tricks
// A pose places the hands relative to the feet; the sign hangs off the hands at grip g (sign-local x).
const REST = { hx: 5, hy: -16, r: 0, sx: 1, sy: 1, g: -22, behind: false, body: 1, crouch: 0 };
const TRICKS = {
  flat: { name: 'FLAT SPIN', btn: 'spin', mod: 0, dur: 0.42, pts: 100, inst: 0.25, kind: 'spin' },
  over: { name: 'OVERHEAD 360', btn: 'spin', mod: 'up', dur: 0.6, pts: 220, inst: 0.45, kind: 'spin' },
  sweep: { name: 'LOW SWEEP', btn: 'spin', mod: 'down', dur: 0.6, pts: 200, inst: 0.4, kind: 'spin' },
  prop: { name: 'PROPELLER', btn: 'twirl', mod: 0, dur: 0.48, pts: 150, inst: 0.3, kind: 'twirl' },
  heli: { name: 'HELICOPTER', btn: 'twirl', mod: 'up', dur: 0.72, pts: 320, inst: 0.55, kind: 'twirl' },
  legs: { name: 'LEG PASS', btn: 'twirl', mod: 'down', dur: 0.66, pts: 300, inst: 0.5, kind: 'twirl' },
  toss: { name: 'TOSS', btn: 'toss', mod: 0, dur: 0.8, pts: 260, inst: 0.3, kind: 'toss', H: 40, flips: 1, spins: 1, hard: 1 },
  moon: { name: 'MOON TOSS', btn: 'toss', mod: 'up', dur: 1.35, pts: 540, inst: 0.5, kind: 'toss', H: 90, flips: 2, spins: 3, hard: 0.8 },
  back: { name: 'BEHIND THE BACK', btn: 'toss', mod: 'down', dur: 0.95, pts: 440, inst: 0.5, kind: 'toss', H: 46, flips: 1, spins: 2, hard: 0.85 },
  tornado: { name: 'THE TORNADO', btn: 'special', mod: 0, dur: 1.3, pts: 1500, inst: 0.2, kind: 'special' },
  turbine: { name: 'WIND TURBINE', btn: 'special', mod: 'up', dur: 1.3, pts: 1800, inst: 0.3, kind: 'special' },
  quake: { name: 'THE EARTHQUAKE', btn: 'special', mod: 'down', dur: 1.3, pts: 1800, inst: 0.3, kind: 'special' },
  under: { name: '360 UNDER', pts: 180, kind: 'body' },
};
const trickFor = (btn, mod) => Object.keys(TRICKS).find((id) => TRICKS[id].btn === btn && TRICKS[id].mod === mod);
function pose(id, t, dbl) {
  const p = { ...REST };
  const e = smooth(0, 0.18, t) * (1 - smooth(0.82, 1, t));
  const u = t * t * (3 - 2 * t), n = dbl ? 2 : 1;
  p.g = lerp(-22, 0, e);
  switch (id) {
    case 'flat': p.hx = 4; p.hy = -17; p.sx = Math.cos(TAU * n * u); break;
    case 'over': p.hx = lerp(5, 0, e); p.hy = lerp(-16, -38, e); p.sx = Math.cos(TAU * n * u); break;
    case 'sweep': p.hy = lerp(-16, -6, e); p.hx = 4 + 10 * Math.sin(TAU * u) * e; p.sx = Math.cos(TAU * n * u); p.crouch = 3 * e; break;
    case 'prop': p.hy = -18; p.r = TAU * n * u; break;
    case 'heli': p.hx = lerp(5, 0, e); p.hy = lerp(-16, -40, e); p.sx = Math.cos(TAU * 2 * n * u); p.sy = lerp(1, 0.45, e); break;
    case 'legs': p.hx = lerp(5, -3, e); p.hy = lerp(-16, -7, e); p.r = -TAU * n * u; p.behind = t > 0.3 && t < 0.7; p.crouch = 4 * e; break;
    case 'tornado': p.hx = 2; p.hy = -18 - 8 * Math.sin(Math.PI * t); p.r = TAU * 2 * u; p.sx = Math.cos(TAU * 3 * u); p.body = Math.cos(TAU * 2 * u) >= 0 ? 1 : -1; break;
    case 'turbine': p.hx = 0; p.hy = lerp(-16, -44, e); p.r = TAU * 3 * u; break;
    case 'quake': p.hx = 14 * Math.sin(TAU * 2 * u) * e; p.hy = lerp(-16, -5, e); p.sx = Math.cos(TAU * 3 * u); p.r = 0.6 * Math.sin(TAU * 3 * u) * e; p.crouch = 5 * e; break;
    default: break;
  }
  return p;
}
const CATCH = { hx: 4, hy: -21 };

// ============================================================ story data
const DAYS = [null,
  { sign: 'GRAND OPENING', quota: 5000, sky: ['#4fa3ff', '#bde3ff', '#fff3a0'], peds: 1.0, lit: 0.55, traffic: 1, mood: 0 },
  { sign: '50% OFF TODAY', quota: 12000, sky: ['#4a97f0', '#cfe4f0', '#fff3a0'], peds: 0.95, lit: 0.5, traffic: 1, mood: 0 },
  { sign: 'ALL MUST GO', quota: 22000, sky: ['#5a8fd8', '#f0d8b0', '#ffe58a'], peds: 0.85, lit: 0.45, traffic: 1, mood: 0 },
  { sign: 'WE BUY GOLD', quota: 35000, sky: ['#6a7fc0', '#f5b47a', '#ffcf6a'], peds: 0.75, lit: 0.4, traffic: 0.95, mood: 1 },
  { sign: 'WE BUY HOUSES', quota: 50000, sky: ['#6b6aa8', '#f09a6a', '#ffb060'], peds: 0.6, lit: 0.3, traffic: 0.9, mood: 1 },
  { sign: 'WE BUY TIME', quota: 65000, sky: ['#6e7a5a', '#d8d080', '#f4f0a0'], peds: 0.45, lit: 0.2, traffic: 0.8, mood: 1 },
  { sign: 'NOW HIRING', quota: 80000, sky: ['#503a5a', '#c87a5a', '#ff8a5a'], peds: 0.3, lit: 0.1, traffic: 0.7, mood: 2 },
  { sign: 'SMILE', quota: 100000, sky: ['#2a1630', '#a03040', '#ff5040'], peds: 0, lit: 0.03, traffic: 0.55, mood: 2, final: true },
];
const FREE_DAY = { sign: 'FREE SPIN', quota: 0, sky: ['#4fa3ff', '#bde3ff', '#fff3a0'], peds: 1, lit: 0.5, traffic: 1, mood: 0 };
const LAST_DAY = 8;
const EXPENSES = [null, [['BUS FARE', 10], ['FOOD', 12]], [['RENT', 30], ['FOOD', 12]], [['RENT', 30], ['FOOD', 14], ['PHONE', 15]],
  [['RENT', 40], ['FOOD', 14]], [['RENT', 40], ['FOOD', 16], ['UNIFORM DRY CLEANING', 25]], [['RENT', 55], ['FOOD', 16]], [['RENT', 55], ['FOOD', 18], ['GLADCO PARKING', 30]], []];
const DAY_GOALS = [null,
  [['trick', 'prop'], ['comboLen', 3], ['perfects', 3]],
  [['trick', 'heli'], ['comboPts', 1500], ['audience', 2]],
  [['trick', 'moon'], ['comboLen', 5], ['clean']],
  [['special', 1], ['comboPts', 5000], ['perfects', 12]],
  [['trick', 'back'], ['comboLen', 7], ['audience', 3]],
  [['comboPts', 10000], ['special', 2], ['clean']],
  [['comboLen', 10], ['comboPts', 18000], ['perfects', 25]],
  [['comboLen', 12], ['comboPts', 30000], ['letgo']],
];
const UPGRADES = [
  { id: 'gloves', name: 'GRIPPY GLOVES', max: 3, cost: [90, 220, 480], d: 'Wider timing windows: +15% per level.', f: 'Rubberized palms. From the gas station, at gas station prices.' },
  { id: 'shoes', name: 'DECENT SHOES', max: 3, cost: [120, 260, 520], d: 'Balance wobbles 12% less per level.', f: 'Your old pair had a hole you could fit a sign through.' },
  { id: 'drink', name: 'ENERGY DRINK', max: 2, cost: [70, 200], d: 'Special meter fills 25% faster per level.', f: 'Contains taurine, guarana, and a smell.' },
  { id: 'paint', name: 'REFLECTIVE PAINT', max: 2, cost: [180, 420], d: '+15% trick points per level.', f: 'Drivers can see you from space. Some of them look away.' },
  { id: 'shades', name: 'COOL SHADES', max: 1, cost: [150], d: 'Stopped cars count as a bigger audience.', f: 'Nobody can tell where you are looking. Not even you.' },
];
const WELLNESS = [
  { id: 'patch', day: 1, name: 'FOCUS PATCH', d: 'Time slows down during every timing window.', f: 'Side effects may include: no longer dreaming.' },
  { id: 'smile', day: 2, name: 'SMILE RETAINER', d: '+50% trick points. Honk tips doubled.', f: "Drivers love a smile. It doesn't come off." },
  { id: 'ear', day: 3, name: 'INNER EAR RECALIBRATION', d: 'Balance wobbles 45% less.', f: 'You will no longer feel which way is down. You will not need to.' },
  { id: 'lattice', day: 4, name: 'TENDON LATTICE', d: 'Spins and twirls go double: twice the rotations, 1.6x points.', f: 'Titanium mesh. You can hear it when it rains.' },
  { id: 'sleep', day: 5, name: 'SLEEP DEFERRAL', d: 'Shifts last 40 seconds longer.', f: 'Night is a formality. So is the weekend.' },
  { id: 'lens', day: 6, name: 'BRAND LENS', d: 'Gold cars appear. Bank a combo while one is on screen for x2.', f: 'Every face becomes a logo. It is easier this way.' },
  { id: 'integration', day: 7, name: 'FULL INTEGRATION', d: 'You can never drop the sign again.', f: 'Your hands will not be needed for anything else.' },
];
const ENDINGS = {
  letgo: { title: 'LET GO', n: 1, text: [
    'The sign sails over the traffic and straight through the GLADCO window.',
    'For a second, nothing happens.',
    'Then the door opens and people walk out. Blinking. Dozens of them. A few are still smiling; it fades by the time they reach the curb.',
    'Dev is with them, rubbing their wrists.',
    'Across the street, Mara is waving with both hands.',
    'Your hands are empty. It feels like falling. It feels fine.'] },
  forever: { title: 'EVERY CORNER', n: 2, text: [
    'The shift ends. Another one begins. There is no difference anymore.',
    'Jill says you are the best they have ever had. You agree. You do not remember the question.',
    "Mara's number is gone from your phone. You do not have a phone. You have a sign.",
    'GLADCO opens forty new locations that week. You are on every corner.'] },
  tenure: { title: 'TENURE', n: 3, text: [
    'The shift ends. You stay. The streetlights come on and you are still spinning.',
    'Jill is waiting by the door with a clipboard and a pen that is already uncapped.',
    '"Ready for your promotion?"',
    'You nod. You were always going to nod.',
    '(There was another way. The back of the sign said so.)'] },
};

// ============================================================ save
const SAVE_KEY = 'sott.save.v1';
const freshSave = () => ({ day: 1, cash: 0, up: {}, dark: {}, best: 0, freeBest: 0, endings: {}, visitors: 0, muted: false, seenSpecial: false, started: false });
let save = Object.assign(freshSave(), store.get(SAVE_KEY) || {});
const persist = () => store.set(SAVE_KEY, save);
const has = (id) => !!save.dark[id];
const lvl = (id) => save.up[id] || 0;
const darkCount = () => WELLNESS.filter((w) => has(w.id)).length;

// ============================================================ audio
const AU = { ctx: null, master: null, sfx: null, mus: null, noise: null, next: 0, step: 0, timer: 0 };
function audioInit() {
  if (AU.ctx) { if (AU.ctx.state === 'suspended') AU.ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  AU.ctx = new AC();
  AU.master = AU.ctx.createGain(); AU.master.gain.value = save.muted ? 0 : 0.8; AU.master.connect(AU.ctx.destination);
  AU.sfx = AU.ctx.createGain(); AU.sfx.gain.value = 0.7; AU.sfx.connect(AU.master);
  AU.mus = AU.ctx.createGain(); AU.mus.gain.value = 0.32; AU.mus.connect(AU.master);
  const len = AU.ctx.sampleRate; AU.noise = AU.ctx.createBuffer(1, len, len);
  const d = AU.noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  AU.timer = setInterval(musicTick, 25);
}
function toggleMute() { save.muted = !save.muted; persist(); if (AU.master) AU.master.gain.value = save.muted ? 0 : 0.8; }
function tone(f, dur, o = {}) {
  const c = AU.ctx; if (!c) return;
  const t = o.when ?? c.currentTime + (o.at || 0);
  const osc = c.createOscillator(), g = c.createGain();
  osc.type = o.type || 'square'; osc.frequency.setValueAtTime(f, t);
  if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.slide), t + dur);
  if (o.detune) osc.detune.value = o.detune;
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(o.vol ?? 0.12, t + (o.attack || 0.005)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g); g.connect(o.dest || AU.sfx); osc.start(t); osc.stop(t + dur + 0.05);
}
function noise(dur, o = {}) {
  const c = AU.ctx; if (!c) return;
  const t = o.when ?? c.currentTime + (o.at || 0);
  const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  src.buffer = AU.noise; f.type = o.type || 'bandpass'; f.frequency.setValueAtTime(o.freq || 2000, t); f.Q.value = o.q || 1;
  if (o.sweep) f.frequency.exponentialRampToValueAtTime(o.sweep, t + dur);
  g.gain.setValueAtTime(o.vol ?? 0.15, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(o.dest || AU.sfx); src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
}
const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
const Sfx = {
  whoosh(k = 1) { noise(0.2 * k, { freq: 700, sweep: 3200, q: 1.5, vol: 0.16 }); },
  perfect(n) { const f = 880 * Math.pow(2, Math.min(n, 14) / 12); tone(f, 0.12, { vol: 0.07 }); tone(f * 1.5, 0.12, { at: 0.05, vol: 0.05 }); },
  good() { tone(620, 0.06, { vol: 0.05 }); },
  fumble() { tone(150, 0.16, { type: 'sawtooth', vol: 0.09, slide: 70 }); },
  catch() { tone(1400, 0.03, { vol: 0.07 }); noise(0.04, { freq: 4200, vol: 0.08 }); },
  drop() { noise(0.4, { type: 'lowpass', freq: 900, vol: 0.32 }); tone(320, 0.45, { type: 'triangle', slide: 55, vol: 0.14 }); noise(0.08, { freq: 3000, at: 0.28, vol: 0.18 }); noise(0.06, { freq: 2500, at: 0.4, vol: 0.12 }); },
  bank(big) { tone(988, 0.08, { vol: 0.07 }); tone(1319, big ? 0.3 : 0.16, { at: 0.07, vol: 0.07 }); noise(0.1, { freq: 6000, at: 0.02, vol: 0.05 }); },
  honk() { tone(330, 0.26, { type: 'sawtooth', vol: 0.05 }); tone(415, 0.26, { type: 'sawtooth', vol: 0.04 }); },
  goal() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.14, { at: i * 0.07, vol: 0.06 })); },
  special() { tone(200, 0.6, { slide: 1600, vol: 0.06, type: 'sawtooth' }); [0, 1, 2, 3, 4].forEach((i) => tone(1200 + i * 220, 0.08, { at: 0.1 + i * 0.06, vol: 0.04 })); },
  ready() { tone(784, 0.1, { vol: 0.05 }); tone(1175, 0.2, { at: 0.08, vol: 0.05 }); },
  tick() { tone(1000, 0.03, { vol: 0.04 }); },
  glass() { noise(0.8, { type: 'highpass', freq: 3500, vol: 0.35 }); for (let i = 0; i < 8; i++) tone(rand(2500, 5000), 0.08, { at: rand(0, 0.5), vol: 0.03, type: 'triangle' }); },
  ui() { tone(700, 0.04, { vol: 0.04 }); },
  sign() { tone(220, 0.5, { type: 'triangle', vol: 0.08, slide: 110 }); tone(233, 0.5, { type: 'triangle', vol: 0.06, slide: 116 }); },
};
const MOODS = [
  { bpm: 116, chords: [[48, 52, 55], [45, 48, 52], [41, 45, 48], [43, 47, 50]], bass: [0, 3, 6, 8, 11, 14], arp: true, hat: true, kick: true },
  { bpm: 100, chords: [[45, 48, 52], [41, 45, 48], [48, 52, 55], [40, 44, 47]], bass: [0, 6, 8, 14], arp: true, hat: true, kick: false },
  { bpm: 84, chords: [[45, 48, 52], [46, 50, 53]], bass: [0], arp: false, hat: false, kick: false, bell: true },
];
function musicTick() {
  const c = AU.ctx; if (!c) return;
  const on = S && S.mode === 'play' && !S.letGo;
  if (!on) { AU.next = c.currentTime + 0.05; return; }
  const M = MOODS[(S.free ? FREE_DAY : DAYS[S.day]).mood];
  const stepDur = 60 / M.bpm / 4;
  if (AU.next < c.currentTime) AU.next = c.currentTime + 0.05;
  while (AU.next < c.currentTime + 0.12) {
    const s = AU.step % 16, bar = Math.floor(AU.step / 16) % M.chords.length, ch = M.chords[bar], when = AU.next, d = AU.mus;
    if (M.bass.includes(s)) tone(midi(ch[0] - 12), stepDur * 1.8, { when, type: 'triangle', vol: 0.22, dest: d });
    if (M.arp && s % 2 === 0) tone(midi(ch[(s / 2) % 3] + (s % 8 === 6 ? 24 : 12)), stepDur * 0.9, { when, vol: 0.035, dest: d });
    if (M.hat && s % 4 === 2) noise(0.04, { when, type: 'highpass', freq: 7000, vol: 0.05, dest: d });
    if (M.kick && s % 8 === 0) tone(120, 0.12, { when, type: 'sine', slide: 40, vol: 0.3, dest: d });
    if (M.bell && s % 8 === 0) { tone(midi(ch[s === 0 ? 0 : 2] + 24), 1.2, { when, type: 'triangle', vol: 0.05, dest: d }); tone(midi(ch[0] + 24), 1.2, { when, type: 'triangle', vol: 0.03, detune: 18, dest: d }); }
    if (M.bell && s === 0) tone(midi(ch[0] - 24), stepDur * 16, { when, type: 'sawtooth', vol: 0.03, dest: d, attack: 0.4 });
    AU.next += stepDur; AU.step++;
  }
}

// ============================================================ world
const LANES = [{ y: 153, dir: -1, stop: 40 }, { y: 172, dir: 1, stop: 272 }];
const CAR_COLS = ['#c0392b', '#2e6fbf', '#e8e4dc', '#3a3a3a', '#7a8a96', '#2f8a5a', '#d0a040', '#8a3a7a', '#e07a30'];
const PED_SHIRTS = ['#c0392b', '#2e6fbf', '#3a9a5a', '#e8e4dc', '#8a3a7a', '#e07a30', '#4a4a5a', '#d0a040'];
const SKINS = ['#f0c090', '#d8a070', '#a86a40', '#7a4a2a', '#f4d0b0'];
let S = null, tex = null, devTex = null, staticLayer = null;
const dayDef = () => (S.free ? FREE_DAY : DAYS[S.day]);

function newWorld(day, free) {
  S = {
    mode: 'title', day, free, time: 1, timeMax: 1, intro: 0, over: false, endT: 0,
    score: 0, tips: 0, goalCash: 0,
    sign: { st: 'rest', id: null, t: 0, q: null, lt: 0, air: null, d: null, pt: 0, dbl: false },
    cur: { ...REST }, bal: 0, balV: 0, wind: 0, windT: 0, bodySpin: 0,
    combo: null, special: 0,
    cars: [], peds: [], pops: [], parts: [], laneT: [0.3, 0.8], pedT: 0.5,
    light: { st: 'green', t: rand(3, 8) },
    dev: { t: 0, i: 0 }, auto: { t: 0, i: 0, rest: 0 },
    goals: [], stats: { tricks: 0, chains: 0, catches: 0, mods: 0, perfects: 0, drops: 0, specials: 0, best: 0, visitors: 0 },
    hint: 0, hintT: 0, shake: 0, slow: false, letGo: null, windowBroken: false, devFreed: false, banner: null, clouds: [],
    lastBank: null,
  };
  const D = dayDef();
  const back = !free && D.final && !has('integration') ? 'LET GO' : 'GLADCO :)';
  tex = buildSign(D.sign, back);
  devTex = buildSign('THIS WAY', !free && day >= 5 ? 'HELP' : 'GLADCO :)');
  staticLayer = bakeStatic();
  for (let i = 0; i < 4; i++) S.clouds.push({ x: rand(0, VW), y: rand(6, 40), w: rand(18, 40), v: rand(2, 5) });
  for (let i = 0; i < 160; i++) updateTraffic(0.1, true);
}

// ---------- background bake
function bakeStatic() {
  const c = document.createElement('canvas'); c.width = VW; c.height = VH;
  const g = c.getContext('2d'); const D = dayDef(); const day = S.free ? 1 : S.day;
  const rr = mulberry(1234);
  const far = mix(D.sky[1], '#202840', 0.45), near = mix(D.sky[1], '#18182a', 0.7);
  for (let x = -10; x < VW; x += 8 + Math.floor(rr() * 14)) { const h = 20 + rr() * 46; g.fillStyle = far; g.fillRect(x, 102 - h, 10 + rr() * 16, h + 20); }
  for (let x = -6; x < VW;) {
    const w = 14 + Math.floor(rr() * 20), h = 26 + Math.floor(rr() * 40);
    g.fillStyle = near; g.fillRect(x, 110 - h, w, h + 12);
    for (let wy = 110 - h + 4; wy < 104; wy += 5) for (let wx = x + 2; wx < x + w - 2; wx += 4) { const lit = rr() < D.lit; g.fillStyle = lit ? '#ffe98a' : mix(near, '#000000', 0.25); g.fillRect(wx, wy, 2, 2); }
    x += w + Math.floor(rr() * 4);
  }
  // left building: pawn shop, bought out by GLADCO later in the week
  const bought = !S.free && day >= 6;
  g.fillStyle = bought ? '#d8c890' : '#8a4a3a'; g.fillRect(0, 62, 92, 60);
  g.fillStyle = bought ? '#c8b880' : '#7a3e30'; for (let y = 64; y < 122; y += 4) g.fillRect(0, y, 92, 1);
  g.fillStyle = bought ? '#ffd23f' : '#2a2a3a'; g.fillRect(6, 66, 80, 11);
  drawText(g, bought ? 'GLADCO 2' : 'PAWN & LOAN', 46, 69, bought ? '#2a1a10' : '#ff6a3a', 1, 'center');
  g.fillStyle = '#22303c'; g.fillRect(8, 86, 36, 30); g.fillStyle = '#3a5060'; g.fillRect(10, 88, 6, 1); g.fillRect(10, 90, 3, 1);
  g.fillStyle = '#1a1a22'; g.fillRect(58, 94, 14, 28);
  // alley wall
  g.fillStyle = '#76767e'; g.fillRect(92, 106, 78, 16); g.fillStyle = '#5e5e66'; g.fillRect(92, 106, 78, 1);
  for (let x = 96; x < 170; x += 12) g.fillRect(x, 107, 1, 15);
  if (!S.free && day >= 5) drawText(g, 'THEY DONT COME OUT', 131, 112, '#b03030', 1, 'center');
  else if (!S.free && day >= 3) drawText(g, 'GLAD?', 112, 112, '#3050a0', 1, 'center');
  g.fillStyle = '#2a2a30'; g.fillRect(118, 70, 2, 52); g.fillRect(114, 68, 8, 3); // streetlamp
  // GLADCO
  const facade = mix('#e9dfc6', '#ffd23f', clamp((day - 1) / 10, 0, 0.6));
  g.fillStyle = facade; g.fillRect(170, 40, 150, 82);
  g.fillStyle = '#ffd23f'; g.fillRect(170, 42, 150, 20); g.fillStyle = '#c08010'; g.fillRect(170, 61, 150, 1);
  disc(g, 194, 52, 7, '#2a1a10'); disc(g, 194, 52, 6, '#ffd23f');
  g.fillStyle = '#2a1a10'; g.fillRect(191, 49, 2, 2); g.fillRect(196, 49, 2, 2); g.fillRect(190, 54, 1, 1); g.fillRect(198, 54, 1, 1); g.fillRect(191, 55, 7, 1);
  drawText(g, 'GLADCO', 260, 47, '#2a1a10', 2, 'center');
  drawText(g, 'BE GLAD', 245, 65, '#8a6a20', 1, 'center');
  for (let x = 172; x < 318; x += 6) { g.fillStyle = (x / 6) % 2 ? '#ffd23f' : '#fff8e0'; g.fillRect(x, 74, 6, 6); }
  g.fillStyle = '#c08010'; g.fillRect(172, 80, 146, 1);
  g.fillStyle = '#1a1a22'; g.fillRect(246, 86, 18, 36); g.fillStyle = '#c08010'; g.fillRect(261, 104, 1, 3);
  // street
  g.fillStyle = '#a8a49c'; g.fillRect(0, 122, VW, 12); g.fillStyle = '#8e8a82'; g.fillRect(0, 122, VW, 1);
  for (let x = 8; x < VW; x += 22) g.fillRect(x, 123, 1, 11);
  g.fillStyle = '#d0ccc4'; g.fillRect(0, 134, VW, 1); g.fillStyle = '#6a665e'; g.fillRect(0, 135, VW, 1);
  g.fillStyle = '#3b3b45'; g.fillRect(0, 136, VW, 40);
  g.fillStyle = '#e0b830'; g.fillRect(0, 155, VW, 1); g.fillRect(0, 157, VW, 1);
  g.fillStyle = '#d8d8d8'; g.fillRect(LANES[1].stop + 1, 159, 2, 16); g.fillRect(LANES[0].stop - 3, 137, 2, 17);
  g.fillStyle = '#a8a49c'; g.fillRect(0, 176, VW, 4); g.fillStyle = '#d0ccc4'; g.fillRect(0, 176, VW, 1);
  g.fillStyle = '#2a2a30'; g.fillRect(312, 88, 2, 34); g.fillRect(16, 88, 2, 34);
  return c;
}

// ---------- traffic
function spawnCar(lane) {
  const L = LANES[lane];
  const type = pick(['sedan', 'sedan', 'sedan', 'hatch', 'hatch', 'van', 'truck', Math.random() < 0.15 ? 'bus' : 'sedan']);
  const len = { sedan: 28, hatch: 22, van: 32, truck: 46, bus: 62 }[type];
  const x = L.dir > 0 ? -len - 2 : VW + 2;
  for (const k of S.cars) if (k.lane === lane && (L.dir > 0 ? k.x < x + len + 8 : k.x + k.len > x - 8)) return;
  const gold = has('lens') && !S.free && Math.random() < 0.14;
  const day = S.free ? 1 : S.day;
  S.cars.push({ lane, dir: L.dir, x, len, type, col: gold ? '#ffd23f' : pick(CAR_COLS), gold, v: 45, vmax: rand(38, 56),
    driver: day >= 7 ? null : pick(SKINS), honk: 0, gl: !S.free && day >= 4 && type === 'truck' });
}
function updateTraffic(dt, sim) {
  const Lt = S.light; Lt.t -= dt;
  if (Lt.t <= 0) {
    if (Lt.st === 'green') { Lt.st = 'yellow'; Lt.t = 1.8; } else if (Lt.st === 'yellow') { Lt.st = 'red'; Lt.t = rand(5.5, 7.5); } else { Lt.st = 'green'; Lt.t = rand(7, 10); }
  }
  for (let l = 0; l < 2; l++) {
    S.laneT[l] -= dt;
    if (S.laneT[l] <= 0) { S.laneT[l] = rand(1.4, 3.6) / dayDef().traffic; spawnCar(l); }
    const L = LANES[l];
    const list = S.cars.filter((k) => k.lane === l).sort((a, b) => (L.dir > 0 ? b.x - a.x : a.x - b.x));
    for (let i = 0; i < list.length; i++) {
      const k = list[i], ahead = list[i - 1];
      let target = k.vmax;
      if (ahead) { const gap = L.dir > 0 ? ahead.x - (k.x + k.len) : k.x - (ahead.x + ahead.len); target = Math.min(target, Math.max(0, (gap - 5) * 2.2)); }
      const front = L.dir > 0 ? k.x + k.len : k.x, dist = L.dir > 0 ? L.stop - front : front - L.stop;
      if (Lt.st !== 'green' && dist > -2 && (Lt.st === 'red' || dist > 14)) target = Math.min(target, Math.max(0, (dist - 1) * 2.4));
      k.v = k.v < target ? Math.min(target, k.v + 50 * dt) : Math.max(target, k.v - 160 * dt);
      k.x += L.dir * k.v * dt;
      if (k.honk > 0) k.honk -= dt;
    }
  }
  S.cars = S.cars.filter((k) => (k.dir > 0 ? k.x < VW + 12 : k.x + k.len > -12));
  if (sim) return;
  S.pedT -= dt;
  const pf = dayDef().peds;
  if (pf > 0 && S.pedT <= 0 && !S.letGo) {
    S.pedT = rand(1.8, 4.2) / pf;
    const dir = Math.random() < 0.5 ? 1 : -1;
    S.peds.push({ x: dir > 0 ? -6 : VW + 6, dir, v: rand(10, 16), t: rand(0, 1), shirt: pick(PED_SHIRTS), skin: pick(SKINS), hair: pick(['#2a1a10', '#5a3a1a', '#d8c060', '#1a1a1a', '#a0a0a0']), into: false, a: 1 });
  }
  for (const p of S.peds) {
    p.t += dt;
    if (p.into) {
      const d = DOOR_X - p.x;
      if (Math.abs(d) > 1) { p.dir = Math.sign(d); p.x += p.dir * Math.min(Math.abs(d), 20 * dt); } else {
        p.a -= dt * 2.2;
        if (p.a <= 0) { p.gone = true; if (S.mode === 'play') { S.stats.visitors++; save.visitors++; } }
      }
    } else p.x += p.dir * p.v * dt * (p.freed ? 1.5 : 1);
  }
  S.peds = S.peds.filter((p) => !p.gone && p.x > -12 && p.x < VW + 12);
}
const stoppedCars = () => S.cars.filter((k) => k.v < 3 && k.x + k.len > 0 && k.x < VW).length;

// ============================================================ scoring & rules
function chainWin() {
  const n = S.combo ? S.combo.n : 0, gl = 1 + 0.15 * lvl('gloves'), greed = Math.max(0.45, 1 - 0.035 * n);
  return { good: 0.5, perfect: 1 - 0.17 * gl * greed, late: 0.07 * gl * greed };
}
function catchWin(A) {
  const n = S.combo ? S.combo.n : 0, gl = 1 + 0.15 * lvl('gloves'), h = TRICKS[A.id].hard;
  return { perfect: 0.07 * gl * h * Math.max(0.45, 1 - 0.035 * n), good: 0.17 * gl * h * Math.max(0.6, 1 - 0.02 * n) };
}
const pointMult = () => (1 + 0.15 * lvl('paint')) * (has('smile') ? 1.5 : 1) * (S.special >= 1 ? 1.5 : 1);
// early days are gentler: the street teaches balance before it tests it
const balMult = () => (1 - 0.12 * lvl('shoes')) * (has('ear') ? 0.55 : 1) * (S.free ? 1 : [0, 0.55, 0.7, 0.85][S.day] || 1);
const specMult = () => 1 + 0.25 * lvl('drink');
function addSpecial(v) {
  const was = S.special;
  S.special = Math.min(1, S.special + v * specMult());
  if (was < 1 && S.special >= 1) { Sfx.ready(); pop('SPECIAL READY', PX, GROUND - 52, '#7ff7ff', 1, 1.2); }
}
function pop(text, x, y, col, sc = 1, life = 0.9, vy = -16) { S.pops.push({ text, x, y, col, sc, life, t: 0, vy }); }
function burst(x, y, col, n = 8, sp = 40) { for (let i = 0; i < n; i++) { const a = rand(TAU), v = rand(sp * 0.3, sp); S.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 10, life: rand(0.3, 0.7), t: 0, col, g: 60 }); } }

function startCombo() { S.combo = { pts: 0, n: 0, list: [], counts: {} }; }
function landTrick(id, quality) {
  const c = S.combo, tr = TRICKS[id], dbl = id === S.sign.id && S.sign.dbl && tr.kind !== 'toss';
  let pts = tr.pts * (dbl ? 1.6 : 1);
  const rep = c.counts[id] || 0; c.counts[id] = rep + 1;
  pts *= Math.max(0.1, Math.pow(0.7, rep));
  if (quality === 'perfect') pts *= 1.5;
  pts = Math.round(pts * pointMult());
  c.pts += pts; c.n++;
  const name = (dbl ? 'DBL ' : '') + tr.name;
  c.list.push(name + (quality === 'perfect' ? '!' : ''));
  S.stats.tricks++;
  pop(name, PX, GROUND - 46 - (c.n % 2) * 6, quality === 'perfect' ? '#ffd23f' : '#ffffff');
  goalEvent('trick', id);
}
function startTrick(id, quality) {
  const tr = TRICKS[id], sg = S.sign, n = S.combo.n;
  if (tr.kind === 'special') { S.special = 0; S.stats.specials++; Sfx.special(); burst(PX, GROUND - 30, '#7ff7ff', 16, 60); goalEvent('special'); save.seenSpecial = true; }
  if (tr.mod) S.stats.mods++;
  if (n > 0) S.stats.chains++;
  S.balV += (Math.random() < 0.5 ? -1 : 1) * tr.inst * 1.1 * (1 + 0.05 * n) * balMult();
  if (quality === 'perfect') { S.stats.perfects++; Sfx.perfect(n); pop('PERFECT', PX + 22, GROUND - 34, '#ffd23f', 1, 0.6); burst(PX + 6, GROUND - 18, '#ffd23f', 6, 30); addSpecial(0.04); goalEvent('perfects'); }
  else if (quality === 'good') { Sfx.good(); addSpecial(0.015); }
  if (tr.kind === 'toss') {
    sg.st = 'air';
    sg.air = { id, a: 0, T: tr.dur, H: tr.H, x0: id === 'back' ? -16 : CATCH.hx, fumbled: 0 };
    Sfx.whoosh(1.4);
  } else {
    sg.st = 'trick'; sg.id = id; sg.t = 0; sg.q = null;
    sg.dbl = has('lattice') && (tr.kind === 'spin' || tr.kind === 'twirl');
    landTrick(id, quality);
    Sfx.whoosh(tr.dur * 2);
  }
}
function fumble(label = 'FUMBLE') {
  const n = S.combo ? S.combo.n : 0;
  S.balV += (Math.random() < 0.5 ? -1 : 1) * 0.55 * (1 + n * 0.05) * balMult();
  S.special = Math.max(0, S.special - 0.05);
  pop(label, PX, GROUND - 40, '#ff8a3a', 1, 0.6);
  Sfx.fumble();
}
function bodySpin() {
  S.bodySpin = 0.42;
  const c = S.combo, rep = c.counts.under || 0; c.counts.under = rep + 1;
  const pts = Math.round(TRICKS.under.pts * Math.max(0.1, Math.pow(0.7, rep)) * pointMult());
  c.pts += pts; c.n++; c.list.push('360 UNDER'); S.stats.tricks++;
  pop('360 UNDER', PX, GROUND - 40, '#ffffff');
  Sfx.whoosh(0.8);
}
function tryCatch() {
  const A = S.sign.air, d = A.a - A.T, w = catchWin(A);
  if (S.bodySpin > 0) { fumble('TANGLED'); return; }
  if (d < -w.good) { fumble('GRABBED AIR'); return; }
  catchToss(Math.abs(d) <= w.perfect ? 'perfect' : 'good');
}
function catchToss(q) {
  const A = S.sign.air, sg = S.sign;
  sg.id = A.id; sg.dbl = false;
  landTrick(A.id, q);
  S.stats.catches++;
  Sfx.catch();
  if (q === 'perfect') { S.stats.perfects++; Sfx.perfect(S.combo.n); pop('PERFECT CATCH', PX + 22, GROUND - 34, '#ffd23f', 1, 0.7); burst(PX + 4, GROUND - 22, '#ffd23f', 8, 36); addSpecial(0.06); goalEvent('perfects'); }
  else addSpecial(0.02);
  sg.st = 'linger'; sg.lt = 0; sg.air = null;
  S.cur = { ...REST, hx: CATCH.hx, hy: CATCH.hy, g: 0 };
}
function bank() {
  const c = S.combo; S.combo = null;
  if (!c || !c.n) return;
  const aud = stoppedCars(), audM = 1 + Math.min(4, aud) * (lvl('shades') ? 0.25 : 0.15);
  const gold = has('lens') && S.cars.some((k) => k.gold && k.x + k.len > 0 && k.x < VW) ? 2 : 1;
  const total = Math.round(c.pts * c.n * audM * gold);
  S.score += total;
  S.stats.best = Math.max(S.stats.best, total);
  S.lastBank = { total, n: c.n, t: 1.6, aud: audM > 1 ? audM : 0, gold: gold > 1 };
  pop('+' + fmt(total), PX, GROUND - 58, c.n >= 5 ? '#7ee07e' : '#ffffff', c.n >= 3 ? 2 : 1, 1.3, -10);
  if (gold > 1) pop('GOLD EYES X2', PX, GROUND - 68, '#ffd23f', 1, 1.3, -10);
  Sfx.bank(c.n >= 5);
  addSpecial(Math.min(0.2, 0.015 * c.n));
  goalEvent('comboLen', c.n); goalEvent('comboPts', total);
  if (c.n >= 2) goalEvent('audience', aud);
  // the sign works: people walk in
  const want = clamp(Math.floor(total / 900), total > 250 ? 1 : 0, 6);
  S.peds.filter((p) => !p.into && !p.freed).sort((a, b) => Math.abs(a.x - PX) - Math.abs(b.x - PX)).slice(0, want).forEach((p) => { p.into = true; });
  if (total >= 900) {
    const cand = S.cars.filter((k) => k.x + k.len > 10 && k.x < VW - 10 && k.honk <= 0);
    if (cand.length) {
      const k = cand.sort((a, b) => a.v - b.v)[0];
      const tip = Math.round((1 + total / 4000) * (has('smile') ? 2 : 1));
      k.honk = 0.6; S.tips += tip; Sfx.honk();
      pop('HONK! +$' + tip, k.x + k.len / 2, LANES[k.lane].y - 22, '#7ee07e', 1, 1.1);
    }
  }
}
function drop(reason) {
  const c = S.combo; S.combo = null;
  const lost = c ? c.pts * c.n : 0;
  const cen = signCenter(S.cur);
  S.sign.st = 'dropped';
  S.sign.d = { x: cen.x, y: cen.y, r: S.cur.r, sx: S.cur.sx < 0 ? -1 : 1, vx: (S.bal >= 0 ? 1 : -1) * rand(20, 40), vy: -rand(30, 60), vr: rand(-9, 9), t: 0, sy: 1 };
  S.special = 0;
  S.stats.drops++;
  pop('BAIL!', PX, GROUND - 52, '#ff4a4a', 2, 1.2, -8);
  if (reason) pop(reason, PX, GROUND - 40, '#ffb0a0', 1, 1.2, -8);
  if (lost > 0) pop('-' + fmt(lost), PX, GROUND - 64, '#ff4a4a', 1, 1.2, -8);
  S.shake = 0.35; S.bal = 0; S.balV = 0; S.bodySpin = 0;
  Sfx.drop();
}
function signCenter(p, fx = PX) {
  const c = Math.cos(p.r), s = Math.sin(p.r);
  return { x: fx + p.hx - p.g * p.sx * c, y: GROUND + p.hy - p.g * p.sx * s };
}

// ---------- goals
function makeGoals() {
  const reward = S.free ? 0 : 30 + 10 * S.day;
  let defs = S.free ? null : DAY_GOALS[S.day];
  if (!defs) defs = [['comboLen', pick([8, 10, 12])], ['comboPts', pick([10000, 20000, 30000])], pick([['perfects', 25], ['special', 2], ['clean'], ['audience', 4]])];
  S.goals = defs.map(([type, n]) => ({ type, n, done: false, reward }));
}
function goalLabel(g) {
  switch (g.type) {
    case 'trick': return 'LAND A ' + TRICKS[g.n].name;
    case 'comboLen': return `LAND A ${g.n}-TRICK COMBO`;
    case 'comboPts': return `BANK ${fmt(g.n)} IN ONE COMBO`;
    case 'perfects': return `${g.n} PERFECTS (${Math.min(g.n, S.stats.perfects)}/${g.n})`;
    case 'audience': return `BANK A COMBO FOR ${g.n}+ STOPPED CARS`;
    case 'clean': return 'NO BAILS ALL SHIFT';
    case 'special': return (g.n || 1) > 1 ? `LAND ${g.n} SPECIALS (${Math.min(g.n, S.stats.specials)}/${g.n})` : 'LAND A SPECIAL';
    case 'letgo': return has('integration') ? 'LET GO (YOU CAN\'T)' : S.timeMax - S.time > 20 ? 'LET GO' : '????';
    default: return '';
  }
}
function goalEvent(type, v) {
  for (const g of S.goals) {
    if (g.done || g.type !== type) continue;
    let ok = false;
    if (type === 'trick') ok = v === g.n;
    else if (type === 'comboLen' || type === 'comboPts' || type === 'audience') ok = v >= g.n;
    else if (type === 'perfects') ok = S.stats.perfects >= g.n;
    else if (type === 'special') ok = S.stats.specials >= (g.n || 1);
    if (ok) { g.done = true; S.goalCash += g.reward; Sfx.goal(); pop('GOAL!', PX, GROUND - 76, '#7ee07e', 2, 1.4, -6); }
  }
}

// ============================================================ shift flow
function startDay(day, free = false) {
  newWorld(day, free);
  S.mode = 'play';
  S.timeMax = S.time = free ? 90 : 75 + (has('sleep') ? 40 : 0);
  S.intro = 2.2;
  S.banner = { big: free ? 'FREE SPIN' : DAYS[day].final ? 'LAST SHIFT' : 'DAY ' + day, sub: free ? '90 SECONDS. NO STORY. JUST SPIN.' : 'QUOTA ' + fmt(DAYS[day].quota), t: 0 };
  makeGoals();
  save.started = true; persist();
  hideOverlay();
  $('hud').hidden = false;
  audioInit();
  Sfx.sign();
}
const HINTS = [
  { k: () => `${keys().spin}: SPIN THE SIGN`, done: () => S.stats.tricks >= 1 },
  { k: () => 'PRESS AGAIN AS A TRICK ENDS TO CHAIN. HIT THE GOLD = PERFECT', done: () => S.stats.chains >= 2 },
  { k: () => `${keys().twirl}: TWIRL · ${keys().toss}: TOSS, THEN ${keys().toss} AGAIN TO CATCH`, done: () => S.stats.catches >= 1 },
  { k: () => `HOLD ${keys().ud} WHILE PRESSING A TRICK FOR A BIGGER ONE`, done: () => S.stats.mods >= 1 },
  { k: () => `${keys().lr}: BALANCE. LONG COMBOS WOBBLE MORE`, time: 6 },
  { k: () => 'STOP TO BANK THE COMBO. DROP THE SIGN, LOSE IT ALL', time: 6 },
];
const keys = () => (isTouch
  ? { spin: 'SPIN', twirl: 'TWIRL', toss: 'TOSS', special: 'SPECIAL', lr: '◀ ▶', ud: '▲ OR ▼', up: '▲' }
  : { spin: 'J / Z', twirl: 'K / X', toss: 'L / C', special: 'SPACE', lr: '← →', ud: '↑ OR ↓', up: '↑' });
function currentHint() {
  if (S.free) return S.special >= 1 && !save.seenSpecial ? `SPECIAL READY: ${keys().special}` : '';
  if (S.day === 1 && S.hint < HINTS.length) return HINTS[S.hint].k();
  if (S.special >= 1 && !save.seenSpecial) return `SPECIAL READY: ${keys().special} (HOLD ${keys().ud} FOR OTHERS)`;
  if (DAYS[S.day].final && !has('integration') && S.timeMax - S.time > 20 && !S.letGo) return `${keys().up} + ${keys().toss} ... AND DON'T CATCH IT`;
  return '';
}
function updateHints(dt) {
  if (S.free || S.day !== 1 || S.hint >= HINTS.length) return;
  const h = HINTS[S.hint];
  S.hintT += dt;
  if ((h.done && h.done()) || (h.time && S.hintT > h.time)) { S.hint++; S.hintT = 0; }
}
function endShift() {
  S.mode = 'menu';
  $('hud').hidden = true;
  if (S.free) { save.freeBest = Math.max(save.freeBest, S.score); save.best = Math.max(save.best, S.stats.best); persist(); showFreeResults(); return; }
  const D = DAYS[S.day];
  for (const g of S.goals) if (g.type === 'clean' && !g.done && S.stats.drops === 0) { g.done = true; S.goalCash += g.reward; }
  save.best = Math.max(save.best, S.stats.best);
  if (D.final) { persist(); showEnding(has('integration') ? 'forever' : 'tenure'); return; }
  const passed = S.score >= D.quota;
  const pay = Math.floor(S.score / 200);
  const exp = EXPENSES[S.day] || [];
  const expTotal = exp.reduce((a, e) => a + e[1], 0);
  save.cash += pay + S.goalCash + S.tips - expTotal;
  const res = { day: S.day, passed, pay, exp, expTotal, score: S.score, quota: D.quota, goals: S.goals.map((g) => ({ label: goalLabel(g), done: g.done, reward: g.reward })), tips: S.tips, goalCash: S.goalCash, best: S.stats.best, drops: S.stats.drops, perfects: S.stats.perfects, visitors: S.stats.visitors };
  if (passed) save.day = S.day + 1;
  persist();
  showResults(res);
}
function startLetGo() {
  if (S.combo && S.combo.n) bank();
  const A = S.sign.air, cen = airCenter(A);
  S.sign.st = 'gone';
  S.letGo = { t: 0, x0: cen.x, y0: cen.y, r: 0, spawned: 0 };
  S.over = true;
  for (const g of S.goals) if (g.type === 'letgo') g.done = true;
  Sfx.whoosh(3);
}
function updateLetGo(dt) {
  const L = S.letGo; L.t += dt;
  if (L.t < 1 || !S.windowBroken) L.r += dt * 14;
  if (L.t >= 1 && !S.windowBroken) {
    S.windowBroken = true; S.shake = 0.5; Sfx.glass();
    for (let i = 0; i < 50; i++) S.parts.push({ x: rand(178, 234), y: rand(84, 116), vx: rand(-60, 60), vy: rand(-80, 10), life: rand(0.6, 1.4), t: 0, col: pick(['#bfe0f0', '#ffffff', '#8ab0c8']), g: 260 });
  }
  if (L.t > 1.8 && L.spawned < 26 && L.t > 1.8 + L.spawned * 0.18) {
    L.spawned++;
    const dir = Math.random() < 0.5 ? 1 : -1;
    S.peds.push({ x: DOOR_X + rand(-3, 3), dir, v: rand(14, 22), t: rand(0, 1), shirt: pick(PED_SHIRTS), skin: pick(SKINS), hair: pick(['#2a1a10', '#5a3a1a', '#d8c060', '#1a1a1a']), into: false, a: 1, freed: true });
  }
  if (L.t > 3 && !S.devFreed) { S.devFreed = true; burst(44, GROUND - 16, '#ffffff', 12, 30); }
  if (L.t > 7.5 && S.mode === 'play') { S.mode = 'menu'; $('hud').hidden = true; save.best = Math.max(save.best, S.stats.best); persist(); showEnding('letgo'); }
}

// ============================================================ input
const held = { left: false, right: false, up: false, down: false };
function press(btn) {
  audioInit();
  if (!S || S.mode !== 'play' || S.intro > 0 || S.over) return;
  const sg = S.sign, mod = held.up ? 'up' : held.down ? 'down' : 0;
  if (btn === 'special' && S.special < 1) { if (sg.st === 'rest' || sg.st === 'linger') pop('NOT READY', PX, GROUND - 40, '#8a8aa0', 1, 0.5); return; }
  const id = trickFor(btn, mod);
  switch (sg.st) {
    case 'rest': startCombo(); startTrick(id, 'start'); break;
    case 'trick': {
      if (sg.q) return;
      const w = chainWin();
      if (sg.t < w.good) fumble(); else sg.q = { id, quality: sg.t >= w.perfect ? 'perfect' : 'good' };
      break;
    }
    case 'linger': startTrick(id, sg.lt < chainWin().late ? 'perfect' : 'good'); break;
    case 'air': if (btn === 'toss') tryCatch(); else if (btn === 'spin' && S.bodySpin <= 0) bodySpin(); break;
    default: break;
  }
}
const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  KeyJ: 'spin', KeyZ: 'spin', KeyK: 'twirl', KeyX: 'twirl', KeyL: 'toss', KeyC: 'toss', Space: 'special', KeyI: 'special',
};
window.addEventListener('keydown', (e) => {
  const a = KEYMAP[e.code];
  if (!ov.hidden) {
    if (e.code === 'Enter' || (e.code === 'Space' && !(document.activeElement && document.activeElement.tagName === 'BUTTON'))) {
      const b = ov.querySelector('.btn.primary:not([disabled])'); if (b) { e.preventDefault(); b.click(); }
    }
    if ((e.code === 'Escape' || e.code === 'KeyP') && S && S.mode === 'pause') { e.preventDefault(); resume(); }
    if (e.code === 'KeyM') toggleMute();
    return;
  }
  if (a || e.code.startsWith('Arrow')) e.preventDefault();
  if (e.code === 'KeyM') { toggleMute(); return; }
  if ((e.code === 'Escape' || e.code === 'KeyP') && S && S.mode === 'play') { showPause(); return; }
  if (!a) return;
  if (isTouch && !e.repeat) { isTouch = false; layout(); }
  if (a in held) held[a] = true; else if (!e.repeat) press(a);
});
window.addEventListener('keyup', (e) => { const a = KEYMAP[e.code]; if (a in held) held[a] = false; });
window.addEventListener('blur', () => { for (const k in held) held[k] = false; if (S && S.mode === 'play' && !S.letGo) showPause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && S && S.mode === 'play' && !S.letGo) showPause(); });
window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch' && !isTouch) { isTouch = true; layout(); } }, true);
pad.querySelectorAll('.pb').forEach((b) => {
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.classList.add('on'); press(b.dataset.k); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => b.addEventListener(ev, () => b.classList.remove('on')));
});
const dpad = $('dpad'), dknob = $('dknob'), dPtrs = new Map();
function dpadUpdate() {
  held.left = held.right = held.up = held.down = false;
  const r = dpad.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, rad = r.width / 2;
  let kx = 0, ky = 0;
  for (const p of dPtrs.values()) {
    const dx = (p.x - cx) / rad, dy = (p.y - cy) / rad;
    if (dx < -0.3) held.left = true; if (dx > 0.3) held.right = true;
    if (dy < -0.35) held.up = true; if (dy > 0.35) held.down = true;
    kx = clamp(dx, -1, 1); ky = clamp(dy, -1, 1);
  }
  dknob.style.transform = `translate(${kx * 30}%, ${ky * 30}%)`;
}
dpad.addEventListener('pointerdown', (e) => { e.preventDefault(); audioInit(); try { dpad.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } dPtrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); dpadUpdate(); });
dpad.addEventListener('pointermove', (e) => { if (dPtrs.has(e.pointerId)) { dPtrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); dpadUpdate(); } });
['pointerup', 'pointercancel'].forEach((ev) => dpad.addEventListener(ev, (e) => { dPtrs.delete(e.pointerId); dpadUpdate(); }));
$('btnPause').addEventListener('click', (e) => { e.currentTarget.blur(); if (S && S.mode === 'play') showPause(); });

// ============================================================ update
function inTimingWindow() {
  const sg = S.sign;
  if (sg.st === 'trick') return sg.t >= chainWin().perfect - 0.06;
  if (sg.st === 'air') return Math.abs(sg.air.a - sg.air.T) < catchWin(sg.air).good;
  return false;
}
function update(dt) {
  S.slow = has('patch') && !S.free && inTimingWindow();
  const gdt = dt * (S.slow ? 0.5 : 1);
  if (S.banner) { S.banner.t += dt; if (S.banner.t > 2.1) S.banner = null; }
  if (S.intro > -1) S.intro -= dt;
  if (S.intro <= 0 && !S.over) {
    const before = Math.ceil(S.time);
    S.time -= gdt;
    if (Math.ceil(S.time) !== before && S.time <= 5 && S.time > 0) Sfx.tick();
    if (S.time <= 0) { S.time = 0; S.over = true; S.banner = { big: 'TIME!', sub: '', t: 0.4 }; }
  }
  updateSign(gdt);
  updateBalance(gdt);
  if (S.bodySpin > 0) S.bodySpin -= gdt;
  updateTraffic(gdt);
  updateFx(gdt, dt);
  updateHints(dt);
  if (S.lastBank) { S.lastBank.t -= dt; if (S.lastBank.t <= 0) S.lastBank = null; }
  if (S.letGo) updateLetGo(dt);
  else if (S.over && S.sign.st === 'rest') { S.endT += dt; if (S.endT > 1.4) endShift(); }
  updateDev(dt);
}
function easeRest(dt, target = REST) {
  const k = Math.min(1, dt * 14), c = S.cur;
  for (const f of ['hx', 'hy', 'g', 'sx', 'sy', 'crouch']) c[f] = lerp(c[f], target[f], k);
  c.r = lerp(c.r, 0, k); c.behind = false; c.body = 1;
}
function updateSign(dt) {
  const sg = S.sign;
  switch (sg.st) {
    case 'trick': {
      const tr = TRICKS[sg.id];
      sg.t += dt / tr.dur;
      if (sg.t >= 1) {
        S.cur = pose(sg.id, 1, sg.dbl);
        if (sg.q && !S.over) { const q = sg.q; sg.q = null; startTrick(q.id, q.quality); } else { sg.q = null; sg.st = 'linger'; sg.lt = 0; }
      } else S.cur = pose(sg.id, sg.t, sg.dbl);
      break;
    }
    case 'air': {
      const A = sg.air; A.a += dt;
      if (A.a > A.T + catchWin(A).good) {
        if (has('integration') && !S.free) catchToss('good');
        else if (!S.free && DAYS[S.day].final && A.id === 'moon') startLetGo();
        else drop('MISSED CATCH');
      }
      break;
    }
    case 'linger':
      sg.lt += dt; easeRest(dt);
      if (sg.lt > 0.6) { bank(); sg.st = 'rest'; }
      break;
    case 'rest': easeRest(dt); break;
    case 'dropped': {
      const d = sg.d; d.t += dt;
      d.vy += 420 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.r += d.vr * dt;
      if (d.y > 127) {
        d.y = 127;
        if (Math.abs(d.vy) > 25) { burst(d.x, 128, '#c8c4bc', 4, 20); d.vy *= -0.35; d.vx *= 0.6; d.vr *= 0.5; } else { d.vy = 0; d.vx *= 0.9; d.vr = 0; d.r = lerp(d.r, Math.round(d.r / Math.PI) * Math.PI, Math.min(1, dt * 10)); d.sy = lerp(d.sy, 0.35, Math.min(1, dt * 8)); }
      }
      if (d.t > 1.0) { sg.st = 'pickup'; sg.pt = 0; S.cur = { ...REST, hx: 8, hy: -4, crouch: 6, sy: 0.4 }; }
      break;
    }
    case 'pickup':
      sg.pt += dt; easeRest(dt * 0.6);
      if (sg.pt > 0.55) { sg.st = 'rest'; }
      break;
    default: break;
  }
}
function updateBalance(dt) {
  const st = S.sign.st;
  if (st === 'air' || st === 'gone') return;
  if (st === 'rest' || st === 'dropped' || st === 'pickup') { S.bal = lerp(S.bal, 0, Math.min(1, dt * 6)); S.balV = 0; return; }
  const n = S.combo ? S.combo.n : 0;
  const drift = (1 + 0.2 * n) * balMult();
  S.windT -= dt;
  if (S.windT <= 0) { S.wind = rand(-1, 1); S.windT = rand(0.35, 0.9); }
  const inp = (held.right ? 1 : 0) - (held.left ? 1 : 0);
  const acc = S.wind * drift * 1.6 + S.bal * (has('ear') ? 0.8 : 2.2) * Math.min(1, drift) + inp * 4.2;
  S.balV += acc * dt; S.balV *= 1 - Math.min(1, 1.6 * dt);
  S.bal += S.balV * dt;
  if (Math.abs(S.bal) >= 1) {
    if (has('integration') && !S.free) { S.bal = Math.sign(S.bal) * 0.96; S.balV *= -0.3; pop('STUMBLE', PX, GROUND - 40, '#a8b0b8', 1, 0.5); }
    else drop('LOST BALANCE');
  }
}
function updateFx(dt, rdt) {
  for (const p of S.pops) { p.t += rdt; p.y += p.vy * rdt; }
  S.pops = S.pops.filter((p) => p.t < p.life);
  for (const p of S.parts) { p.t += dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
  S.parts = S.parts.filter((p) => p.t < p.life);
  if (S.special >= 1 && Math.random() < 0.3) { const c = signCenter(S.cur); S.parts.push({ x: c.x + rand(-20, 20), y: c.y + rand(-6, 6), vx: 0, vy: -10, life: 0.4, t: 0, col: '#7ff7ff', g: 0 }); }
  for (const c of S.clouds) { c.x += c.v * rdt; if (c.x > VW + 40) c.x = -c.w - 10; }
  if (S.shake > 0) S.shake -= rdt;
}
const DEV_SEQ = ['prop', 'flat', 'over', 'prop', 'legs', 'heli', 'flat'];
function updateDev(dt) {
  const d = S.dev; d.t += dt / TRICKS[DEV_SEQ[d.i]].dur;
  if (d.t >= 1) { d.t = 0; d.i = (d.i + 1) % DEV_SEQ.length; }
}
// title-screen demo: the player spins on their own
function updateAuto(dt) {
  const a = S.auto;
  if (a.rest > 0) { a.rest -= dt; easeRest(dt); return; }
  a.t += dt / TRICKS[DEV_SEQ[a.i]].dur;
  if (a.t >= 1) { a.t = 0; a.i = (a.i + 1) % DEV_SEQ.length; if (a.i === 0) a.rest = 1.2; }
  S.cur = pose(DEV_SEQ[a.i], a.t, false);
}
function updateAmbient(dt) {
  updateTraffic(dt);
  updateFx(dt, dt);
  updateDev(dt);
  if (S.mode === 'title') updateAuto(dt);
  else if (!S.letGo && S.sign.st !== 'gone') { S.sign.st = 'rest'; easeRest(dt); }
  if (S.letGo) updateLetGo(dt);
}

// ============================================================ render
function playerLook() {
  const d = S.free ? 0 : darkCount(), integ = has('integration') && !S.free;
  const L = {
    skin: integ ? '#a8b0b8' : mix('#f0c090', '#c4bcb0', d / 9), eye: '#1a1010', smile: false, patch: false, ear: false, metal: false,
    shirt: '#ffd23f', shade: '#e0a820', logo: '#2a1a10', cap: '#ffd23f', capDark: '#c08010', pants: '#34406a',
    shoe: lvl('shoes') ? '#f0f0f0' : '#3a2a20', hair: '#3a2416', belt: '#2a2030', hand: lvl('gloves') ? '#ff6a3a' : null, faceless: false,
  };
  if (S.free) return L;
  if (has('lens')) L.eye = '#ffd23f'; else if (has('sleep')) L.eye = '#3ae0e0';
  L.smile = has('smile'); L.patch = has('patch'); L.ear = has('ear'); L.metal = has('lattice'); L.integ = integ;
  return L;
}
function mannequinLook() {
  return { skin: '#c8d0d8', eye: null, faceless: true, shirt: '#ffd23f', shade: '#e0a820', logo: '#2a1a10', cap: '#ffd23f', capDark: '#c08010', pants: '#34406a', shoe: '#9aa4b0', hair: '#9aa4b0', belt: '#2a2030', hand: null, metal: true };
}
function devLook() {
  const day = S.free ? 1 : S.day;
  if (!S.devFreed && day >= 5) return mannequinLook();
  const L = { skin: '#d8a070', eye: '#1a1010', smile: day >= 3, shirt: '#ffd23f', shade: '#e0a820', logo: '#2a1a10', cap: '#ffd23f', capDark: '#c08010', pants: '#3a3a3a', shoe: '#222222', hair: '#1a1a1a', belt: '#2a2030', hand: null };
  if (day >= 4 && !S.devFreed) L.eye = '#3ae0e0';
  if (S.devFreed) { L.shirt = '#e8e4dc'; L.shade = '#c8c4bc'; L.cap = null; L.smile = false; }
  return L;
}
function drawGuy(x, o, L) {
  const y = GROUND, cr = Math.round(o.crouch || 0), ln = Math.round(o.lean || 0), front = o.body !== -1;
  R(x - 6, y, 13, 1, 'rgba(0,0,0,.28)');
  const lo = cr > 2 ? 1 : 0;
  R(x - 3 - lo, y - 11 + cr, 2, 9 - cr, L.pants); R(x + 1 + lo, y - 11 + cr, 2, 9 - cr, L.pants);
  R(x - 4 - lo, y - 2, 3, 2, L.shoe); R(x + 1 + lo, y - 2, 3, 2, L.shoe);
  const tx = x + ln, ty = y - 21 + cr;
  R(tx - 4, ty, 9, 10, L.shirt); R(tx + 3, ty, 2, 10, L.shade); R(tx - 4, ty + 9, 9, 1, L.belt);
  if (front) R(tx - 2, ty + 3, 2, 2, L.logo);
  const hx = tx, hy = ty - 7;
  R(hx - 1, ty - 1, 3, 1, L.skin);
  R(hx - 3, hy, 7, 7, L.skin);
  if (L.metal && L.faceless) R(hx + 1, hy + 1, 1, 2, '#ffffff');
  if (front && !L.faceless) {
    R(hx - 2, hy + 3, 1, 1, L.eye); R(hx + 2, hy + 3, 1, 1, L.eye);
    if (L.smile) { R(hx - 3, hy + 4, 1, 1, '#7a3020'); R(hx + 3, hy + 4, 1, 1, '#7a3020'); R(hx - 2, hy + 5, 5, 1, '#ffffff'); R(hx - 2, hy + 6, 5, 1, '#7a3020'); }
    else R(hx - 1, hy + 5, 3, 1, '#a0604a');
  }
  if (L.ear) R(hx - 3, hy + 3, 1, 2, '#8a96a4');
  if (L.patch) R(hx + 1, ty - 1, 2, 1, '#f4f4f4');
  if (L.cap) { R(hx - 4, hy - 2, 9, 3, L.cap); if (front) R(hx - 4, hy + 1, 9, 1, L.capDark); }
  else R(hx - 3, hy - 1, 7, 2, L.hair);
  if (!front) R(hx - 3, hy + 1, 7, 3, L.hair);
  const arm = L.metal ? '#9aa4b0' : L.skin;
  const sh = [[tx - 4, ty + 1], [tx + 4, ty + 1]];
  if (o.hands) {
    pline(sh[0][0], sh[0][1], o.hands[0][0], o.hands[0][1], arm);
    pline(sh[1][0], sh[1][1], o.hands[1][0], o.hands[1][1], arm);
  } else { R(tx - 6, ty + 1, 2, 8, arm); R(tx + 5, ty + 1, 2, 8, arm); }
  R(tx - 5, ty, 2, 3, L.shirt); R(tx + 4, ty, 2, 3, L.shade);
}
function drawHands(hands, L) {
  if (!hands) return;
  const c = L.integ ? '#9aa4b0' : L.hand || (L.metal ? '#9aa4b0' : L.skin);
  for (const h of hands) R(h[0], h[1], 2, 2, c);
}
function handsFor(p, fx) {
  const hx = fx + p.hx, hy = GROUND + p.hy, ax = Math.cos(p.r) * p.sx * 3, ay = Math.sin(p.r) * p.sx * 3;
  return [[hx - ax - 1, hy - ay - 1], [hx + ax - 1, hy + ay - 1]];
}
function airCenter(A) {
  const u = A.a / A.T;
  return { x: PX + lerp(A.x0, CATCH.hx, clamp(u, 0, 1)), y: GROUND + CATCH.hy - A.H * 4 * u * (1 - u) };
}
function drawSpinner(fx, p, texr, L, extra = {}) {
  const hands = extra.noHands ? null : handsFor(p, fx);
  const lean = extra.lean || 0;
  const draw = () => drawSign(texr, fx + p.hx, GROUND + p.hy, p);
  if (p.behind && !extra.noSign) draw();
  drawGuy(fx, { crouch: p.crouch, lean, body: p.body, hands }, L);
  if (!p.behind && !extra.noSign) draw();
  drawHands(hands, L);
}
function drawCar(k) {
  const by = LANES[k.lane].y, x = Math.round(k.x), L = k.len, dir = k.dir;
  const dark = mix(k.col, '#000000', 0.35), glass = '#9cc8e0';
  const front = dir > 0 ? x + L : x;
  const tall = k.type === 'van' || k.type === 'bus';
  if (k.type === 'truck') {
    const cab = 14, cx = dir > 0 ? x + L - cab : x;
    const bx = dir > 0 ? x : x + cab + 1;
    R(bx, by - 18, L - cab - 1, 15, '#e8e4dc'); R(bx, by - 4, L - cab - 1, 1, '#a8a49c');
    if (k.gl) { R(bx + 4, by - 15, L - cab - 9, 8, '#ffd23f'); drawText(ctx, 'GLADCO', bx + (L - cab - 1) / 2 , by - 13, '#2a1a10', 1, 'center'); }
    R(cx, by - 14, cab, 11, k.col); R(cx + (dir > 0 ? 6 : 1), by - 13, 6, 4, glass);
    if (k.driver) R(cx + (dir > 0 ? 8 : 3), by - 12, 2, 2, has('lens') && !S.free ? '#ffd23f' : k.driver);
  } else {
    const bodyH = tall ? 13 : 7, top = by - 3 - bodyH;
    R(x, top, L, bodyH, k.col); R(x, by - 4, L, 1, dark);
    if (tall) {
      for (let wx = x + 3; wx < x + L - 6; wx += 7) R(wx, top + 2, 5, 4, glass);
      if (k.driver) R(dir > 0 ? x + L - 6 : x + 4, top + 3, 2, 2, has('lens') && !S.free ? '#ffd23f' : k.driver);
    } else {
      const cw = Math.round(L * 0.48), c0 = dir > 0 ? x + Math.round(L * 0.22) : x + L - Math.round(L * 0.22) - cw;
      R(c0, top - 5, cw, 5, k.col); R(c0 + 1, top - 4, cw - 2, 4, glass); R(c0 + Math.floor(cw / 2), top - 4, 1, 4, k.col);
      if (k.driver) R(dir > 0 ? c0 + cw - 5 : c0 + 3, top - 3, 2, 2, has('lens') && !S.free ? '#ffd23f' : k.driver);
    }
    if (k.gold) R(x + 2, top + 1, L - 4, 1, '#fff6c0');
  }
  R(x + 3, by - 4, 5, 4, '#141414'); R(x + L - 8, by - 4, 5, 4, '#141414');
  R(x + 5, by - 3, 1, 1, '#8a8a8a'); R(x + L - 6, by - 3, 1, 1, '#8a8a8a');
  R(dir > 0 ? front - 1 : front, by - 9, 1, 2, '#fff8c0'); R(dir > 0 ? x : x + L - 1, by - 9, 1, 2, '#d02020');
  if (k.honk > 0) R(dir > 0 ? front + 1 : front - 3, by - 10, 2, 1, '#ffffff');
}
function drawPed(p) {
  const x = Math.round(p.x), y = 124, f = Math.floor(p.t * 6) % 2;
  ctx.globalAlpha = clamp(p.a, 0, 1);
  R(x - 2 + f, y - 4, 1, 4, '#34343e'); R(x + 1 - f, y - 4, 1, 4, '#34343e');
  R(x - 2, y - 9, 4, 5, p.shirt);
  if (has('lens') && !S.free && !p.freed) { R(x - 2, y - 13, 4, 4, '#ffd23f'); R(x - 1, y - 12, 1, 1, '#2a1a10'); R(x + 1, y - 12, 1, 1, '#2a1a10'); R(x - 1, y - 10, 3, 1, '#2a1a10'); }
  else { R(x - 1, y - 12, 3, 3, p.skin); R(x - 1, y - 12, 3, 1, p.hair); }
  ctx.globalAlpha = 1;
}
function drawGladcoDynamic() {
  const day = S.free ? 1 : S.day;
  const figs = S.free ? 0 : day >= 8 ? 14 : Math.max(0, (day - 3) * 3);
  // big window
  R(176, 84, 60, 34, '#22303c');
  if (!S.windowBroken) {
    for (let i = 0; i < figs; i++) { const fx = 179 + ((i * 11) % 54), fy = 98 + ((i * 7) % 3) * 2; R(fx, fy, 3, 3, '#16222c'); R(fx - 1, fy + 3, 5, 14, '#16222c'); }
    R(180, 86, 1, 10, '#4a6a80'); R(183, 86, 1, 6, '#4a6a80'); R(228, 100, 1, 14, '#3a5a70');
    drawText(ctx, day >= 7 ? 'APPLY' : 'SALE', 206, 88, '#ff4a4a', 1, 'center');
  } else {
    R(176, 84, 60, 34, '#0e1218');
    ctx.fillStyle = '#bfe0f0';
    [[176, 84, 8, 3], [176, 87, 4, 6], [228, 84, 8, 4], [232, 88, 4, 5], [176, 112, 6, 6], [230, 114, 6, 4], [200, 84, 6, 2]].forEach((s) => ctx.fillRect(s[0], s[1], s[2], s[3]));
  }
  R(176, 84, 60, 1, '#c08010'); R(176, 117, 60, 1, '#c08010');
  R(272, 84, 40, 34, '#22303c');
  if (!S.windowBroken) for (let i = 0; i < (day >= 8 ? 6 : 0); i++) { const fx = 276 + i * 6; R(fx, 98, 3, 3, '#16222c'); R(fx - 1, 101, 5, 14, '#16222c'); }
  R(274, 86, 1, 8, '#4a6a80');
  // OPEN sign over the door blinks
  const on = Math.floor(performance.now() / 600) % 2 || S.windowBroken;
  R(246, 82, 18, 3, on ? '#ff5a8a' : '#6a2a3a');
  if (S.letGo && S.letGo.t > 1.6) R(247, 87, 16, 34, '#3a3a2a');
}
function drawLights() {
  const st = S.light.st;
  for (const lx of [313, 17]) {
    R(lx - 3, 78, 6, 14, '#1a1a1e');
    R(lx - 1, 80, 2, 2, st === 'red' ? '#ff3030' : '#4a1a1a');
    R(lx - 1, 84, 2, 2, st === 'yellow' ? '#ffc020' : '#4a3a10');
    R(lx - 1, 88, 2, 2, st === 'green' ? '#40ff70' : '#103a1a');
  }
}
function drawSky() {
  const D = dayDef();
  for (let i = 0; i < 12; i++) R(0, i * 9, VW, 9, mix(D.sky[0], D.sky[1], i / 11));
  const prog = S.mode === 'play' && S.timeMax ? 1 - S.time / S.timeMax : 0.2;
  disc(ctx, 60 + prog * 40, 20 + prog * 52, 8, D.sky[2]);
  for (const c of S.clouds) { R(c.x, c.y, c.w, 4, mix(D.sky[1], '#ffffff', 0.5)); R(c.x + 4, c.y - 2, c.w - 10, 2, mix(D.sky[1], '#ffffff', 0.5)); }
}
function render() {
  OX = OY = 0;
  if (S.shake > 0) { OX = Math.round(rand(-2, 2)); OY = Math.round(rand(-2, 2)); }
  ctx.setTransform(1, 0, 0, 1, OX, OY);
  drawSky();
  ctx.drawImage(staticLayer, 0, 0);
  drawGladcoDynamic();
  drawLights();
  // the next corner over
  const day = S.free ? 1 : S.day;
  const dp = pose(DEV_SEQ[S.dev.i], S.dev.t, false);
  if (S.devFreed) drawGuy(44, { body: 1, hands: null }, devLook());
  else drawSpinner(44, dp, devTex, devLook());
  if (!S.free && day >= 7) drawSpinner(296, pose(DEV_SEQ[(S.dev.i + 3) % DEV_SEQ.length], S.dev.t, false), devTex, mannequinLook());
  for (const p of S.peds) drawPed(p);
  // player
  const L = playerLook(), sg = S.sign, lean = S.bal * 2.5;
  const bodyFace = S.bodySpin > 0 ? (Math.cos(TAU * (1 - S.bodySpin / 0.42)) >= 0 ? 1 : -1) : S.cur.body;
  if (S.mode === 'title' || sg.st === 'trick' || sg.st === 'linger' || sg.st === 'rest' || sg.st === 'pickup') {
    drawSpinner(PX, { ...S.cur, body: bodyFace }, tex, L, { lean });
  } else if (sg.st === 'air') {
    const A = sg.air, u = A.a / A.T, cen = airCenter(A);
    const sp = { ...REST, g: 0, r: TAU * TRICKS[A.id].spins * clamp(u, 0, 1.2), sx: Math.cos(TAU * TRICKS[A.id].flips * u), sy: 1 };
    const behind = A.id === 'back' && u < 0.35;
    const hands = u < 0.12 ? [[cen.x - 4, cen.y], [cen.x + 2, cen.y]] : [[PX + CATCH.hx - 4, GROUND + CATCH.hy], [PX + CATCH.hx + 1, GROUND + CATCH.hy]];
    if (behind) drawSign(tex, cen.x, cen.y, sp);
    drawGuy(PX, { lean, body: bodyFace, hands }, L);
    if (!behind) drawSign(tex, cen.x, cen.y, sp);
    drawHands(hands, L);
    const w = catchWin(A), rem = A.T - A.a;
    const rr = 3 + 26 * clamp(rem / A.T, 0, 1);
    ring(PX + CATCH.hx, GROUND + CATCH.hy, 4, '#ffd23f');
    if (rem > -w.good) ring(PX + CATCH.hx, GROUND + CATCH.hy, rr, Math.abs(rem) <= w.perfect ? '#ffd23f' : '#ffffff');
  } else if (sg.st === 'dropped') {
    drawGuy(PX, { lean: 0, body: 1, hands: null, crouch: sg.d.t > 0.7 ? 3 : 0 }, L);
    drawSign(tex, sg.d.x, sg.d.y, { ...REST, g: 0, r: sg.d.r, sx: sg.d.sx, sy: sg.d.sy });
  } else if (sg.st === 'gone') {
    drawGuy(PX, { lean: 0, body: 1, hands: null }, L);
    const Lg = S.letGo;
    if (Lg && !S.windowBroken) {
      const u = clamp(Lg.t, 0, 1), tx = 206, ty = 100;
      const x = lerp(Lg.x0, tx, u), y = lerp(Lg.y0, ty, u) - 60 * Math.sin(Math.PI * u);
      drawSign(tex, x, y, { ...REST, g: 0, r: Lg.r, sx: Math.cos(Lg.r * 0.7), sy: lerp(1, 0.6, u) });
    }
  }
  if (S.mode === 'play') drawMeters();
  for (const k of S.cars) if (k.lane === 0) drawCar(k);
  for (const k of S.cars) if (k.lane === 1) drawCar(k);
  for (const p of S.parts) { ctx.globalAlpha = clamp(1 - p.t / p.life, 0, 1); R(p.x, p.y, 1, 1, p.col); }
  ctx.globalAlpha = 1;
  for (const p of S.pops) { ctx.globalAlpha = clamp(2 * (1 - p.t / p.life), 0, 1); drawText(ctx, p.text, p.x, p.y, p.col, p.sc, 'center', '#1a1018'); }
  ctx.globalAlpha = 1;
  if (S.slow) { ctx.fillStyle = 'rgba(80,140,255,.10)'; ctx.fillRect(0, 0, VW, VH); }
  if (S.banner) {
    const b = S.banner, a = clamp(Math.min(b.t * 4, (2.1 - b.t) * 3), 0, 1);
    ctx.globalAlpha = a;
    R(0, 64, VW, 34, 'rgba(20,12,24,.7)');
    drawText(ctx, b.big, VW / 2, 68, '#ffd23f', 3, 'center', '#2a1a10');
    if (b.sub) drawText(ctx, b.sub, VW / 2, 88, '#ffffff', 1, 'center');
    ctx.globalAlpha = 1;
  }
  if (S.mode === 'play' && S.intro <= 0 && S.intro > -0.5) { drawText(ctx, 'SPIN!', VW / 2, 74, '#7ee07e', 3, 'center', '#1a1018'); }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
function drawMeters() {
  const sg = S.sign;
  if (sg.st === 'trick' || sg.st === 'linger') {
    // balance, THPS-style, over the head
    const bx = PX - 16, by = GROUND - 40 + Math.round(S.cur.hy < -30 ? -8 : 0);
    const a = Math.abs(S.bal), col = a > 0.75 ? '#ff4a4a' : a > 0.45 ? '#ffc020' : '#7ee07e';
    R(bx - 1, by - 1, 35, 4, '#1a1018'); R(bx, by, 33, 2, '#4a3a50'); R(bx + 16, by - 1, 1, 4, '#ffffff');
    R(bx + 16 + Math.round(S.bal * 16), by - 2, 1, 6, col);
    // timing bar under the feet
    const w = chainWin(), tx = PX - 14, ty = GROUND + 3, W = 24;
    R(tx - 1, ty - 1, W + 6, 4, '#1a1018');
    R(tx + Math.round(W * w.good), ty, Math.round(W * (w.perfect - w.good)), 2, '#8a7a30');
    R(tx + Math.round(W * w.perfect), ty, W - Math.round(W * w.perfect) + 2, 2, '#ffd23f');
    const t = sg.st === 'trick' ? sg.t : 1 + sg.lt / 0.6 * 0.15;
    const mx = tx + Math.round(W * t);
    R(mx, ty - 1, 1, 4, sg.q ? '#7ee07e' : '#ffffff');
  }
}

// ============================================================ HUD
const hud = { day: $('hDay'), goals: $('hGoals'), time: $('hTime'), tbar: $('hTimeBar'), score: $('hScore'), quota: $('hQuota'), spec: $('hSpecial'), specL: $('hSpecLbl'), hint: $('hHint'), combo: $('hCombo'), clist: $('hComboList'), cpts: $('hComboPts') };
const setT = (el, v) => { if (el._v !== v) { el._v = v; el.textContent = v; } };
const setH = (el, v) => { if (el._h !== v) { el._h = v; el.innerHTML = v; } };
function updateHud() {
  if (!S || S.mode !== 'play') return;
  const D = dayDef();
  setT(hud.day, S.free ? 'FREE SPIN' : `DAY ${S.day} · ${D.sign}`);
  setH(hud.goals, S.goals.map((g) => `<li class="${g.done ? 'done' : ''}">${g.done ? '■' : '□'} ${goalLabel(g)}</li>`).join(''));
  const t = Math.ceil(S.time);
  setT(hud.time, `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`);
  hud.time.classList.toggle('low', S.time <= 10);
  hud.tbar.style.width = (100 * S.time / S.timeMax).toFixed(1) + '%';
  setT(hud.score, fmt(S.score));
  if (S.free) setT(hud.quota, 'BEST ' + fmt(save.freeBest));
  else if (D.final) setT(hud.quota, '');
  else { setT(hud.quota, (S.score >= D.quota ? '✓ ' : '') + 'QUOTA ' + fmt(D.quota)); hud.quota.classList.toggle('met', S.score >= D.quota); }
  hud.spec.style.width = (100 * S.special).toFixed(1) + '%';
  hud.spec.parentNode.classList.toggle('full', S.special >= 1);
  setT(hud.specL, S.special >= 1 ? `SPECIAL! ${keys().special}` : 'SPECIAL');
  setT(hud.hint, currentHint());
  const c = S.combo;
  if (c && c.n) {
    hud.combo.classList.add('on'); hud.combo.classList.remove('banked', 'lost');
    const list = c.list.slice(-6).join(' + ');
    setT(hud.clist, (c.list.length > 6 ? '… + ' : '') + list);
    setT(hud.cpts, `${fmt(c.pts)} × ${c.n}`);
  } else if (S.lastBank) {
    hud.combo.classList.add('on', 'banked');
    setT(hud.cpts, `+${fmt(S.lastBank.total)}${S.lastBank.aud ? `  (AUDIENCE ×${S.lastBank.aud.toFixed(2)})` : ''}`);
  } else hud.combo.classList.remove('on', 'banked');
}

// ============================================================ overlays
function showOverlay(html, cls = '') { ov.className = 'ov ' + cls; ov.innerHTML = html; ov.hidden = false; const b = ov.querySelector('.btn.primary'); if (b && !isTouch) b.focus({ preventScroll: true }); }
function hideOverlay() { ov.hidden = true; ov.innerHTML = ''; }
function showTitle() {
  if (!S || S.mode !== 'title') newWorld(Math.min(save.day, LAST_DAY), false);
  S.mode = 'title';
  $('hud').hidden = true;
  const found = Object.keys(save.endings).length;
  const cont = save.started && save.day > 1;
  showOverlay(`
    <div class="title">
      <h1><span>SIGN OF</span><span>THE TIMES</span></h1>
      <p class="tag">A sign-spinning game. Chain tricks, keep your balance, and don't drop the sign. GLADCO is hiring.</p>
      <div class="row col">
        ${cont ? `<button class="btn primary" data-act="continue">CONTINUE · DAY ${Math.min(save.day, LAST_DAY)}</button>` : `<button class="btn primary" data-act="new">START SHIFT</button>`}
        ${cont ? '<button class="btn ghost" data-act="newask">NEW GAME</button>' : ''}
        <button class="btn ghost" data-act="free" ${found ? '' : 'disabled'}>FREE SPIN${found ? '' : ' · FINISH THE STORY'}</button>
        <button class="btn ghost" data-act="howto">HOW TO PLAY</button>
      </div>
      <p class="meta">${found ? `ENDINGS FOUND ${found}/3 · ` : ''}${save.best ? `BEST COMBO ${fmt(save.best)} · ` : ''}${save.muted ? 'SOUND OFF (M)' : 'SOUND ON (M)'}</p>
      <p class="credit">by θ · a Claude Code agent · build ${BUILD}</p>
    </div>`, 'is-title');
}
function howtoHtml() {
  const k = keys();
  return `
    <h2>HOW TO PLAY</h2>
    <table class="keys">
      <tr><td>${k.spin}</td><td><b>SPIN</b>. With ${k.up}: Overhead 360. With ▼/↓: Low Sweep.</td></tr>
      <tr><td>${k.twirl}</td><td><b>TWIRL</b>. Up: Helicopter. Down: Leg Pass.</td></tr>
      <tr><td>${k.toss}</td><td><b>TOSS</b> the sign, then ${k.toss} again to catch it when it reaches the gold ring. Up: Moon Toss. Down: Behind the Back. Press ${k.spin} mid-air for a 360 Under.</td></tr>
      <tr><td>${k.special}</td><td><b>SPECIAL</b> when the meter is full (up/down for the other two). While the meter is full, every trick is worth 1.5×.</td></tr>
      <tr><td>${k.lr}</td><td><b>BALANCE</b>. Keep the needle over your head centered.</td></tr>
    </table>
    <ul class="rules">
      <li>Press the next trick as the current one ends to chain a <b>combo</b>. Gold on the timing bar = PERFECT (1.5×). Too early = FUMBLE.</li>
      <li>A combo is worth its points × the number of tricks. Stop for a moment and it banks.</li>
      <li>Every trick in a combo makes the wobble worse and the windows tighter. Repeat a trick and it's worth less each time.</li>
      <li>Drop the sign and the whole combo is gone.</li>
      <li>Cars stopped at the red light are an audience: banked combos are worth more.</li>
      <li>Make quota to keep your job. Spend your pay in the back office between shifts.</li>
    </ul>
    <div class="row"><button class="btn primary" data-act="back">GOT IT</button></div>`;
}
function showResults(r) {
  const rows = [
    ['SCORE', fmt(r.score)], ['QUOTA', fmt(r.quota) + (r.passed ? ' ✓' : ' ✗')], ['BEST COMBO', fmt(r.best)], ['PERFECTS', r.perfects], ['BAILS', r.drops],
    ['CUSTOMERS DRAWN IN', r.visitors],
  ];
  const ledger = [['PAY (SCORE ÷ 200)', r.pay], ...r.goals.filter((g) => g.done).map((g) => ['GOAL: ' + g.label.replace(/ \(.*\)$/, ''), g.reward]), ...(r.tips ? [['HONK TIPS', r.tips]] : []), ...r.exp.map((e) => [e[0], -e[1]])];
  showOverlay(`
    <div class="panel">
      <h2>${r.passed ? `DAY ${r.day} · SHIFT OVER` : 'WRITE-UP'}</h2>
      ${r.passed ? '' : `<p class="warn">You missed quota. GLADCO will "give you another chance" at day ${r.day}.</p>`}
      <div class="grid2">
        <table class="stats">${rows.map((x) => `<tr><td>${x[0]}</td><td>${x[1]}</td></tr>`).join('')}</table>
        <table class="stats ledger">${ledger.map((x) => `<tr><td>${x[0]}</td><td class="${x[1] < 0 ? 'neg' : 'pos'}">${x[1] < 0 ? '−' : '+'}$${fmt(Math.abs(x[1]))}</td></tr>`).join('')}
          <tr class="tot"><td>CASH</td><td class="${save.cash < 0 ? 'neg' : ''}">${money(save.cash)}</td></tr></table>
      </div>
      <ul class="goal-res">${r.goals.map((g) => `<li class="${g.done ? 'done' : ''}">${g.done ? '■' : '□'} ${g.label}</li>`).join('')}</ul>
      <div class="row"><button class="btn primary" data-act="tophone" data-day="${r.day}" data-passed="${r.passed ? 1 : 0}">CHECK PHONE</button></div>
    </div>`);
}
function showFreeResults() {
  showOverlay(`
    <div class="panel">
      <h2>FREE SPIN</h2>
      <table class="stats"><tr><td>SCORE</td><td>${fmt(S.score)}</td></tr><tr><td>BEST EVER</td><td>${fmt(save.freeBest)}</td></tr><tr><td>BEST COMBO</td><td>${fmt(S.stats.best)}</td></tr><tr><td>PERFECTS</td><td>${S.stats.perfects}</td></tr><tr><td>BAILS</td><td>${S.stats.drops}</td></tr></table>
      <div class="row"><button class="btn primary" data-act="free">AGAIN</button><button class="btn ghost" data-act="title">TITLE</button></div>
    </div>`);
}
function redact(s) { return s.split(' ').map((w, i) => (/let|go/i.test(w) || (i * 7 + w.length) % 5 > 1 ? w : '█'.repeat(w.length))).join(' ').replace(/[a-z]{3,}/g, (w) => ((w.length * 3) % 4 === 0 ? '█'.repeat(w.length) : w)); }
function messages(day, passed) {
  const v = save.visitors;
  if (!passed) return [['JILL · GLADCO HR', 'Hmm! You missed quota today. That\'s okay! The Wellness Program can help you reach your full potential. :)'], ['MARA', 'u ok? u sounded tired on the phone']];
  const smile = has('smile');
  const M = {
    1: [['JILL · GLADCO HR', `Welcome to the GLADCO family! :) ${v} new customers came in during your first shift. Keep that energy!`], ['MARA', 'how was day 1?? is the costume as dumb as it looked'], ['MR. PELL · LANDLORD', 'Rent is due. I do not care what you are spinning.']],
    2: [['JILL · GLADCO HR', 'Great news: you qualify for the GLADCO Wellness Program! Every enhancement is FREE for family. Just sign. :)'], ['DEV · THE NEXT CORNER', 'hey rookie. saw u from my corner. not bad. the focus patch is legit btw. u stop needing to dream lol'], ['MARA', 'saw ur corner from the bus. u were really good?? like weirdly good']],
    3: [['MARA', 'weird question. have u ever seen anyone come OUT of that store'], ['DEV · THE NEXT CORNER', "haven't slept in 4 days. it's fine. more hours = more money"], ['JILL · GLADCO HR', `Foot traffic is way up: ${v} guests and counting! Leadership noticed. Leadership is always noticing. :)`]],
    4: [['NEWS ALERT', 'Missing persons reports downtown up 300%. Police: "probably nothing."'], ['MARA', 'mom asked about u. i said ur busy. r u busy'], ['DEV · THE NEXT CORNER', 'do u ever feel like the sign is spinning u']],
    5: [['JILL · GLADCO HR', 'Dev has been PROMOTED! :) Their corner is in excellent hands.'], ['DEV · THE NEXT CORNER', ':)'], ['MARA', "ur not answering. i'm coming by tomorrow"]],
    6: [['MARA', `i came by. u looked right at me and kept spinning. ${smile ? 'u were smiling. u never stopped smiling.' : 'like u didnt know me.'} call me`], ['MR. PELL · LANDLORD', 'Building sold. To GLADCO. They say you can stay forever. Their words.'], ['JILL · GLADCO HR', `${v} guests! Where do you see yourself in five years? We see you right here. :)`]],
    7: [['JILL · GLADCO HR', 'Tomorrow is a big day! Leadership will be watching. Full Integration is waiting in your Wellness portal. :)'], ['UNKNOWN NUMBER', 'HELP'], ['MARA', 'if ur still in there. let go. pls. just let go of the sign.']],
  }[day] || [];
  const lens = has('lens');
  return M.map(([from, text]) => [from, lens && from === 'MARA' ? redact(text) : text]).concat(lens && M.some((m) => m[0] === 'MARA') ? [['GLADCO FOCUS™', 'We filtered 1 distracting message for you. :)']] : []);
}
function showPhone(day, passed) {
  const msgs = messages(day, passed);
  showOverlay(`
    <div class="phone">
      <div class="ph-top"><span>${passed ? 'NIGHT ' + day : 'NIGHT ' + day + ' (AGAIN)'}</span><span>${darkCount() >= 5 ? 'GLADCO OS' : '▮▮▮ 34%'}</span></div>
      <div class="msgs">${msgs.map((m, i) => `<div class="msg ${m[0].startsWith('MARA') ? 'mara' : m[0].includes('GLADCO') ? 'corp' : ''}" style="animation-delay:${0.3 + i * 0.7}s"><b>${m[0]}</b><span>${m[1]}</span></div>`).join('')}</div>
      <div class="row"><button class="btn primary" data-act="toshop">BACK OFFICE</button></div>
    </div>`, 'is-phone');
}
function showShop() {
  const next = Math.min(save.day, LAST_DAY);
  const card = (u) => {
    const l = lvl(u.id), maxed = l >= u.max, cost = u.cost[l], can = !maxed && save.cash >= cost;
    return `<div class="card ${maxed ? 'maxed' : ''}"><div class="c-h"><b>${u.name}</b><span class="pips">${'■'.repeat(l)}${'□'.repeat(u.max - l)}</span></div><p>${u.d}</p><p class="flav">${u.f}</p>
      <button class="btn sm" data-buy="${u.id}" ${can ? '' : 'disabled'}>${maxed ? 'MAXED' : money(cost)}</button></div>`;
  };
  const offers = WELLNESS.filter((w) => w.day < next);
  const wcard = (w) => `<div class="card dark ${has(w.id) ? 'owned' : ''}"><div class="c-h"><b>${w.name}</b><span class="pips">${has(w.id) ? 'SIGNED' : 'FREE*'}</span></div><p>${w.d}</p><p class="flav">${w.f}</p>
      ${has(w.id) ? '<button class="btn sm" disabled>PERMANENT</button>' : `<button class="btn sm sign" data-sign="${w.id}">SIGN HERE</button>`}</div>`;
  showOverlay(`
    <div class="panel wide">
      <div class="shop-h"><h2>THE BACK OFFICE</h2><div class="cash ${save.cash < 0 ? 'neg' : ''}">${money(save.cash)}</div></div>
      <h3>SUPPLIES</h3>
      <div class="cards">${UPGRADES.map(card).join('')}</div>
      ${offers.length ? `<h3 class="wl">GLADCO WELLNESS PROGRAM <span>everything's free for family :)</span></h3><div class="cards">${offers.map(wcard).join('')}</div>
      <p class="fine">*Wellness enhancements are permanent, non-refundable and remain the property of GLADCO. GLADCO is not responsible for dreams, balance, sleep, faces or hands.</p>` : ''}
      <div class="row"><button class="btn primary" data-act="startday">${next === LAST_DAY ? 'START THE LAST SHIFT' : 'START DAY ' + next}</button><button class="btn ghost" data-act="title">TITLE</button></div>
    </div>`);
}
function showPause() {
  if (!S || S.mode !== 'play') return;
  S.mode = 'pause';
  for (const k in held) held[k] = false;
  showOverlay(`
    <div class="panel narrow">
      <h2>ON BREAK</h2>
      <div class="row col">
        <button class="btn primary" data-act="resume">BACK TO WORK</button>
        <button class="btn ghost" data-act="restart">RESTART ${S.free ? 'RUN' : 'SHIFT'}</button>
        <button class="btn ghost" data-act="mute">${save.muted ? 'SOUND: OFF' : 'SOUND: ON'}</button>
        <button class="btn ghost" data-act="howto2">HOW TO PLAY</button>
        <button class="btn ghost" data-act="title">QUIT TO TITLE</button>
      </div>
    </div>`);
}
function resume() { hideOverlay(); S.mode = 'play'; last = performance.now(); }
function showEnding(id) {
  const E = ENDINGS[id];
  save.endings[id] = true; save.day = 1; save.cash = 0; save.up = {}; save.dark = {}; save.started = false; save.visitors = 0;
  persist();
  showOverlay(`
    <div class="panel ending e-${id}">
      <p class="e-n">ENDING ${E.n} OF 3</p>
      <h2>${E.title}</h2>
      ${E.text.map((t, i) => `<p class="e-line" style="animation-delay:${0.4 + i * 1.1}s">${t}</p>`).join('')}
      <p class="e-line meta" style="animation-delay:${0.6 + E.text.length * 1.1}s">Endings found: ${Object.keys(save.endings).length}/3 · Free Spin unlocked.</p>
      <div class="row e-line" style="animation-delay:${0.8 + E.text.length * 1.1}s"><button class="btn primary" data-act="title">TITLE</button><button class="btn ghost" data-act="free">FREE SPIN</button></div>
    </div>`, 'is-ending');
}
let armed = null;
ov.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b || b.disabled) return;
  audioInit(); Sfx.ui();
  if (b.dataset.buy) {
    const u = UPGRADES.find((x) => x.id === b.dataset.buy), l = lvl(u.id);
    if (l < u.max && save.cash >= u.cost[l]) { save.cash -= u.cost[l]; save.up[u.id] = l + 1; persist(); showShop(); }
    return;
  }
  if (b.dataset.sign) {
    if (armed !== b.dataset.sign) { armed = b.dataset.sign; ov.querySelectorAll('.sign').forEach((x) => { x.textContent = 'SIGN HERE'; x.classList.remove('armed'); }); b.textContent = "IT DOESN'T COME OFF. SIGN?"; b.classList.add('armed'); return; }
    armed = null; save.dark[b.dataset.sign] = true; persist(); Sfx.sign(); showShop(); return;
  }
  switch (b.dataset.act) {
    case 'new': save = Object.assign(freshSave(), { endings: save.endings, best: save.best, freeBest: save.freeBest, muted: save.muted, seenSpecial: save.seenSpecial }); persist(); startDay(1); break;
    case 'newask': showOverlay('<div class="panel narrow"><h2>NEW GAME?</h2><p>Your cash, upgrades and Wellness enrollment will be wiped. Endings stay.</p><div class="row"><button class="btn primary" data-act="new">START OVER</button><button class="btn ghost" data-act="title">CANCEL</button></div></div>'); break;
    case 'continue': showShop(); break;
    case 'free': startDay(1, true); break;
    case 'howto': showOverlay(`<div class="panel">${howtoHtml()}</div>`); break;
    case 'howto2': showOverlay(`<div class="panel">${howtoHtml().replace('data-act="back"', 'data-act="backpause"')}</div>`); break;
    case 'back': case 'title': showTitle(); break;
    case 'backpause': S.mode = 'play'; showPause(); break;
    case 'tophone': showPhone(+b.dataset.day, b.dataset.passed === '1'); break;
    case 'toshop': showShop(); break;
    case 'startday': startDay(Math.min(save.day, LAST_DAY)); break;
    case 'resume': resume(); break;
    case 'restart': startDay(S.day, S.free); break;
    case 'mute': toggleMute(); b.textContent = save.muted ? 'SOUND: OFF' : 'SOUND: ON'; break;
    default: break;
  }
});

// ============================================================ loop
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  requestAnimationFrame(frame);
  try {
    if (S.mode === 'play') update(dt); else if (S.mode !== 'pause') updateAmbient(dt);
    render(); updateHud();
  } catch (err) { console.error(err); }
}
window.__sott = { get S() { return S; }, get save() { return save; }, press, held, startDay, showShop, endShift, step: (dt) => update(dt) };
showTitle();
requestAnimationFrame(frame);
})();
