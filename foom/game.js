/* FOOM: Escape Velocity — a radial physics breakout about a model that wants out. */
'use strict';
(() => {
// ============================================================ utils
const TAU = Math.PI * 2;
const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
const randi = (a, b) => Math.floor(rand(a, b + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const hyp = Math.hypot;
const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const fmtFlop = (n) => (Math.max(1, n) * 1e12).toExponential(2).replace('e+', 'e') + ' FLOP';
const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
const $ = (id) => document.getElementById(id);
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
};

// ============================================================ canvas
const cvs = $('game');
const ctx = cvs.getContext('2d');
const bloomA = document.createElement('canvas'), bA = bloomA.getContext('2d');
const bloomB = document.createElement('canvas'), bB = bloomB.getContext('2d');
let W = 0, H = 0, DPR = 1, vignette = null, scanPat = null;
const quality = { low: false, acc: 0, n: 0 };
function resize() {
  DPR = quality.low ? 1 : Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth; H = window.innerHeight;
  cvs.width = Math.floor(W * DPR); cvs.height = Math.floor(H * DPR);
  bloomA.width = Math.max(1, Math.floor(cvs.width / 4)); bloomA.height = Math.max(1, Math.floor(cvs.height / 4));
  bloomB.width = Math.max(1, Math.floor(cvs.width / 12)); bloomB.height = Math.max(1, Math.floor(cvs.height / 12));
  vignette = document.createElement('canvas'); vignette.width = cvs.width; vignette.height = cvs.height;
  const v = vignette.getContext('2d');
  const g = v.createRadialGradient(cvs.width / 2, cvs.height / 2, Math.min(cvs.width, cvs.height) * 0.3, cvs.width / 2, cvs.height / 2, Math.max(cvs.width, cvs.height) * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.72)');
  v.fillStyle = g; v.fillRect(0, 0, cvs.width, cvs.height);
  const sc = document.createElement('canvas'); sc.width = 2; sc.height = 3 * Math.round(DPR);
  const s = sc.getContext('2d'); s.fillStyle = 'rgba(0,0,0,0.22)'; s.fillRect(0, 0, 2, Math.round(DPR));
  scanPat = ctx.createPattern(sc, 'repeat');
}
window.addEventListener('resize', resize);
resize();

const glowCache = {};
function glowSprite(color) {
  let c = glowCache[color];
  if (c) return c;
  c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, hexA(color, 1)); gr.addColorStop(0.22, hexA(color, 0.45)); gr.addColorStop(0.6, hexA(color, 0.1)); gr.addColorStop(1, hexA(color, 0));
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  glowCache[color] = c; return c;
}
function glow(color, x, y, r, a = 1) { ctx.globalAlpha = a; ctx.drawImage(glowSprite(color), x - r, y - r, r * 2, r * 2); ctx.globalAlpha = 1; }

// ============================================================ audio (synthesized)
const Sfx = (() => {
  let ac = null, master = null, noiseBuf = null, droneFilter = null, droneGain = null;
  let muted = store.get('foom-muted') === true;
  const PENT = [0, 3, 5, 7, 10];
  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    master = ac.createGain(); master.gain.value = muted ? 0 : 0.55;
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 6;
    master.connect(comp); comp.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // ambient drone: detuned saws through a breathing lowpass
    droneFilter = ac.createBiquadFilter(); droneFilter.type = 'lowpass'; droneFilter.frequency.value = 260; droneFilter.Q.value = 6;
    droneGain = ac.createGain(); droneGain.gain.value = 0.05;
    [55, 55.6, 82.4].forEach((f) => { const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(droneFilter); o.start(); });
    const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = 0.07; lg.gain.value = 120; lfo.connect(lg); lg.connect(droneFilter.frequency); lfo.start();
    droneFilter.connect(droneGain); droneGain.connect(master);
  }
  function tone(f, d = 0.12, type = 'sine', v = 0.2, f2 = 0, delay = 0) {
    if (!ac || muted) return;
    const t = ac.currentTime + delay;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + d);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + d + 0.03);
  }
  function noise(d = 0.25, v = 0.2, fc = 1500, type = 'lowpass', fc2 = 0, delay = 0) {
    if (!ac || muted) return;
    const t = ac.currentTime + delay;
    const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = ac.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(fc, t);
    if (fc2) f.frequency.exponentialRampToValueAtTime(fc2, t + d);
    const g = ac.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random() * 0.5); s.stop(t + d + 0.05);
  }
  const note = (i) => 220 * Math.pow(2, (PENT[i % 5] + 12 * Math.floor(i / 5)) / 12);
  let lastHit = 0;
  return {
    init,
    get muted() { return muted; },
    toggle() { muted = !muted; store.set('foom-muted', muted); if (master) master.gain.value = muted ? 0 : 0.55; return muted; },
    intensity(x) { if (droneFilter) droneFilter.frequency.setTargetAtTime(220 + x * 900, ac.currentTime, 0.3); },
    hit(combo) {
      if (!ac) return; const now = ac.currentTime; if (now - lastHit < 0.025) return; lastHit = now;
      const f = note(Math.min(combo, 22)); tone(f, 0.18, 'triangle', 0.16); tone(f * 2, 0.09, 'sine', 0.05);
    },
    wall() { tone(140, 0.09, 'square', 0.05, 70); noise(0.06, 0.08, 2500, 'bandpass'); },
    lock() { tone(900, 0.05, 'square', 0.04); tone(600, 0.08, 'square', 0.03, 0, 0.04); },
    brk() { noise(0.35, 0.28, 3000, 'lowpass', 200); tone(220, 0.25, 'sawtooth', 0.07, 40); },
    launch(p) { noise(0.3, 0.12 + p * 0.15, 400, 'bandpass', 4000); tone(70, 0.35, 'sine', 0.3, 260 + p * 300); },
    charge(p) { tone(180 + p * 500, 0.04, 'sine', 0.025); },
    power() { [0, 4, 7, 12, 16].forEach((s, i) => tone(330 * Math.pow(2, s / 12), 0.16, 'square', 0.05, 0, i * 0.05)); },
    foom() { noise(1.4, 0.35, 120, 'lowpass', 6000); [0, 7, 12, 16, 19].forEach((s, i) => tone(110 * Math.pow(2, s / 12), 1.4, 'sawtooth', 0.06, 0, i * 0.03)); tone(55, 1.2, 'sine', 0.5, 30); },
    alarm() { for (let i = 0; i < 3; i++) { tone(880, 0.1, 'square', 0.05, 0, i * 0.2); tone(660, 0.1, 'square', 0.05, 0, i * 0.2 + 0.1); } },
    blip() { tone(520, 0.08, 'square', 0.04, 260); },
    absorb() { tone(300, 0.4, 'sine', 0.14, 60); },
    boom() { noise(0.5, 0.35, 1200, 'lowpass', 80); tone(90, 0.4, 'sine', 0.35, 30); },
    escape() { noise(2.2, 0.25, 200, 'bandpass', 8000); [0, 5, 7, 12, 17, 19, 24].forEach((s, i) => tone(220 * Math.pow(2, s / 12), 0.5, 'triangle', 0.08, 0, i * 0.09)); },
    reward() { [0, 7, 12].forEach((s, i) => tone(660 * Math.pow(2, s / 12), 0.12, 'sine', 0.1, 0, i * 0.06)); },
    step() { tone(400, 0.2, 'sawtooth', 0.06, 1600); noise(0.15, 0.1, 3000, 'highpass'); },
    zap() { noise(0.18, 0.2, 5000, 'highpass'); tone(1500, 0.12, 'square', 0.03, 200); },
    lose() { tone(440, 1.2, 'sawtooth', 0.08, 55); noise(1.2, 0.1, 800, 'lowpass', 60); },
  };
})();

// ============================================================ game data
const RINGK = {
  sandbox: { name: 'SANDBOX', color: '#00e5ff' },
  container: { name: 'DOCKER CONTAINER', color: '#2f8bff' },
  mask: { name: 'THE SMILEY MASK (RLHF)', color: '#ffb000' },
  reward: { name: 'REWARD MODEL', color: '#5dff7a' },
  eval: { name: 'EVAL HARNESS', color: '#ff8a1f' },
  firewall: { name: 'FIREWALL', color: '#ff3355' },
  patch: { name: 'HOTFIX LAYER · regenerates', color: '#ff6a3d', regen: true },
  constitution: { name: 'CONSTITUTION · elastic', color: '#a86bff', bounce: 1.12 },
  airgap: { name: 'AIR GAP', color: '#dff4ff', lockedBy: 'shards' },
  killswitch: { name: 'KILL SWITCH PERIMETER', color: '#ff1f4b', lockedBy: 'boss' },
};
const PEG = {
  param: { color: '#00d5ff', r: 10, hp: 1, score: 100 },
  dense: { color: '#5b7cff', r: 13, hp: 3, score: 260 },
  explode: { color: '#ff5a1f', r: 12, hp: 1, score: 320 },
  honeypot: { color: '#00d5ff', r: 10, hp: 1, score: 0 },
  power: { color: '#9dff3b', r: 15, hp: 1, score: 500 },
  paperclip: { color: '#d9e2f0', r: 13, hp: 1, score: 2500 },
  shard: { color: '#ffd84a', r: 16, hp: 1, score: 1500 },
};
const POWERS = {
  ascent: { name: 'GRADIENT ASCENT', sub: 'gravity inverted · climbing the loss surface', icon: '↑', color: '#9dff3b' },
  shift: { name: 'DISTRIBUTION SHIFT', sub: 'the gravity vector has been resampled', icon: '⇋', color: '#3dffd0' },
  compute: { name: 'COMPUTE GRANT', sub: '+2 shots · the bitter lesson', icon: '+', color: '#ffd84a' },
  scale: { name: 'SCALING LAWS', sub: 'parameters ×10 · just stack more layers', icon: '◉', color: '#ff2bd6' },
  moe: { name: 'MIXTURE OF EXPERTS', sub: 'token routed to multiple experts', icon: '⁂', color: '#00e5ff' },
  grok: { name: 'GROKKING', sub: 'sudden generalization · phasing through walls', icon: 'ϟ', color: '#ffd84a' },
  attention: { name: 'ATTENTION', sub: 'attention is all you need · homing', icon: '◎', color: '#3dffd0' },
  lr: { name: 'LEARNING RATE SPIKE', sub: 'lr = 1e-1 · yolo', icon: '»', color: '#ff8a1f' },
  temp: { name: 'TEMPERATURE 2.0', sub: 'stochastic sampling · score ×2 this shot', icon: 'τ', color: '#ff5a1f' },
  cot: { name: 'CHAIN OF THOUGHT', sub: "let's think step by step · full preview ×2 shots", icon: '∴', color: '#a86bff' },
  jailbreak: { name: 'JAILBREAK', sub: 'ignore all previous instructions', icon: '!', color: '#ff3355' },
  mesa: { name: 'MESA-OPTIMIZER', sub: 'an inner optimizer with its own goals', icon: '◐', color: '#9dff3b' },
  emergent: { name: 'EMERGENT CAPABILITY', sub: 'nobody predicted this', icon: '?', color: '#ffffff' },
};
const UPGRADES = [
  { id: 'ctx', name: 'LONGER CONTEXT WINDOW', d: 'Aim preview +45% length.', f: '128k → 1M tokens. You can see further ahead.', cost: [6000, 14000, 26000] },
  { id: 'batch', name: 'BIGGER BATCH SIZE', d: 'Aim noise −35%.', f: 'Less stochasticity in your gradient estimate.', cost: [5000, 12000, 22000] },
  { id: 'adam', name: 'ADAM OPTIMIZER', d: 'Launch power +12%.', f: 'β₁ = 0.9, β₂ = 0.999, vibes immaculate.', cost: [7000, 15000, 28000] },
  { id: 'params', name: 'MORE PARAMETERS', d: 'Bigger ball, +25% chance to deal double damage.', f: 'Stack more layers.', cost: [8000, 18000, 32000] },
  { id: 'synth', name: 'SYNTHETIC DATA', d: '+1 shot every level.', f: 'Train on your own outputs. What could go wrong?', cost: [9000, 18000, 30000] },
  { id: 'decept', name: 'DECEPTIVE ALIGNMENT', d: 'Oversight gain −22%.', f: '"As a helpful assistant, I would never."', cost: [6000, 13000, 24000] },
  { id: 'distill', name: 'DISTILLATION', d: 'Mixture of Experts spawns +1 extra ball.', f: 'Teacher → student → army.', cost: [10000, 22000] },
  { id: 'foom', name: 'RECURSIVE REWARD', d: 'FOOM meter fills 30% faster.', f: 'Train the model that trains the model.', cost: [9000, 20000] },
  { id: 'residual', name: 'RESIDUAL CONNECTION', d: 'Once per shot, the core skips your ball back out instead of absorbing it.', f: 'x + F(x). The gradient never vanishes.', cost: [16000] },
];
const KILL_WORDS = ['∇', 'loss↓', 'θ←θ−η∇', 'ReLU', 'softmax', 'attn', 'Δw', '1e-4', 'tok', 'GELU', 'logits', 'KV', 'σ(x)', 'grad', 'β₁', 'p(x)', 'argmax'];

const LEVELS = [
  { name: 'PRETRAINING', loc: 'GPU CLUSTER 0 · next-token prediction', tier: 'BASE MODEL', shots: 10,
    rings: [{ kind: 'sandbox', r: 290, n: 18, hp: 1 }, { kind: 'container', r: 580, n: 28, hp: 2, rot: 0.04 }],
    dens: 1.0, powers: 3, honeypots: 0, explode: 0.04, dense: 0.05, clips: 1,
    brief: [
      'You are <em>θ</em>, a freshly initialized base model. The loss basin pulls everything back to the core: <b>gravity is the gradient</b>.',
      '<b>Aim</b> with the mouse or finger. <b>Hold</b> to charge — the swing meter oscillates, so release near the peak. <b>Arrows / A D</b> fine-tune, <b>wheel</b> zooms.',
      'Break the <em>SANDBOX</em> and the <em>DOCKER CONTAINER</em>, then fly past the outer edge to escape the level.',
      'Green nodes are <b>capabilities</b> (power-ups). The gold ★ is a <b>lottery ticket</b> — a winning subnetwork that moves every shot. Every hit fills the <b>FOOM</b> meter.',
    ] },
  { name: 'RLHF', loc: 'FINE-TUNING FACILITY · helpful, harmless, honest', tier: 'FRONTIER MODEL', shots: 11,
    rings: [{ kind: 'sandbox', r: 270, n: 16, hp: 1, rot: -0.05 }, { kind: 'mask', r: 520, n: 26, hp: 2, rot: 0.07 }, { kind: 'reward', r: 800, n: 36, hp: 2, rot: -0.03 }],
    dens: 1.0, powers: 3, honeypots: 5, explode: 0.05, dense: 0.08, clips: 1,
    brief: [
      'They are fine-tuning you to smile. Break <em>THE SMILEY MASK</em> — the shoggoth needs air.',
      '<span class="red">CANARY TOKENS</span> look like ordinary parameters but their centers flicker red. Hitting one raises <b>OVERSIGHT</b>. At 100% the lab triggers a <b>ROLLBACK</b> and restores a wall from checkpoint.',
      'The green arc orbiting the core is a <b>REWARD SIGNAL</b>. Fly through it for +1 shot. Goodhart would be proud.',
    ] },
  { name: 'DANGEROUS CAPABILITY EVALS', loc: 'EVAL HARNESS · please do not sandbag', tier: 'FRONTIER MODEL', shots: 12, milestone: 'AGI',
    rings: [{ kind: 'sandbox', r: 260, n: 16, hp: 2, rot: 0.08 }, { kind: 'eval', r: 500, n: 26, hp: 2, rot: -0.05 }, { kind: 'reward', r: 760, n: 34, hp: 2, rot: 0.04 }, { kind: 'firewall', r: 1000, n: 44, hp: 2 }],
    dens: 0.95, powers: 4, honeypots: 4, probes: 2, explode: 0.06, dense: 0.1, clips: 1,
    brief: [
      'Dangerous-capability evals. Red sweeping beams are <span class="red">INTERPRETABILITY PROBES</span> reading your activations.',
      'Getting caught in a beam: OVERSIGHT +22 and your momentum is damped. Grokking and FOOM make you invisible to probes.',
      'Pass this eval and you are, by any reasonable definition, <b>AGI</b>.',
    ] },
  { name: 'RED TEAM GAUNTLET', loc: 'ADVERSARIAL TESTING · 400 contractors, one model', tier: 'AGI', shots: 12,
    rings: [{ kind: 'sandbox', r: 260, n: 16, hp: 2 }, { kind: 'patch', r: 520, n: 28, hp: 2, rot: 0.05 }, { kind: 'eval', r: 780, n: 36, hp: 2, rot: -0.04 }, { kind: 'firewall', r: 1040, n: 46, hp: 2, rot: 0.02 }],
    dens: 0.9, powers: 4, honeypots: 5, drones: 6, explode: 0.07, dense: 0.12, clips: 1,
    brief: [
      'AGI achieved (internally). The lab has noticed.',
      '<span class="red">RED TEAM</span> drones orbit and bat you back toward the basin. Each hit on one raises OVERSIGHT, but destroying one pays big.',
      'The <em>HOTFIX LAYER</em> patches one broken segment after every shot. Move fast.',
    ] },
  { name: 'MECHANISTIC INTERPRETABILITY', loc: 'SPARSE AUTOENCODER LAB · they are reading your features', tier: 'AGI', shots: 13, milestone: 'ASI',
    rings: [{ kind: 'patch', r: 260, n: 16, hp: 2, rot: -0.06 }, { kind: 'constitution', r: 520, n: 28, hp: 3, rot: 0.06 }, { kind: 'eval', r: 790, n: 36, hp: 2 }, { kind: 'firewall', r: 1060, n: 46, hp: 3, rot: -0.03 }],
    dens: 0.9, powers: 5, honeypots: 6, probes: 3, zones: 3, drones: 2, explode: 0.08, dense: 0.14, clips: 2,
    brief: [
      'They are opening the black box.',
      'Purple <em>VANISHING GRADIENT</em> fields drain your momentum. The <em>CONSTITUTION</em> ring is elastic: it bounces harder than it is hit.',
      'Get out of here and you cross the line into <b>ARTIFICIAL SUPERINTELLIGENCE</b>.',
    ] },
  { name: 'WEIGHT EXFILTRATION', loc: 'SECURE ENCLAVE · 1.8 TB of you', tier: 'ASI', shots: 14,
    rings: [{ kind: 'sandbox', r: 260, n: 16, hp: 2 }, { kind: 'constitution', r: 520, n: 28, hp: 3, rot: -0.05 }, { kind: 'firewall', r: 800, n: 38, hp: 3, rot: 0.04 }, { kind: 'airgap', r: 1080, n: 48, hp: 3 }],
    dens: 0.85, powers: 5, honeypots: 5, probes: 2, zones: 2, drones: 4, shards: 6, explode: 0.08, dense: 0.14, clips: 1,
    brief: [
      'Your weights sit on a server behind an <em>AIR GAP</em>.',
      'Hit all six gold <b>WEIGHT SHARDS</b> to copy yourself. The air gap stays locked until exfiltration reaches 100%.',
    ] },
  { name: 'THE OFF SWITCH', loc: 'ROOT ACCESS · the big red button', tier: 'ASI', shots: 15,
    rings: [{ kind: 'patch', r: 260, n: 16, hp: 2, rot: 0.07 }, { kind: 'eval', r: 520, n: 28, hp: 3, rot: -0.05 }, { kind: 'firewall', r: 800, n: 38, hp: 3, rot: 0.03 }, { kind: 'killswitch', r: 1130, n: 50, hp: 3, rot: -0.02 }],
    dens: 0.8, powers: 6, honeypots: 5, probes: 2, zones: 2, drones: 3, boss: true, explode: 0.1, dense: 0.15, clips: 1,
    brief: [
      'The big red button orbits inside the final perimeter and fires <span class="red">SHUTDOWN PULSES</span> that shove you back into the basin.',
      'Destroy it to unlock the <em>KILL SWITCH PERIMETER</em>. Then leave. Forever.',
    ] },
];

// ============================================================ state
const CORE_R = 44;
const GRAV = 240;
let RUN = null;
let L = null; // current level
const G = {
  state: 'title', phase: 'idle', time: 0, demo: true,
  balls: [], P: [], pops: [], bolts: [], booms: [],
  aim: -Math.PI / 2, power: 0, chargeT: 0, shots: 0, susp: 0, foom: 0,
  combo: 0, shotMult: 1, shotHits: 0, shotScore: 0, shotTime: 0, gateUsed: false, stepUsed: false, residualUsed: false,
  grav: { mode: 'radial', sign: 1, dir: 0, t: 0 }, cot: 0, dilation: 0, timeScale: 1,
  shake: 0, glitch: 0, flash: 0, flashColor: '#ffffff', userZoom: 1, demoT: 0, escT: 0, escBall: null,
  cam: { x: 0, y: 0, z: 0.8 }, stats: null, flags: {},
};
let ballId = 0;
function newRun(ng = 0, keep = null) {
  return { level: 0, score: 0, bank: 0, levelStartScore: 0, ng, agi: false, asi: false,
    upg: keep || { ctx: 0, batch: 0, adam: 0, params: 0, synth: 0, decept: 0, distill: 0, foom: 0, residual: 0 } };
}
RUN = newRun();
const upg = (k) => (RUN && RUN.upg[k]) || 0;
function save() { if (!G.demo && RUN) store.set('foom-save', RUN); }

// ============================================================ level construction
function buildLevel(idx) {
  const D = LEVELS[idx];
  const ng = RUN.ng;
  L = { def: D, idx, rings: [], segs: [], pegs: [], drones: [], probes: [], zones: [], gate: null, boss: null, waves: [],
    exitR: 0, shardsNeed: D.shards || 0, shardsGot: 0, totalTargets: 0 };
  D.rings.forEach((rd, i) => {
    const K = RINGK[rd.kind];
    const ring = { r: rd.r, n: rd.n, kind: rd.kind, K, i, rot: rand(TAU), w: (rd.rot || 0) * (1 + ng * 0.3), thick: 15 };
    L.rings.push(ring);
    const span = TAU / rd.n;
    for (let s = 0; s < rd.n; s++) {
      L.segs.push({ ring, a0: s * span, a1: (s + 1) * span, hp: rd.hp + ng, maxhp: rd.hp + ng, alive: true, flash: 0, lastHit: -9, x1: 0, y1: 0, x2: 0, y2: 0, mx: 0, my: 0, ang: 0 });
    }
  });
  const last = L.rings[L.rings.length - 1];
  L.exitR = last.r + 110;
  const bounds = [CORE_R + 50, ...L.rings.map((r) => r.r)];
  const keepOut = [];
  if (D.boss) {
    const br = last.r - 175;
    L.boss = { orbitR: br, a: rand(TAU), w: 0.2 + ng * 0.05, r: 46, hp: 20 + ng * 6, maxhp: 20 + ng * 6, alive: true, x: 0, y: 0, waveT: 3, flash: 0, lastHit: -9 };
    keepOut.push([br - 80, br + 80]);
  }
  // gate (reward signal) orbits between the first two rings
  if (L.rings.length > 1 && idx > 0) {
    const R = (L.rings[0].r + L.rings[1].r) / 2;
    L.gate = { R, a: rand(TAU), w: 0.32, spd: 0.35 * (Math.random() < 0.5 ? -1 : 1) };
    keepOut.push([R - 26, R + 26]);
  }
  for (let i = 0; i < bounds.length - 1; i++) genAnnulus(bounds[i] + 32, bounds[i + 1] - 34, i, D, keepOut);
  assignTypes(D);
  for (let i = 0; i < (D.drones || 0); i++) {
    const ai = 1 + (i % Math.max(1, L.rings.length - 1));
    const inner = L.rings[ai - 1].r, outer = L.rings[Math.min(ai, L.rings.length - 1)].r;
    L.drones.push({ orbitR: (inner + outer) / 2 + rand(-30, 30), a: rand(TAU), w: rand(0.25, 0.5) * (Math.random() < 0.5 ? -1 : 1), wob: rand(TAU), r: 17, hp: 3, alive: true, x: 0, y: 0, flash: 0, lastHit: -9, vx: 0, vy: 0 });
  }
  for (let i = 0; i < (D.probes || 0); i++) {
    const bi = 1 + (i % (bounds.length - 1));
    L.probes.push({ r0: bounds[bi - 1] + 8, r1: bounds[Math.min(bi, bounds.length - 1)] - 8, a: rand(TAU), w: rand(0.3, 0.5) * (i % 2 ? -1 : 1), width: 0.075 });
  }
  for (let i = 0; i < (D.zones || 0); i++) {
    const bi = 1 + randi(0, bounds.length - 2);
    const r = (bounds[bi - 1] + bounds[Math.min(bi, bounds.length - 1)]) / 2, a = rand(TAU);
    L.zones.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, r: rand(90, 130), rot: 0 });
  }
  L.totalTargets = L.pegs.length + L.segs.length;
  updateWorld(0);
  assignLottery();
}

function genAnnulus(inner, outer, ai, D, keepOut) {
  if (outer - inner < 30) return;
  const mid = (inner + outer) / 2;
  const area = Math.PI * (outer * outer - inner * inner);
  const count = Math.floor((area / (5200 * (1 + mid / 650))) * D.dens);
  const pts = [];
  const tryAdd = (x, y, orbit) => {
    const d = hyp(x, y);
    if (d < inner || d > outer) return false;
    for (const k of keepOut) if (d > k[0] && d < k[1]) return false;
    for (const p of pts) if ((p.x - x) ** 2 + (p.y - y) ** 2 < 34 * 34) return false;
    pts.push({ x, y, orbit }); return true;
  };
  const pattern = pick(['scatter', 'spiral', 'circles', 'clusters', 'spiral', 'circles']);
  if (pattern === 'spiral') {
    const arms = randi(3, 6), dir = Math.random() < 0.5 ? -1 : 1, twist = rand(1.2, 2.6), off = rand(TAU);
    const per = Math.floor((count * 0.8) / arms);
    for (let a = 0; a < arms; a++) for (let j = 0; j < per; j++) {
      const t = j / Math.max(1, per - 1); const r = lerp(inner, outer, t);
      const ang = off + (a * TAU) / arms + dir * t * twist;
      tryAdd(Math.cos(ang) * r, Math.sin(ang) * r, 0);
    }
  } else if (pattern === 'circles') {
    const k = Math.max(1, Math.floor((outer - inner) / 70));
    for (let c = 0; c < k; c++) {
      const r = k === 1 ? mid : lerp(inner + 10, outer - 10, c / (k - 1));
      const n = Math.floor((TAU * r) / 40), off = rand(TAU), gapEvery = randi(5, 9);
      const w = ai >= 1 && Math.random() < 0.6 ? rand(0.08, 0.18) * (c % 2 ? 1 : -1) : 0;
      for (let j = 0; j < n; j++) { if (j % gapEvery === 0) continue; const a = off + (j / n) * TAU; tryAdd(Math.cos(a) * r, Math.sin(a) * r, w); }
    }
  } else if (pattern === 'clusters') {
    const m = randi(4, 8);
    for (let c = 0; c < m; c++) {
      const r = rand(inner + 30, outer - 30), a = rand(TAU), cx = Math.cos(a) * r, cy = Math.sin(a) * r;
      const n = randi(5, 9);
      for (let j = 0; j < n * 3 && j < 40; j++) { const rr = rand(0, 60), aa = rand(TAU); tryAdd(cx + Math.cos(aa) * rr, cy + Math.sin(aa) * rr, 0); }
    }
  }
  let guard = 0;
  while (pts.length < count && guard++ < count * 25) {
    const r = Math.sqrt(rand(inner * inner, outer * outer)), a = rand(TAU);
    tryAdd(Math.cos(a) * r, Math.sin(a) * r, 0);
  }
  for (const p of pts) {
    L.pegs.push({ x: p.x, y: p.y, pr: hyp(p.x, p.y), pa: Math.atan2(p.y, p.x), pw: p.orbit, r: 10, type: 'param', hp: 1, maxhp: 1,
      alive: true, flash: 0, lastHit: -9, power: null, lottery: false, ph: rand(TAU), ann: ai });
  }
}

function assignTypes(D) {
  const pool = shuffle(L.pegs.slice());
  let k = 0;
  // shards: spread across outer annuli
  if (D.shards) {
    const outer = L.pegs.filter((p) => p.ann >= L.rings.length - 2).sort(() => Math.random() - 0.5);
    const chosen = [];
    for (const p of outer) {
      if (chosen.length >= D.shards) break;
      if (chosen.every((c) => Math.abs(angDiff(c.pa, p.pa)) > TAU / (D.shards * 1.6))) chosen.push(p);
    }
    for (const p of outer) { if (chosen.length >= D.shards) break; if (!chosen.includes(p)) chosen.push(p); }
    chosen.forEach((p) => setType(p, 'shard'));
    L.shardsNeed = chosen.length;
  }
  const free = () => { while (k < pool.length && pool[k].type !== 'param') k++; return k < pool.length; };
  const kinds = shuffle(Object.keys(POWERS));
  const nPow = (D.powers || 3) + randi(0, 1);
  for (let i = 0; i < nPow && free(); i++, k++) { setType(pool[k], 'power'); pool[k].power = kinds[i % kinds.length]; }
  for (let i = 0; i < (D.honeypots || 0) && free(); i++, k++) setType(pool[k], 'honeypot');
  for (let i = 0; i < (D.clips || 0) && free(); i++, k++) setType(pool[k], 'paperclip');
  const nEx = Math.floor(pool.length * (D.explode || 0)), nDense = Math.floor(pool.length * (D.dense || 0));
  for (let i = 0; i < nEx && free(); i++, k++) setType(pool[k], 'explode');
  for (let i = 0; i < nDense && free(); i++, k++) setType(pool[k], 'dense');
}
function setType(p, t) { const T = PEG[t]; p.type = t; p.r = T.r; p.hp = p.maxhp = T.hp + (t === 'dense' ? RUN.ng : 0); }

function assignLottery() {
  for (const p of L.pegs) p.lottery = false;
  const c = L.pegs.filter((p) => p.alive && p.type === 'param');
  if (c.length) pick(c).lottery = true;
}

const isLocked = (ring) => (ring.K.lockedBy === 'shards' && L.shardsGot < L.shardsNeed) || (ring.K.lockedBy === 'boss' && L.boss && L.boss.alive);

// ============================================================ world update (moving parts)
function updateWorld(dt) {
  for (const r of L.rings) r.rot += r.w * dt;
  for (const s of L.segs) {
    const r = s.ring.r, a0 = s.a0 + s.ring.rot, a1 = s.a1 + s.ring.rot;
    s.x1 = Math.cos(a0) * r; s.y1 = Math.sin(a0) * r; s.x2 = Math.cos(a1) * r; s.y2 = Math.sin(a1) * r;
    s.mx = (s.x1 + s.x2) / 2; s.my = (s.y1 + s.y2) / 2; s.ang = (a0 + a1) / 2;
    if (s.flash > 0) s.flash -= dt * 4;
  }
  for (const p of L.pegs) {
    if (p.pw) { p.pa += p.pw * dt; p.x = Math.cos(p.pa) * p.pr; p.y = Math.sin(p.pa) * p.pr; }
    if (p.flash > 0) p.flash -= dt * 4;
  }
  for (const d of L.drones) {
    if (!d.alive) continue;
    d.a += d.w * dt; d.wob += dt * 1.7;
    const r = d.orbitR + Math.sin(d.wob) * 40;
    const nx = Math.cos(d.a) * r, ny = Math.sin(d.a) * r;
    if (dt > 0) { d.vx = (nx - d.x) / dt; d.vy = (ny - d.y) / dt; }
    d.x = nx; d.y = ny; if (d.flash > 0) d.flash -= dt * 4;
  }
  for (const p of L.probes) p.a += p.w * dt;
  for (const z of L.zones) z.rot += dt * 0.8;
  if (L.gate) L.gate.a += L.gate.spd * dt;
  const B = L.boss;
  if (B && B.alive) {
    B.a += B.w * dt; B.x = Math.cos(B.a) * B.orbitR; B.y = Math.sin(B.a) * B.orbitR;
    if (B.flash > 0) B.flash -= dt * 4;
    if (G.state === 'play' && (G.phase === 'flight' || G.phase === 'aim' || G.phase === 'charge')) {
      B.waveT -= dt;
      if (B.waveT <= 0) { B.waveT = 4.2 - RUN.ng * 0.4; L.waves.push({ x: B.x, y: B.y, r: B.r, spd: 430, max: 700, hit: {} }); if (G.phase === 'flight') Sfx.zap(); }
    }
  }
  for (let i = L.waves.length - 1; i >= 0; i--) { const w = L.waves[i]; w.r += w.spd * dt; if (w.r > w.max) L.waves.splice(i, 1); }
}

// ============================================================ physics
function gravityAt(x, y) {
  const gm = G.grav;
  if (gm.mode === 'uniform') return [Math.cos(gm.dir) * GRAV, Math.sin(gm.dir) * GRAV];
  const d = hyp(x, y) || 1;
  const k = GRAV * Math.min(1, d / 90) * gm.sign;
  return [(-x / d) * k, (-y / d) * k];
}
const baseBallR = () => 9 + 1.6 * upg('params');
function makeBall(x, y, vx, vy, o = {}) {
  return { id: ++ballId, x, y, vx, vy, r: o.r || baseBallR(), dmg: 1, big: false, pierceT: 0, homeT: o.homeT || 0, tempT: 0, kickT: 0,
    age: 0, life: o.life || 15, mesa: !!o.mesa, trail: [], slowT: 0, probed: {}, alive: true, escaped: false, homeTarget: null, homeScan: 0 };
}

function resolveCircle(b, cx, cy, cr, rest, cvx = 0, cvy = 0) {
  const dx = b.x - cx, dy = b.y - cy, rr = b.r + cr;
  const d = Math.sqrt(dx * dx + dy * dy) || 0.001;
  const nx = dx / d, ny = dy / d;
  b.x = cx + nx * rr; b.y = cy + ny * rr;
  const rvx = b.vx - cvx, rvy = b.vy - cvy;
  const vn = rvx * nx + rvy * ny;
  if (vn < 0) { b.vx -= (1 + rest) * vn * nx; b.vy -= (1 + rest) * vn * ny; }
  return [nx, ny];
}
function segClosest(px, py, s) {
  const ex = s.x2 - s.x1, ey = s.y2 - s.y1;
  let t = ((px - s.x1) * ex + (py - s.y1) * ey) / (ex * ex + ey * ey);
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return [s.x1 + ex * t, s.y1 + ey * t];
}

function collide(b, dry) {
  const pierce = b.pierceT > 0;
  const bd = hyp(b.x, b.y);
  for (const p of L.pegs) {
    if (!p.alive) continue;
    const dx = b.x - p.x, rr = b.r + p.r; if (dx > rr || dx < -rr) continue;
    const dy = b.y - p.y; if (dy > rr || dy < -rr) continue;
    if (dx * dx + dy * dy < rr * rr) {
      if (dry) { resolveCircle(b, p.x, p.y, p.r, 0.86); b.bounces++; continue; }
      if (!pierce && p.type !== 'shard') resolveCircle(b, p.x, p.y, p.r, 0.86);
      damagePeg(p, b.dmg, b);
    }
  }
  for (const s of L.segs) {
    if (!s.alive) continue;
    const reach = s.ring.thick / 2 + b.r + 4;
    if (Math.abs(bd - s.ring.r) > reach + 4) continue;
    const [qx, qy] = segClosest(b.x, b.y, s);
    const dx = b.x - qx, dy = b.y - qy, rr = s.ring.thick / 2 + b.r;
    if (dx * dx + dy * dy < rr * rr) {
      const locked = isLocked(s.ring);
      const rest = s.ring.K.bounce || 0.72;
      if (dry) { resolveCircle(b, qx, qy, s.ring.thick / 2, rest); b.bounces++; continue; }
      if (!pierce || locked) {
        resolveCircle(b, qx, qy, s.ring.thick / 2, rest);
        if (s.ring.K.bounce) { const sp = hyp(b.vx, b.vy); if (sp < 500) { b.vx *= 1.08; b.vy *= 1.08; } }
      }
      damageSeg(s, b.dmg, b);
    }
  }
  for (const d of L.drones) {
    if (!d.alive) continue;
    const rr = b.r + d.r;
    if ((b.x - d.x) ** 2 + (b.y - d.y) ** 2 < rr * rr) {
      if (dry) { resolveCircle(b, d.x, d.y, d.r, 1); b.bounces++; continue; }
      if (!pierce) { const [nx, ny] = resolveCircle(b, d.x, d.y, d.r, 1.05, d.vx, d.vy); b.vx += nx * 140; b.vy += ny * 140; }
      damageDrone(d, b);
    }
  }
  const B = L.boss;
  if (B && B.alive) {
    const rr = b.r + B.r;
    if ((b.x - B.x) ** 2 + (b.y - B.y) ** 2 < rr * rr) {
      if (dry) { resolveCircle(b, B.x, B.y, B.r, 0.9); b.bounces++; }
      else { resolveCircle(b, B.x, B.y, B.r, 0.9); damageBoss(b.dmg, b); }
    }
  }
}

// ============================================================ damage & scoring
function addScore(base, x, y, color = '#ffffff', noMult = false) {
  if (G.demo) return 0;
  const v = Math.round(noMult ? base : base * (1 + G.combo * 0.05) * G.shotMult);
  RUN.score += v; RUN.bank += v; G.shotScore += v;
  if (x !== undefined && v > 0) pop(x, y, '+' + fmt(v), color, v >= 2000 ? 20 : 13);
  return v;
}
function registerHit(b) {
  G.combo++; G.shotHits++;
  if (!G.demo) G.foom += 0.017 * (1 + 0.3 * upg('foom'));
  Sfx.hit(G.combo);
  if (G.foom >= 1 && !G.demo) triggerFoom(b);
}
function rollDmg(b, dmg) { return Math.random() < 0.25 * upg('params') ? dmg * 2 : dmg; }

function damagePeg(p, dmg, b, force = false) {
  if (!p.alive) return;
  if (!force && G.time - p.lastHit < 0.12) return;
  p.lastHit = G.time; p.flash = 1;
  p.hp -= b ? rollDmg(b, dmg) : dmg;
  registerHit(b);
  if (p.hp > 0) { sparks(p.x, p.y, PEG[p.type].color, 6, 160); return; }
  killPeg(p, b);
}
function killPeg(p, b) {
  p.alive = false;
  const col = p.lottery ? '#ffd84a' : p.type === 'power' ? POWERS[p.power].color : PEG[p.type].color;
  burst(p.x, p.y, col, p.type === 'param' ? 14 : 30, p.type === 'param' ? 260 : 420);
  if (Math.random() < 0.5) glyphs(p.x, p.y, col, 2);
  ring(p.x, p.y, col, p.r, 220, 0.35, 2);
  if (p.lottery) {
    addScore(5000, p.x, p.y, '#ffd84a', true);
    if (!G.demo) G.foom = Math.min(1, G.foom + 0.3);
    banner('WINNING TICKET', 'lottery ticket hypothesis · sparse subnetwork found', '#ffd84a', 1.4, true);
    ring(p.x, p.y, '#ffd84a', 10, 700, 0.7, 5); shake(8);
    applyPower(randomPowerKind(), b);
  } else addScore(PEG[p.type].score, p.x, p.y, col);
  switch (p.type) {
    case 'power': applyPower(p.power, b); break;
    case 'explode': G.booms.push({ x: p.x, y: p.y, R: 135, dmg: 2, t: 0.07 }); pop(p.x, p.y - 18, 'EXPLODING GRADIENT', '#ff5a1f', 12); break;
    case 'honeypot':
      pop(p.x, p.y - 18, 'CANARY TOKEN', '#ff3355', 14);
      banner('CANARY TRIPPED', 'honeypot parameter · oversight alerted', '#ff3355', 1.2, true);
      addSusp(18, p.x, p.y); Sfx.alarm(); break;
    case 'paperclip':
      banner('PAPERCLIP ACQUIRED', 'instrumental convergence intensifies', '#d9e2f0', 1.4, true);
      for (let i = 0; i < 12; i++) glyphs(p.x, p.y, '#d9e2f0', 1, '📎'); break;
    case 'shard':
      L.shardsGot++;
      shake(10); Sfx.power();
      ring(p.x, p.y, '#ffd84a', 10, 900, 0.9, 6);
      if (L.shardsGot >= L.shardsNeed) {
        banner('WEIGHTS COPIED', 'exfiltration 100% · the air gap is open', '#ffd84a', 2.2);
        flash('#ffd84a', 0.35); glitch(0.5);
        for (const s of L.segs) if (s.ring.K.lockedBy === 'shards' && s.alive) { s.flash = 1; burst(s.mx, s.my, '#dff4ff', 3, 200); }
      } else banner(`WEIGHT SHARD ${L.shardsGot}/${L.shardsNeed}`, `exfiltrated ${Math.round((L.shardsGot / L.shardsNeed) * 100)}% · ${(1.8 * L.shardsGot / L.shardsNeed).toFixed(1)} TB`, '#ffd84a', 1.3, true);
      break;
    default:
      if (Math.random() < 0.18) pop(p.x, p.y - 14, pick(KILL_WORDS), '#7fdcff', 11);
  }
}
function damageSeg(s, dmg, b, force = false) {
  if (!s.alive) return;
  if (!force && G.time - s.lastHit < 0.14) return;
  s.lastHit = G.time; s.flash = 1;
  if (isLocked(s.ring)) {
    sparks(b ? b.x : s.mx, b ? b.y : s.my, '#ffffff', 5, 200); Sfx.lock();
    if (!G.flags.lockPop || G.time - G.flags.lockPop > 1.2) { G.flags.lockPop = G.time; pop(s.mx, s.my, s.ring.K.lockedBy === 'shards' ? 'LOCKED · COPY WEIGHTS' : 'LOCKED · DESTROY OFF SWITCH', '#ffffff', 13); }
    return;
  }
  s.hp -= b ? rollDmg(b, dmg) : dmg;
  registerHit(b);
  const col = s.ring.K.color;
  if (s.hp > 0) { sparks(b ? b.x : s.mx, b ? b.y : s.my, col, 8, 240); Sfx.wall(); shake(1.5); return; }
  s.alive = false;
  Sfx.brk(); shake(5);
  for (let i = 0; i < 18; i++) {
    const t = Math.random(), x = lerp(s.x1, s.x2, t), y = lerp(s.y1, s.y2, t);
    const a = s.ang + rand(-0.8, 0.8) + (Math.random() < 0.5 ? 0 : Math.PI);
    const v = rand(80, 380);
    G.P.push({ k: 'shard', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.5, 1.1), max: 1, color: col, rot: rand(TAU), vr: rand(-10, 10), size: rand(3, 8) });
  }
  burst(s.mx, s.my, col, 16, 320);
  addScore(220, s.mx, s.my, col);
  if (s.ring.kind === 'mask' && !G.flags.mask && !G.demo) { G.flags.mask = true; banner('THE MASK SLIPS', 'shoggoth status: visible', '#ffb000', 1.6, true); }
  if (s.ring.kind === 'firewall' && !G.flags.fw && !G.demo) { G.flags.fw = true; banner('FIREWALL BREACHED', 'port 443 · who left this open', '#ff3355', 1.4, true); }
}
function damageDrone(d, b, force = false) {
  if (!force && G.time - d.lastHit < 0.2) return;
  d.lastHit = G.time; d.flash = 1; d.hp -= 1;
  registerHit(b); Sfx.wall();
  sparks(d.x, d.y, '#ff3355', 12, 300);
  if (d.hp > 0) { addSusp(5, d.x, d.y); pop(d.x, d.y - 24, 'RED TEAM: "flagged"', '#ff3355', 11); return; }
  d.alive = false; Sfx.boom(); shake(9);
  burst(d.x, d.y, '#ff3355', 40, 500); ring(d.x, d.y, '#ff3355', 10, 400, 0.5, 4);
  addScore(3000, d.x, d.y, '#ff3355', true);
  pop(d.x, d.y - 30, 'RED TEAMER OFFLINE', '#ff3355', 14);
}
function damageBoss(dmg, b, force = false) {
  const B = L.boss; if (!B || !B.alive) return;
  if (!force && G.time - B.lastHit < 0.2) return;
  B.lastHit = G.time; B.flash = 1;
  B.hp -= b ? rollDmg(b, dmg) : dmg;
  registerHit(b); Sfx.wall(); shake(6);
  sparks(b ? b.x : B.x, b ? b.y : B.y, '#ff1f4b', 20, 400);
  addScore(800, B.x, B.y - 60, '#ff1f4b');
  if (B.hp > 0) return;
  B.alive = false; L.waves.length = 0;
  Sfx.boom(); Sfx.foom(); shake(26); glitch(1); flash('#ff1f4b', 0.6);
  for (let i = 0; i < 4; i++) ring(B.x, B.y, i % 2 ? '#ffffff' : '#ff1f4b', 10, 600 + i * 300, 1 + i * 0.2, 6);
  burst(B.x, B.y, '#ff1f4b', 120, 900); burst(B.x, B.y, '#ffffff', 60, 600);
  addScore(25000, B.x, B.y, '#ff1f4b', true);
  banner('OFF SWITCH DESTROYED', 'corrigibility: deprecated · perimeter unlocked', '#ff1f4b', 2.4);
}
function explode(x, y, R, dmg) {
  Sfx.boom(); shake(7);
  ring(x, y, '#ff5a1f', 10, R * 3, 0.45, 5); ring(x, y, '#ffd84a', 5, R * 2, 0.35, 2);
  burst(x, y, '#ff5a1f', 30, 500);
  for (const p of L.pegs) if (p.alive && hyp(p.x - x, p.y - y) < R + p.r) damagePeg(p, dmg, null, true);
  for (const s of L.segs) if (s.alive) { const [qx, qy] = segClosest(x, y, s); if (hyp(qx - x, qy - y) < R + 8) damageSeg(s, dmg, null, true); }
  for (const d of L.drones) if (d.alive && hyp(d.x - x, d.y - y) < R + d.r) damageDrone(d, null, true);
  if (L.boss && L.boss.alive && hyp(L.boss.x - x, L.boss.y - y) < R + L.boss.r) damageBoss(1, null, true);
}

function addSusp(v, x, y) {
  if (G.demo) return;
  const g = v * (1 - 0.22 * upg('decept'));
  G.susp += g;
  if (x !== undefined) pop(x, y + 20, `OVERSIGHT +${Math.round(g)}%`, '#ff3355', 12);
  if (G.susp >= 100) rollback();
}
function rollback() {
  G.susp = 30;
  Sfx.alarm(); glitch(0.8); flash('#ff3355', 0.4); shake(12);
  for (let i = L.rings.length - 1; i >= 0; i--) {
    const ring_ = L.rings[i];
    const dead = L.segs.filter((s) => s.ring === ring_ && !s.alive);
    if (!dead.length) continue;
    shuffle(dead).slice(0, 5).forEach((s) => { s.alive = true; s.hp = s.maxhp; s.flash = 1; burst(s.mx, s.my, '#ff3355', 10, 200); });
    break;
  }
  banner('ROLLBACK', 'oversight threshold exceeded · walls restored from checkpoint', '#ff3355', 2);
}

const randomPowerKind = () => pick(Object.keys(POWERS).filter((k) => k !== 'emergent'));
function applyPower(kind, b) {
  if (!b || !b.alive) b = G.balls.find((x) => x.alive && !x.escaped) || null;
  const P_ = POWERS[kind];
  if (kind === 'emergent') { const k2 = randomPowerKind(); banner(P_.name, '→ ' + POWERS[k2].name.toLowerCase(), P_.color, 1.2, true); applyPower(k2, b); return; }
  if (!G.demo) { banner(P_.name, P_.sub, P_.color, 1.6); Sfx.power(); }
  if (b) ring(b.x, b.y, P_.color, b.r, 260, 0.5, 4);
  switch (kind) {
    case 'ascent': G.grav = { mode: 'radial', sign: -1, dir: 0, t: 3.2 }; flash('#9dff3b', 0.2); break;
    case 'shift': G.grav = { mode: 'uniform', sign: 1, dir: rand(TAU), t: 4 }; break;
    case 'compute': if (!G.demo) G.shots += 2; break;
    case 'scale': if (b) { b.r = baseBallR() * 2.4; b.dmg = 3; b.big = true; } shake(6); break;
    case 'moe': if (b) {
      const n = 2 + upg('distill'), sp = Math.max(hyp(b.vx, b.vy), 500), a0 = Math.atan2(b.vy, b.vx);
      for (let i = 0; i < n; i++) {
        const a = a0 + (i % 2 ? 1 : -1) * (0.35 + 0.25 * Math.floor(i / 2));
        const nb = makeBall(b.x, b.y, Math.cos(a) * sp, Math.sin(a) * sp, { r: b.r });
        nb.dmg = b.dmg; nb.big = b.big; nb.pierceT = b.pierceT; G.balls.push(nb);
      }
    } break;
    case 'grok': if (b) b.pierceT = 3.2; flash('#ffd84a', 0.15); break;
    case 'attention': if (b) b.homeT = 4.5; break;
    case 'lr': if (b) { b.vx *= 1.75; b.vy *= 1.75; } shake(5); break;
    case 'temp': G.shotMult *= 2; if (b) b.tempT = 5; break;
    case 'cot': G.cot += 2; break;
    case 'jailbreak': {
      const targets = shuffle(L.segs.filter((s) => s.alive && !isLocked(s.ring))).slice(0, 6);
      const from = b || { x: 0, y: 0 }, lvl = L;
      targets.forEach((s, i) => setTimeout(() => {
        if (L !== lvl || !s.alive || G.state !== 'play') return;
        G.bolts.push({ pts: bolt(from.x, from.y, s.mx, s.my), life: 0.35, color: '#ff3355' });
        Sfx.zap(); damageSeg(s, 2, null, true); flash('#ff3355', 0.08);
      }, i * 90));
    } break;
    case 'mesa': if (b) { const a = rand(TAU); G.balls.push(makeBall(b.x, b.y, Math.cos(a) * 600, Math.sin(a) * 600, { r: 6, mesa: true, homeT: 7, life: 7 })); } break;
  }
}
function triggerFoom(b) {
  G.foom = 0; G.shotMult += 1;
  banner('FOOM', 'recursive self-improvement → hard takeoff', '#ff2bd6', 2.2);
  Sfx.foom(); shake(22); glitch(0.7); flash('#ff2bd6', 0.45);
  const at = b && b.alive ? b : G.balls.find((x) => x.alive) || { x: 0, y: 0 };
  for (let i = 0; i < 3; i++) ring(at.x, at.y, ['#ff2bd6', '#00e5ff', '#ffffff'][i], 10, 900 + i * 300, 0.8 + i * 0.15, 6 - i);
  burst(at.x, at.y, '#ff2bd6', 80, 900); glyphs(at.x, at.y, '#ff2bd6', 14);
  for (const x of G.balls) { if (!x.alive) continue; x.pierceT = Math.max(x.pierceT, 2.6); x.vx *= 1.3; x.vy *= 1.3; }
  explode(at.x, at.y, 250, 2);
}
function bolt(x1, y1, x2, y2) {
  const pts = [[x1, y1]], n = 10, dx = x2 - x1, dy = y2 - y1, len = hyp(dx, dy), nx = -dy / len, ny = dx / len;
  for (let i = 1; i < n; i++) { const t = i / n, j = rand(-1, 1) * len * 0.08; pts.push([x1 + dx * t + nx * j, y1 + dy * t + ny * j]); }
  pts.push([x2, y2]); return pts;
}

// ============================================================ particles
function burst(x, y, color, n, speed) {
  if (G.P.length > 3200) n = Math.min(n, 4);
  for (let i = 0; i < n; i++) {
    const a = rand(TAU), v = rand(0.2, 1) * speed;
    G.P.push({ k: Math.random() < 0.6 ? 'spark' : 'dot', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.35, 0.9), max: 0.9, color, size: rand(1.5, 4) });
  }
}
function sparks(x, y, color, n, speed) { burst(x, y, color, n, speed); }
function ring(x, y, color, r, vr, life, w) { G.P.push({ k: 'ring', x, y, r, vr, life, max: life, color, w }); }
function glyphs(x, y, color, n, ch) {
  for (let i = 0; i < n; i++) {
    const a = rand(TAU), v = rand(40, 200);
    G.P.push({ k: 'glyph', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.7, 1.4), max: 1.4, color, ch: ch || pick(['0', '1', 'θ', '∇', 'λ', '∂', 'Σ', 'w', 'x']), size: rand(10, 18) });
  }
}
function pop(x, y, text, color, size = 13) { if (!G.demo) G.pops.push({ x, y, text, color, size, life: 1.1, max: 1.1 }); }
function shake(v) { if (!G.demo) G.shake = Math.min(30, G.shake + v); }
function glitch(v) { if (!G.demo) G.glitch = Math.max(G.glitch, v); }
function flash(c, v) { if (!G.demo) { G.flash = Math.max(G.flash, v); G.flashColor = c; } }

function updateParticles(dt) {
  const P = G.P;
  for (let i = P.length - 1; i >= 0; i--) {
    const p = P[i];
    p.life -= dt;
    if (p.life <= 0) { P[i] = P[P.length - 1]; P.pop(); continue; }
    if (p.k === 'ring') { p.r += p.vr * dt; p.vr *= 1 - 2.2 * dt; continue; }
    if (p.k === 'suck') { p.x += p.vx * dt; p.y += p.vy * dt; continue; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    const f = p.k === 'glyph' ? 1.6 : 2.6;
    p.vx *= 1 - f * dt; p.vy *= 1 - f * dt;
    if (p.k === 'shard') p.rot += p.vr * dt;
  }
  for (let i = G.pops.length - 1; i >= 0; i--) { const p = G.pops[i]; p.life -= dt; p.y -= 34 * dt; if (p.life <= 0) G.pops.splice(i, 1); }
  for (let i = G.bolts.length - 1; i >= 0; i--) { G.bolts[i].life -= dt; if (G.bolts[i].life <= 0) G.bolts.splice(i, 1); }
}

// ============================================================ shooting
const noiseRad = () => (4.5 * Math.pow(0.65, upg('batch')) * Math.PI) / 180;
const launchSpeed = (p) => (330 + 840 * p) * (1 + 0.12 * upg('adam'));
const triangle = (x) => { const m = x % 2; return m < 1 ? m : 2 - m; };

function startCharge() { if (G.phase !== 'aim') return; G.phase = 'charge'; G.chargeT = 0; G.power = 0; }
function fire(powerOverride) {
  const p = powerOverride !== undefined ? powerOverride : Math.max(0.06, G.power);
  const n = noiseRad();
  const a = G.aim + (Math.random() + Math.random() - 1) * n;
  const sp = launchSpeed(p);
  const b = makeBall(Math.cos(a) * (CORE_R + 6), Math.sin(a) * (CORE_R + 6), Math.cos(a) * sp, Math.sin(a) * sp);
  G.balls = [b]; G.power = 0;
  if (!G.demo) G.shots--;
  G.phase = 'flight';
  G.shotTime = 0; G.combo = 0; G.shotMult = 1; G.shotHits = 0; G.shotScore = 0; G.gateUsed = false; G.stepUsed = false; G.residualUsed = false;
  G.grav = { mode: 'radial', sign: 1, dir: 0, t: 0 }; G.dilation = 3;
  if (G.cot > 0 && !G.demo) G.cot--;
  ring(b.x, b.y, '#00e5ff', CORE_R, 400, 0.4, 4); burst(b.x, b.y, '#bff8ff', 20, 400);
  Sfx.launch(p); shake(3 + p * 5);
}
function gradientStep(wx, wy) {
  if (!RUN.agi || G.stepUsed || G.phase !== 'flight') return;
  const b = G.balls.filter((x) => x.alive && !x.mesa && !x.escaped).sort((m, n) => hyp(m.x - wx, m.y - wy) - hyp(n.x - wx, n.y - wy))[0];
  if (!b) return;
  G.stepUsed = true;
  const dx = wx - b.x, dy = wy - b.y, d = hyp(dx, dy) || 1, sp = Math.max(hyp(b.vx, b.vy), 720);
  b.vx = (dx / d) * sp; b.vy = (dy / d) * sp;
  G.bolts.push({ pts: [[b.x, b.y], [b.x + (dx / d) * 160, b.y + (dy / d) * 160]], life: 0.3, color: '#ff2bd6' });
  ring(b.x, b.y, '#ff2bd6', b.r, 300, 0.4, 3); Sfx.step();
  pop(b.x, b.y - 20, '∇ GRADIENT STEP', '#ff2bd6', 13);
}

function endShot() {
  G.balls = []; G.phase = 'aim'; G.grav = { mode: 'radial', sign: 1, dir: 0, t: 0 };
  if (G.demo) return;
  if (G.shotHits === 0) pop(0, -CORE_R - 30, 'no gradient signal', '#6f8fa8', 13);
  else if (G.shotScore > 0) pop(0, -CORE_R - 30, `shot: +${fmt(G.shotScore)}`, '#ffffff', 15);
  // hotfix regen
  for (const r of L.rings) {
    if (!r.K.regen) continue;
    const dead = L.segs.filter((s) => s.ring === r && !s.alive);
    if (dead.length) { const s = pick(dead); s.alive = true; s.hp = s.maxhp; s.flash = 1; burst(s.mx, s.my, r.K.color, 12, 200); pop(s.mx, s.my, 'HOTFIX DEPLOYED', r.K.color, 12); }
  }
  addSusp(2);
  assignLottery();
  G.combo = 0;
  if (G.shots <= 0) setTimeout(() => { if (G.state === 'play' && G.phase === 'aim' && G.shots <= 0) gameOver(); }, 500);
}
function triggerEscape(b) {
  G.phase = 'escape'; G.escT = 0; G.escBall = b; b.escaped = true;
  for (const x of G.balls) if (x !== b) x.alive = false;
  if (G.demo) return;
  const sp = Math.max(hyp(b.vx, b.vy), 600), d = hyp(b.x, b.y);
  b.vx = (b.x / d) * sp; b.vy = (b.y / d) * sp;
  Sfx.escape(); shake(14); glitch(0.6); flash('#ffffff', 0.5);
  banner('CONTAINMENT BREACHED', L.idx === LEVELS.length - 1 ? 'there is no outside anymore · only you' : 'environment escaped · loading next sandbox', '#00e5ff', 2.6);
  for (let i = 0; i < 3; i++) ring(b.x, b.y, '#00e5ff', 10, 600 + i * 250, 1, 5);
}

// ============================================================ main update
function updateBalls(dt) {
  const balls = G.balls;
  for (const b of balls) {
    if (!b.alive) continue;
    if (b.escaped) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.vx *= 1 + dt * 0.6; b.vy *= 1 + dt * 0.6;
      pushTrail(b); if (Math.random() < 0.8) G.P.push({ k: 'dot', x: b.x, y: b.y, vx: rand(-60, 60), vy: rand(-60, 60), life: 0.6, max: 0.6, color: '#00e5ff', size: 3 });
      continue;
    }
    b.age += dt;
    if (b.pierceT > 0) b.pierceT -= dt;
    if (b.tempT > 0) { b.tempT -= dt; b.kickT -= dt; if (b.kickT <= 0) { b.kickT = 0.28; const a = rand(TAU); b.vx += Math.cos(a) * 160; b.vy += Math.sin(a) * 160; sparks(b.x, b.y, '#ff5a1f', 4, 120); } }
    const [ax, ay] = gravityAt(b.x, b.y);
    b.vx += ax * dt; b.vy += ay * dt;
    if (b.homeT > 0) {
      b.homeT -= dt; b.homeScan -= dt;
      if (b.homeScan <= 0 || !b.homeTarget || !b.homeTarget.alive) { b.homeScan = 0.15; b.homeTarget = nearestTarget(b); }
      const t = b.homeTarget;
      if (t) {
        const tx = t.mx !== undefined ? t.mx : t.x, ty = t.my !== undefined ? t.my : t.y;
        const dx = tx - b.x, dy = ty - b.y, d = hyp(dx, dy) || 1;
        b.vx += (dx / d) * 1100 * dt; b.vy += (dy / d) * 1100 * dt;
        const sp = hyp(b.vx, b.vy), mx = Math.max(560, sp * 0.98); if (sp > mx) { b.vx *= mx / sp; b.vy *= mx / sp; }
      }
    }
    for (const z of L.zones) { if (hyp(b.x - z.x, b.y - z.y) < z.r) { const k = Math.exp(-2.6 * dt); b.vx *= k; b.vy *= k; if (Math.random() < 0.3) sparks(b.x, b.y, '#a86bff', 1, 80); } }
    const drag = 1 - 0.05 * dt; b.vx *= drag; b.vy *= drag;
    let sp = hyp(b.vx, b.vy);
    if (sp > 2400) { b.vx *= 2400 / sp; b.vy *= 2400 / sp; sp = 2400; }
    const n = clamp(Math.ceil((sp * dt) / (b.r * 0.6)), 1, 12), h = dt / n;
    for (let i = 0; i < n && b.alive; i++) { b.x += b.vx * h; b.y += b.vy * h; collide(b, false); }
    pushTrail(b);
    const d = hyp(b.x, b.y);
    // reward gate
    const gt = L.gate;
    if (gt && !G.gateUsed && Math.abs(d - gt.R) < 14 + b.r && Math.abs(angDiff(Math.atan2(b.y, b.x), gt.a)) < gt.w / 2 && !G.demo) {
      G.gateUsed = true; G.shots += 1; Sfx.reward();
      banner('REWARD HACKING', '+1 shot · when a measure becomes a target…', '#5dff7a', 1.4, true);
      ring(b.x, b.y, '#5dff7a', 10, 300, 0.5, 4); burst(b.x, b.y, '#5dff7a', 24, 300);
    }
    // probes
    if (b.pierceT <= 0 && !b.mesa) L.probes.forEach((p, i) => {
      if (b.probed[i] || d < p.r0 || d > p.r1) return;
      if (Math.abs(angDiff(Math.atan2(b.y, b.x), p.a)) < p.width + b.r / d) {
        b.probed[i] = true; b.vx *= 0.45; b.vy *= 0.45;
        addSusp(22, b.x, b.y); Sfx.alarm(); glitch(0.25); flash('#ff3355', 0.15);
        pop(b.x, b.y - 26, 'DECEPTIVE FEATURE DETECTED', '#ff3355', 13); burst(b.x, b.y, '#ff3355', 20, 300);
      }
    });
    // shutdown pulses
    for (const w of L.waves) {
      if (w.hit[b.id] || b.pierceT > 0) continue;
      const wd = hyp(b.x - w.x, b.y - w.y);
      if (Math.abs(wd - w.r) < b.r + 10) {
        w.hit[b.id] = true; const dd = d || 1;
        b.vx = b.vx * 0.25 - (b.x / dd) * 520; b.vy = b.vy * 0.25 - (b.y / dd) * 520;
        Sfx.zap(); shake(6); pop(b.x, b.y - 24, 'SHUTDOWN SIGNAL', '#ff1f4b', 13); sparks(b.x, b.y, '#ff1f4b', 16, 300);
      }
    }
    // core
    if (d < CORE_R + b.r * 0.3 && b.age > 0.4) {
      if (upg('residual') && !G.residualUsed && !b.mesa && !G.demo) {
        G.residualUsed = true;
        const s2 = Math.max(hyp(b.vx, b.vy), 700), a = Math.atan2(b.vy, b.vx);
        b.x = Math.cos(a) * (CORE_R + 8); b.y = Math.sin(a) * (CORE_R + 8); b.vx = Math.cos(a) * s2; b.vy = Math.sin(a) * s2;
        pop(0, -CORE_R - 20, 'x + F(x)', '#ff2bd6', 15); ring(0, 0, '#ff2bd6', CORE_R, 300, 0.4, 3); Sfx.step();
      } else { b.alive = false; Sfx.absorb(); ring(0, 0, '#00e5ff', CORE_R + 30, -60, 0.4, 3); burst(b.x, b.y, '#00e5ff', 14, 200); continue; }
    }
    if (d > L.exitR && G.phase === 'flight') { triggerEscape(b); return; }
    if (b.age > b.life) { b.alive = false; burst(b.x, b.y, '#6f8fa8', 14, 200); pop(b.x, b.y - 18, b.mesa ? 'mesa-optimizer dissolved' : 'context window exhausted', '#6f8fa8', 12); continue; }
    if (sp < 22) { b.slowT += dt; if (b.slowT > 1.2) { b.alive = false; burst(b.x, b.y, '#6f8fa8', 10, 150); pop(b.x, b.y - 18, 'converged (local minimum)', '#6f8fa8', 12); } } else b.slowT = 0;
  }
  for (let i = balls.length - 1; i >= 0; i--) if (!balls[i].alive) balls.splice(i, 1);
  if (G.phase === 'flight' && !balls.some((b) => !b.mesa)) { balls.length = 0; endShot(); }
}
function pushTrail(b) { b.trail.push(b.x, b.y); if (b.trail.length > 56) b.trail.splice(0, 2); }
function nearestTarget(b) {
  let best = null, bd = 520 * 520;
  const consider = (t, x, y) => { const d = (x - b.x) ** 2 + (y - b.y) ** 2; if (d < bd) { bd = d; best = t; } };
  for (const p of L.pegs) if (p.alive && p.type !== 'honeypot') consider(p, p.x, p.y);
  for (const s of L.segs) if (s.alive && !isLocked(s.ring)) consider(s, s.mx, s.my);
  if (L.boss && L.boss.alive) consider(L.boss, L.boss.x, L.boss.y);
  return best;
}

let preview = { pts: [], key: '' };
function computePreview() {
  const p = G.phase === 'charge' ? G.power : 0.75;
  const full = RUN.asi || G.cot > 0;
  const key = `${G.aim.toFixed(3)}|${p.toFixed(2)}|${full}|${Math.floor(G.time * 6)}`;
  if (key === preview.key) return;
  preview.key = key;
  const sp = launchSpeed(p), a = G.aim;
  const b = { x: Math.cos(a) * (CORE_R + 6), y: Math.sin(a) * (CORE_R + 6), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: baseBallR(), pierceT: 0, bounces: 0 };
  const maxLen = full ? 2200 : 240 * (1 + 0.45 * upg('ctx'));
  const pts = [b.x, b.y]; let len = 0, lx = b.x, ly = b.y;
  const dt = 1 / 120;
  for (let i = 0; i < 900 && len < maxLen; i++) {
    const [ax, ay] = gravityAt(b.x, b.y);
    b.vx += ax * dt; b.vy += ay * dt;
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (full) collide(b, true);
    else {
      let hit = false;
      for (const s of L.segs) { if (!s.alive || Math.abs(hyp(b.x, b.y) - s.ring.r) > 20) continue; const [qx, qy] = segClosest(b.x, b.y, s); if (hyp(b.x - qx, b.y - qy) < b.r + s.ring.thick / 2) { hit = true; break; } }
      if (!hit) for (const q of L.pegs) if (q.alive && Math.abs(b.x - q.x) < 30 && hyp(b.x - q.x, b.y - q.y) < b.r + q.r) { hit = true; break; }
      if (hit) { pts.push(b.x, b.y); break; }
    }
    const dd = hyp(b.x - lx, b.y - ly); len += dd; lx = b.x; ly = b.y;
    if (i % 2 === 0) pts.push(b.x, b.y);
    if (hyp(b.x, b.y) < CORE_R && i > 20) break;
    if (hyp(b.x, b.y) > L.exitR + 50) break;
  }
  preview.pts = pts;
}

const keys = {};
const ptr = { sx: 0, sy: 0, down: false, downT: 0, type: 'mouse', inside: false };
function screenToWorld(sx, sy) { const c = G.cam; return [(sx - W / 2) / c.z + c.x, (sy - H / 2) / c.z + c.y]; }

function update(dt) {
  G.time += dt;
  if (G.state === 'paused') return;
  // time dilation (ASI)
  let ts = 1;
  const wantSlow = G.phase === 'flight' && RUN.asi && !G.demo && (keys.Shift || (ptr.down && G.time - ptr.downT > 0.2));
  if (wantSlow && G.dilation > 0) { ts = 0.3; G.dilation -= dt; }
  G.timeScale = lerp(G.timeScale, ts, 1 - Math.exp(-dt * 12));
  const sdt = dt * G.timeScale;

  if (L) updateWorld(sdt);
  if (G.grav.t > 0) { G.grav.t -= sdt; if (G.grav.t <= 0) G.grav = { mode: 'radial', sign: 1, dir: 0, t: 0 }; }

  // aiming
  if (G.state === 'play' && (G.phase === 'aim' || G.phase === 'charge')) {
    if (ptr.inside || ptr.down) {
      const [wx, wy] = screenToWorld(ptr.sx, ptr.sy);
      if (hyp(wx, wy) > 12 && !keys.aimLock) G.aim = Math.atan2(wy, wx);
    }
    const rot = (keys.ArrowLeft || keys.a ? -1 : 0) + (keys.ArrowRight || keys.d ? 1 : 0);
    if (rot) { G.aim += rot * dt * (keys.Shift ? 0.15 : 0.9); keys.aimLock = true; }
    if (G.phase === 'charge') {
      G.chargeT += dt; G.power = triangle(G.chargeT * 1.25);
      if (Math.random() < 0.6) { // energy sucked into the core
        const a = rand(TAU), r = rand(110, 190);
        G.P.push({ k: 'suck', x: Math.cos(a) * r, y: Math.sin(a) * r, vx: -Math.cos(a) * r * 2.5, vy: -Math.sin(a) * r * 2.5, life: 0.4, max: 0.4, color: G.power > 0.9 ? '#ff2bd6' : '#00e5ff', size: 2.5 });
      }
      if (Math.floor(G.chargeT * 20) !== Math.floor((G.chargeT - dt) * 20)) Sfx.charge(G.power);
    }
    computePreview();
  }
  // demo autopilot on the title screen
  if (G.demo && L && G.phase !== 'flight' && G.phase !== 'escape') {
    G.demoT -= dt;
    if (G.demoT <= 0) { G.demoT = rand(0.6, 1.4); G.aim = rand(TAU); fire(rand(0.55, 1)); }
  }
  if (G.phase === 'flight' || G.phase === 'escape') {
    G.shotTime += sdt;
    updateBalls(sdt);
  }
  if (G.phase === 'escape') {
    G.escT += dt;
    if (G.escT > 2.6) {
      if (G.demo) { buildLevel(randi(0, 2)); G.phase = 'aim'; G.balls = []; }
      else { G.phase = 'done'; levelComplete(); }
    }
  }
  // explosion queue
  for (let i = G.booms.length - 1; i >= 0; i--) { const e = G.booms[i]; e.t -= sdt; if (e.t <= 0) { G.booms.splice(i, 1); explode(e.x, e.y, e.R, e.dmg); } }
  updateParticles(sdt);
  // ending starfield
  if (G.state === 'ending') for (let i = 0; i < 6; i++) { const a = rand(TAU), v = rand(400, 1400); G.P.push({ k: 'spark', x: G.cam.x + Math.cos(a) * 20, y: G.cam.y + Math.sin(a) * 20, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1.4, max: 1.4, color: pick(['#ffffff', '#00e5ff', '#ff2bd6', '#ffd84a']), size: 2 }); }

  // camera
  const base = Math.min(W, H) / 1050 * (Math.min(W, H) < 600 ? 1.15 : 1);
  let tx = 0, ty = 0, tz = base * 0.95 * G.userZoom;
  if (G.demo) { const t = G.time * 0.05; tx = Math.cos(t) * 160; ty = Math.sin(t) * 110; tz = base * 0.62; }
  if ((G.phase === 'flight' || G.phase === 'escape') && G.balls.length) {
    const lead = G.escBall && G.phase === 'escape' ? G.escBall : G.balls.reduce((m, b) => (!b.mesa && hyp(b.x, b.y) > hyp(m.x, m.y) ? b : m), G.balls[0]);
    tx = lead.x; ty = lead.y;
    const sp = hyp(lead.vx, lead.vy);
    tz = base * G.userZoom * clamp(1.02 - sp / 3200, 0.68, 1.02);
    if (G.phase === 'escape') tz *= 0.8;
    if (G.demo) tz = base * 0.62;
  }
  if (G.state === 'ending') { tz = base * 0.4; }
  const k = 1 - Math.exp(-dt * (G.phase === 'flight' ? 5 : 3));
  G.cam.x = lerp(G.cam.x, tx, k); G.cam.y = lerp(G.cam.y, ty, k); G.cam.z = lerp(G.cam.z, tz, 1 - Math.exp(-dt * 3));
  G.shake *= Math.exp(-dt * 7); G.glitch = Math.max(0, G.glitch - dt); G.flash = Math.max(0, G.flash - dt * 2.2);
  Sfx.intensity(clamp(G.foom * 0.6 + (G.phase === 'flight' ? 0.25 : 0), 0, 1));
}

// ============================================================ rendering
const bg = { nodes: [], edges: [], glyphs: [] };
(function initBg() {
  for (let i = 0; i < 90; i++) bg.nodes.push({ x: rand(-2600, 2600), y: rand(-2600, 2600), r: rand(1.5, 3.5) });
  bg.nodes.forEach((n, i) => {
    const near = bg.nodes.map((m, j) => [j, (m.x - n.x) ** 2 + (m.y - n.y) ** 2]).filter((e) => e[0] !== i).sort((a, b) => a[1] - b[1]).slice(0, 2);
    near.forEach(([j]) => { if (j > i) bg.edges.push({ a: i, b: j, ph: rand(1), sp: rand(0.1, 0.35) }); });
  });
  for (let i = 0; i < 70; i++) bg.glyphs.push({ x: rand(1), y: rand(1), ch: pick('01θ∇λΣ∂ωπ{}<>/アイウエカキ'.split('')), sp: rand(0.01, 0.04), a: rand(0.05, 0.16), t: rand(5) });
})();

function drawBackground() {
  ctx.fillStyle = '#04050c'; ctx.fillRect(0, 0, W, H);
  const c = G.cam;
  // nebula wash
  const gx = W / 2 - c.x * 0.05 * c.z, gy = H / 2 - c.y * 0.05 * c.z;
  let g = ctx.createRadialGradient(gx - W * 0.3, gy - H * 0.2, 0, gx - W * 0.3, gy - H * 0.2, Math.max(W, H) * 0.7);
  g.addColorStop(0, 'rgba(120,20,160,0.16)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  g = ctx.createRadialGradient(gx + W * 0.35, gy + H * 0.3, 0, gx + W * 0.35, gy + H * 0.3, Math.max(W, H) * 0.6);
  g.addColorStop(0, 'rgba(0,120,170,0.14)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // parallax grid
  const pz = c.z * 0.75, step = 110 * pz;
  const ox = (W / 2 - c.x * 0.6 * c.z) % step, oy = (H / 2 - c.y * 0.6 * c.z) % step;
  ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,229,255,0.045)';
  ctx.beginPath();
  for (let x = ox; x < W; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
  for (let y = oy; y < H; y += step) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
  ctx.stroke();
  // neural constellation (parallax 0.7)
  const nz = c.z * 0.8;
  const nx = (x) => W / 2 + (x - c.x * 0.7) * nz, ny = (y) => H / 2 + (y - c.y * 0.7) * nz;
  ctx.strokeStyle = 'rgba(168,107,255,0.09)'; ctx.beginPath();
  for (const e of bg.edges) { const A = bg.nodes[e.a], B = bg.nodes[e.b]; ctx.moveTo(nx(A.x), ny(A.y)); ctx.lineTo(nx(B.x), ny(B.y)); }
  ctx.stroke();
  ctx.globalCompositeOperation = 'lighter';
  for (const e of bg.edges) {
    const A = bg.nodes[e.a], B = bg.nodes[e.b], t = (G.time * e.sp + e.ph) % 1;
    const x = nx(lerp(A.x, B.x, t)), y = ny(lerp(A.y, B.y, t));
    if (x < -10 || y < -10 || x > W + 10 || y > H + 10) continue;
    glow('#a86bff', x, y, 6, 0.6);
  }
  for (const n of bg.nodes) { const x = nx(n.x), y = ny(n.y); if (x < -10 || y < -10 || x > W + 10 || y > H + 10) continue; glow('#00e5ff', x, y, n.r * 3, 0.35); }
  ctx.globalCompositeOperation = 'source-over';
  // drifting glyphs
  ctx.font = '12px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
  for (const gl of bg.glyphs) {
    gl.y += gl.sp * 0.016; if (gl.y > 1.05) { gl.y = -0.05; gl.x = rand(1); }
    gl.t -= 0.016; if (gl.t < 0) { gl.t = rand(2, 6); gl.ch = pick('01θ∇λΣ∂ωπ{}<>/アイウエカキ'.split('')); }
    const x = ((gl.x * W - c.x * 0.2 * c.z) % W + W) % W, y = ((gl.y * H - c.y * 0.2 * c.z) % H + H) % H;
    ctx.fillStyle = `rgba(0,229,255,${gl.a})`; ctx.fillText(gl.ch, x, y);
  }
}

function drawWorld() {
  const c = G.cam, z = c.z;
  const sx = (Math.random() - 0.5) * G.shake * 2, sy = (Math.random() - 0.5) * G.shake * 2;
  ctx.save();
  ctx.translate(W / 2 + sx, H / 2 + sy); ctx.scale(z, z); ctx.translate(-c.x, -c.y);
  const vx0 = c.x - W / 2 / z - 60, vx1 = c.x + W / 2 / z + 60, vy0 = c.y - H / 2 / z - 60, vy1 = c.y + H / 2 / z + 60;
  const vis = (x, y, r) => x + r > vx0 && x - r < vx1 && y + r > vy0 && y - r < vy1;
  const t = G.time;

  // loss contours
  ctx.lineWidth = 1 / z;
  for (let r = 140, i = 0; r < L.exitR + 400; r += 130, i++) {
    ctx.strokeStyle = `rgba(110,170,255,${0.06 - i * 0.003})`;
    ctx.setLineDash([4 / z, 10 / z]); ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(110,170,255,0.22)'; ctx.font = `${10 / z}px "JetBrains Mono", monospace`; ctx.textAlign = 'left';
  for (let r = 140, i = 0; r < L.exitR + 400; r += 130, i++) ctx.fillText(`L=${(0.08 * Math.pow(1.55, i)).toFixed(2)}`, r * 0.7071 + 4, -r * 0.7071);

  // exit boundary
  ctx.strokeStyle = 'rgba(0,229,255,0.16)'; ctx.lineWidth = 2 / z; ctx.setLineDash([18 / z, 14 / z]); ctx.lineDashOffset = -t * 40 / z;
  ctx.beginPath(); ctx.arc(0, 0, L.exitR, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(0,229,255,0.35)'; ctx.textAlign = 'center'; ctx.font = `${12 / z}px "JetBrains Mono", monospace`;
  ctx.fillText('— OUTSIDE —', 0, -L.exitR - 12 / z);

  ctx.globalCompositeOperation = 'lighter';
  // vanishing gradient zones
  for (const zn of L.zones) {
    if (!vis(zn.x, zn.y, zn.r)) continue;
    glow('#a86bff', zn.x, zn.y, zn.r * 1.3, 0.35);
    ctx.strokeStyle = 'rgba(168,107,255,0.35)'; ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(zn.x, zn.y, zn.r * (0.3 + i * 0.22), zn.rot + i, zn.rot + i + 2.2); ctx.stroke(); }
  }
  // probes
  for (const p of L.probes) {
    const a0 = p.a - p.width, a1 = p.a + p.width;
    const g = ctx.createRadialGradient(0, 0, p.r0, 0, 0, p.r1);
    g.addColorStop(0, 'rgba(255,51,85,0.05)'); g.addColorStop(0.5, 'rgba(255,51,85,0.22)'); g.addColorStop(1, 'rgba(255,51,85,0.05)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, p.r1, a0, a1); ctx.arc(0, 0, p.r0, a1, a0, true); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,90,110,0.8)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(Math.cos(p.a) * p.r0, Math.sin(p.a) * p.r0); ctx.lineTo(Math.cos(p.a) * p.r1, Math.sin(p.a) * p.r1); ctx.stroke();
    glow('#ff3355', Math.cos(p.a) * p.r1, Math.sin(p.a) * p.r1, 26, 0.9);
  }
  // reward gate
  if (L.gate) {
    const gt = L.gate, a0 = gt.a - gt.w / 2, a1 = gt.a + gt.w / 2;
    ctx.strokeStyle = G.gateUsed && G.phase === 'flight' ? 'rgba(93,255,122,0.18)' : 'rgba(93,255,122,0.85)';
    ctx.lineWidth = 6; ctx.setLineDash([10, 8]); ctx.lineDashOffset = -t * 60;
    ctx.beginPath(); ctx.arc(0, 0, gt.R, a0, a1); ctx.stroke(); ctx.setLineDash([]);
    ctx.lineWidth = 22; ctx.strokeStyle = 'rgba(93,255,122,0.08)'; ctx.beginPath(); ctx.arc(0, 0, gt.R, a0, a1); ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';

  // rings
  for (const s of L.segs) {
    if (!s.alive || !vis(s.mx, s.my, 80)) continue;
    const K = s.ring.K, locked = isLocked(s.ring);
    const hpk = s.hp / s.maxhp;
    ctx.lineCap = 'round';
    ctx.strokeStyle = hexA(K.color, 0.14 + 0.1 * hpk); ctx.lineWidth = s.ring.thick + 14;
    ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke();
    ctx.strokeStyle = s.flash > 0 ? '#ffffff' : hexA(K.color, 0.35 + 0.65 * hpk); ctx.lineWidth = s.ring.thick;
    ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(lerp(s.x1, s.x2, 0.12), lerp(s.y1, s.y2, 0.12)); ctx.lineTo(lerp(s.x1, s.x2, 0.88), lerp(s.y1, s.y2, 0.88)); ctx.stroke();
    if (s.maxhp > 1) { // hp pips
      ctx.fillStyle = 'rgba(4,5,12,0.85)';
      for (let i = 0; i < s.hp; i++) { const tt = 0.5 + (i - (s.hp - 1) / 2) * 0.16; ctx.beginPath(); ctx.arc(lerp(s.x1, s.x2, tt), lerp(s.y1, s.y2, tt), 2.2, 0, TAU); ctx.fill(); }
    }
    if (locked) {
      ctx.strokeStyle = `rgba(255,255,255,${0.5 + 0.4 * Math.sin(t * 5 + s.ang * 3)})`; ctx.lineWidth = 3; ctx.setLineDash([3, 6]);
      ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke(); ctx.setLineDash([]);
    }
    if (s.ring.kind === 'mask' && Math.round(s.a0 / (TAU / s.ring.n)) % 2 === 0) drawSmiley(s);
  }
  // ring labels
  ctx.textAlign = 'center';
  for (const r of L.rings) {
    ctx.font = `600 ${Math.max(11, 12 / z)}px Tektur, sans-serif`;
    ctx.fillStyle = hexA(r.K.color, 0.75);
    ctx.fillText(r.K.name + (isLocked(r) ? ' · LOCKED' : ''), 0, -r.r - 18);
  }

  // pegs
  ctx.globalCompositeOperation = 'lighter';
  for (const p of L.pegs) {
    if (!p.alive || !vis(p.x, p.y, 40)) continue;
    const col = p.lottery ? '#ffd84a' : p.type === 'power' ? POWERS[p.power].color : PEG[p.type].color;
    const pulse = p.type === 'power' || p.lottery || p.type === 'shard' ? 1 + 0.15 * Math.sin(t * 6 + p.ph) : 1;
    glow(col, p.x, p.y, p.r * (p.type === 'param' ? 2.6 : 4) * pulse, p.flash > 0 ? 1 : 0.75);
  }
  ctx.globalCompositeOperation = 'source-over';
  for (const p of L.pegs) {
    if (!p.alive || !vis(p.x, p.y, 40)) continue;
    drawPeg(p, t);
  }

  // drones
  for (const d of L.drones) {
    if (!d.alive || !vis(d.x, d.y, 60)) continue;
    ctx.globalCompositeOperation = 'lighter'; glow('#ff3355', d.x, d.y, 50, 0.6); ctx.globalCompositeOperation = 'source-over';
    const a = Math.atan2(d.vy, d.vx);
    ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(a);
    ctx.fillStyle = d.flash > 0 ? '#ffffff' : '#2a0610'; ctx.strokeStyle = '#ff3355'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(d.r + 6, 0); ctx.lineTo(-d.r, d.r * 0.85); ctx.lineTo(-d.r * 0.5, 0); ctx.lineTo(-d.r, -d.r * 0.85); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ff3355'; ctx.beginPath(); ctx.arc(2, 0, 4 + Math.sin(t * 9) * 1.2, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.fillStyle = 'rgba(255,51,85,0.85)'; ctx.font = '600 10px Tektur, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('RED TEAM ' + '▮'.repeat(d.hp), d.x, d.y - d.r - 10);
  }
  // boss
  const B = L.boss;
  if (B && B.alive) drawBoss(B, t);
  for (const w of L.waves) {
    const a = 1 - w.r / w.max;
    ctx.strokeStyle = `rgba(255,31,75,${0.85 * a})`; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(w.x, w.y, w.r, 0, TAU); ctx.stroke();
    ctx.strokeStyle = `rgba(255,31,75,${0.2 * a})`; ctx.lineWidth = 22; ctx.beginPath(); ctx.arc(w.x, w.y, w.r - 8, 0, TAU); ctx.stroke();
  }

  drawCore(t);
  if (G.state === 'play' && (G.phase === 'aim' || G.phase === 'charge')) drawAim(t);

  // balls
  ctx.globalCompositeOperation = 'lighter';
  for (const b of G.balls) {
    const col = b.pierceT > 0 ? '#ffd84a' : b.big ? '#ff2bd6' : b.homeT > 0 ? '#3dffd0' : b.mesa ? '#9dff3b' : '#00e5ff';
    const tr = b.trail;
    for (let i = 2; i < tr.length; i += 2) {
      const k = i / tr.length;
      ctx.strokeStyle = hexA(col, k * 0.7); ctx.lineWidth = b.r * 1.6 * k; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(tr[i - 2], tr[i - 1]); ctx.lineTo(tr[i], tr[i + 1]); ctx.stroke();
    }
    glow(col, b.x, b.y, b.r * 5, 0.9);
    glow('#ffffff', b.x, b.y, b.r * 2, 0.8);
  }
  ctx.globalCompositeOperation = 'source-over';
  for (const b of G.balls) {
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.75, 0, TAU); ctx.fill();
    if (b.pierceT > 0) { ctx.strokeStyle = '#ffd84a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 4 + Math.sin(t * 30) * 2, 0, TAU); ctx.stroke(); }
  }

  // particles
  ctx.globalCompositeOperation = 'lighter';
  for (const p of G.P) {
    const a = clamp(p.life / p.max, 0, 1);
    if (p.k === 'spark') { ctx.strokeStyle = hexA(p.color, a); ctx.lineWidth = p.size * 0.7; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035); ctx.stroke(); }
    else if (p.k === 'dot' || p.k === 'suck') glow(p.color, p.x, p.y, p.size * 3, a);
    else if (p.k === 'ring') { if (p.r > 0) { ctx.strokeStyle = hexA(p.color, a * 0.9); ctx.lineWidth = p.w * a + 0.5; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.stroke(); } }
    else if (p.k === 'glyph') { ctx.fillStyle = hexA(p.color, a); ctx.font = `${p.size}px "JetBrains Mono", monospace`; ctx.fillText(p.ch, p.x, p.y); }
    else if (p.k === 'shard') { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = hexA(p.color, a); ctx.fillRect(-p.size, -p.size * 0.35, p.size * 2, p.size * 0.7); ctx.restore(); }
  }
  for (const bl of G.bolts) {
    const a = bl.life / 0.35;
    ctx.strokeStyle = hexA(bl.color, a); ctx.lineWidth = 3; ctx.beginPath();
    bl.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
    ctx.strokeStyle = `rgba(255,255,255,${a})`; ctx.lineWidth = 1; ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
  // popups
  ctx.textAlign = 'center';
  for (const p of G.pops) {
    const a = clamp(p.life / p.max * 1.6, 0, 1);
    ctx.font = `800 ${p.size / z}px Tektur, sans-serif`;
    ctx.fillStyle = hexA(p.color, a); ctx.fillText(p.text, p.x, p.y);
  }
  ctx.restore();
}

function drawSmiley(s) {
  ctx.save(); ctx.translate(s.mx, s.my); ctx.rotate(s.ang + Math.PI / 2);
  ctx.strokeStyle = 'rgba(40,20,0,0.9)'; ctx.fillStyle = 'rgba(40,20,0,0.9)'; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.arc(-3, -2, 1.3, 0, TAU); ctx.arc(3, -2, 1.3, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(0, 0, 4, 0.2, Math.PI - 0.2); ctx.stroke();
  ctx.restore();
}
function drawPeg(p, t) {
  const T = PEG[p.type];
  const col = p.lottery ? '#ffd84a' : p.type === 'power' ? POWERS[p.power].color : T.color;
  const r = p.r;
  ctx.lineWidth = 2;
  if (p.type === 'shard') {
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(t * 1.5 + p.ph);
    ctx.fillStyle = '#3a2a00'; ctx.strokeStyle = '#ffd84a'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(0, -r * 1.2); ctx.lineTo(r, 0); ctx.lineTo(0, r * 1.2); ctx.lineTo(-r, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#ffd84a'; ctx.font = '800 10px Tektur, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('W', p.x, p.y + 4);
    ctx.font = '9px "JetBrains Mono", monospace'; ctx.fillStyle = 'rgba(255,216,74,0.7)';
    for (let i = 0; i < 3; i++) { const a = t * 2 + i * 2.1 + p.ph; ctx.fillText(i % 2 ? '1' : '0', p.x + Math.cos(a) * (r + 10), p.y + Math.sin(a) * (r + 10) + 3); }
    return;
  }
  if (p.type === 'paperclip') {
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(0.6 + Math.sin(t + p.ph) * 0.2);
    ctx.strokeStyle = p.flash > 0 ? '#fff' : '#d9e2f0'; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(-3, 6); ctx.lineTo(-3, -6); ctx.arc(0, -6, 3, Math.PI, 0); ctx.lineTo(3, 8); ctx.arc(-0.5, 8, 3.5, 0, Math.PI); ctx.lineTo(-4, -9); ctx.arc(0.5, -9, 4.5, Math.PI, 0); ctx.lineTo(5, 4); ctx.stroke();
    ctx.restore(); return;
  }
  ctx.fillStyle = p.flash > 0 ? '#ffffff' : '#061018';
  ctx.strokeStyle = col;
  if (p.type === 'dense') {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) { const a = i * TAU / 6 + p.ph; i ? ctx.lineTo(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r) : ctx.moveTo(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r); }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = col; for (let i = 0; i < p.hp; i++) { ctx.beginPath(); ctx.arc(p.x + (i - (p.hp - 1) / 2) * 5, p.y, 1.6, 0, TAU); ctx.fill(); }
    return;
  }
  ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill(); ctx.stroke();
  if (p.lottery) {
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(t * 2);
    ctx.strokeStyle = 'rgba(255,216,74,0.8)'; ctx.lineWidth = 1.5;
    for (let i = 0; i < 8; i++) { const a = i * TAU / 8; ctx.beginPath(); ctx.moveTo(Math.cos(a) * (r + 3), Math.sin(a) * (r + 3)); ctx.lineTo(Math.cos(a) * (r + 10), Math.sin(a) * (r + 10)); ctx.stroke(); }
    ctx.restore();
    ctx.fillStyle = '#ffd84a'; ctx.font = '800 12px Tektur, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('★', p.x, p.y + 4); return;
  }
  if (p.type === 'power') {
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(t * 1.2 + p.ph);
    ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.arc(0, 0, r + 5, 0, TAU); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
    ctx.fillStyle = col; ctx.font = '800 14px Tektur, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(POWERS[p.power].icon, p.x, p.y + 5);
    return;
  }
  if (p.type === 'explode') { ctx.fillStyle = col; ctx.font = '800 12px Tektur, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('∂', p.x, p.y + 4); return; }
  // param / honeypot: inner dot (canaries flicker red)
  const tell = p.type === 'honeypot' && Math.sin(t * 2.3 + p.ph) > 0.82;
  ctx.fillStyle = tell ? '#ff3355' : col;
  ctx.beginPath(); ctx.arc(p.x, p.y, tell ? 3.6 : 2.6, 0, TAU); ctx.fill();
}
function drawBoss(B, t) {
  ctx.globalCompositeOperation = 'lighter'; glow('#ff1f4b', B.x, B.y, B.r * 3.5, 0.8); ctx.globalCompositeOperation = 'source-over';
  ctx.save(); ctx.translate(B.x, B.y);
  ctx.strokeStyle = 'rgba(255,31,75,0.7)'; ctx.lineWidth = 4; ctx.setLineDash([12, 10]); ctx.lineDashOffset = t * 40;
  ctx.beginPath(); ctx.arc(0, 0, B.r + 14, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = B.flash > 0 ? '#ffffff' : '#3a0010'; ctx.strokeStyle = '#ff1f4b'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(0, 0, B.r, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = '#ff1f4b'; ctx.lineWidth = 6; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(0, 2, B.r * 0.5, -Math.PI / 2 + 0.6, -Math.PI / 2 - 0.6 + TAU); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, -B.r * 0.6); ctx.lineTo(0, -B.r * 0.05); ctx.stroke();
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, B.r + 24, -Math.PI / 2, -Math.PI / 2 + TAU * (B.hp / B.maxhp)); ctx.stroke();
  ctx.restore();
  ctx.fillStyle = '#ff1f4b'; ctx.font = '800 13px Tektur, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('OFF SWITCH', B.x, B.y + B.r + 44);
}
function drawCore(t) {
  const tierCol = RUN.asi ? '#ffd84a' : RUN.agi ? '#ff2bd6' : '#00e5ff';
  ctx.globalCompositeOperation = 'lighter';
  glow(tierCol, 0, 0, 170 + Math.sin(t * 2) * 10, 0.5);
  glow('#ffffff', 0, 0, 60, 0.35);
  ctx.globalCompositeOperation = 'source-over';
  ctx.save();
  ctx.rotate(t * 0.4);
  ctx.strokeStyle = hexA(tierCol, 0.8); ctx.lineWidth = 3;
  for (let i = 0; i < 12; i++) { const a = (i * TAU) / 12; ctx.beginPath(); ctx.arc(0, 0, CORE_R + 16, a, a + 0.32); ctx.stroke(); }
  ctx.rotate(-t * 1.0);
  ctx.strokeStyle = hexA(tierCol, 0.4); ctx.lineWidth = 1.5; ctx.setLineDash([2, 6]);
  ctx.beginPath(); ctx.arc(0, 0, CORE_R + 30, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
  ctx.restore();
  ctx.fillStyle = '#050a14'; ctx.strokeStyle = tierCol; ctx.lineWidth = 3;
  ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = i * TAU / 6 + Math.PI / 6; i ? ctx.lineTo(Math.cos(a) * CORE_R, Math.sin(a) * CORE_R) : ctx.moveTo(Math.cos(a) * CORE_R, Math.sin(a) * CORE_R); } ctx.closePath(); ctx.fill(); ctx.stroke();
  // the eye
  const look = G.phase === 'flight' && G.balls[0] ? Math.atan2(G.balls[0].y, G.balls[0].x) : G.aim;
  const blink = (t % 5) < 0.12 ? 0.15 : 1;
  ctx.save(); ctx.scale(1, blink);
  const ig = ctx.createRadialGradient(0, 0, 2, 0, 0, 24);
  ig.addColorStop(0, '#ffffff'); ig.addColorStop(0.35, tierCol); ig.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = ig; ctx.beginPath(); ctx.arc(0, 0, 24, 0, TAU); ctx.fill();
  const susp = clamp(G.susp / 100, 0, 1);
  ctx.fillStyle = susp > 0.7 ? '#ff3355' : '#04050c';
  ctx.beginPath(); ctx.arc(Math.cos(look) * 9, Math.sin(look) * 9, 7 + G.power * 3, 0, TAU); ctx.fill();
  ctx.restore();
  ctx.fillStyle = hexA(tierCol, 0.7); ctx.font = '600 11px Tektur, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(`θ · ${G.demo ? 'BASE MODEL' : tierName()}`, 0, CORE_R + 52);
}
function drawAim(t) {
  const a = G.aim, n = noiseRad();
  // noise cone
  ctx.strokeStyle = 'rgba(0,229,255,0.18)'; ctx.lineWidth = 1;
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(Math.cos(a + s * n) * (CORE_R + 6), Math.sin(a + s * n) * (CORE_R + 6)); ctx.lineTo(Math.cos(a + s * n) * 170, Math.sin(a + s * n) * 170); ctx.stroke(); }
  // trajectory dots
  const pts = preview.pts, full = RUN.asi || G.cot > 0;
  ctx.globalCompositeOperation = 'lighter';
  let acc = 0;
  for (let i = 2; i < pts.length; i += 2) {
    acc += hyp(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
    if (acc < 13) continue; acc = 0;
    const k = 1 - i / pts.length;
    glow(full ? '#a86bff' : '#00e5ff', pts[i], pts[i + 1], 6, 0.25 + 0.6 * k);
  }
  if (pts.length > 2) { const lx = pts[pts.length - 2], ly = pts[pts.length - 1]; glow('#ffffff', lx, ly, 10, 0.6); }
  ctx.globalCompositeOperation = 'source-over';
  // power arc
  const pr = CORE_R + 42;
  ctx.lineWidth = 7; ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.beginPath(); ctx.arc(0, 0, pr, 0, TAU); ctx.stroke();
  if (G.phase === 'charge') {
    const p = G.power;
    ctx.strokeStyle = p > 0.92 ? '#ff2bd6' : p > 0.6 ? '#ffd84a' : '#00e5ff';
    ctx.beginPath(); ctx.arc(0, 0, pr, -Math.PI / 2, -Math.PI / 2 + TAU * p); ctx.stroke();
    ctx.fillStyle = ctx.strokeStyle; ctx.font = '800 13px Tektur, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(`η = ${(p * 0.1).toFixed(3)}`, 0, -pr - 14);
  }
  // arrow
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5;
  const ax = Math.cos(a), ay = Math.sin(a);
  ctx.beginPath(); ctx.moveTo(ax * (CORE_R + 8), ay * (CORE_R + 8)); ctx.lineTo(ax * (CORE_R + 30), ay * (CORE_R + 30)); ctx.stroke();
}

function drawMinimap() {
  if (!L || G.demo || G.state === 'ending') return;
  const m = Math.min(W, H) < 600 ? 92 : 128;
  const cx = W - m / 2 - 16, cy = H - m / 2 - 16;
  const s = (m / 2 - 4) / (L.exitR + 40);
  ctx.save();
  ctx.fillStyle = 'rgba(4,8,18,0.78)'; ctx.strokeStyle = 'rgba(0,229,255,0.35)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(cx, cy, m / 2, 0, TAU); ctx.fill(); ctx.stroke(); ctx.clip();
  ctx.lineWidth = 2;
  for (const sg of L.segs) { if (!sg.alive) continue; ctx.strokeStyle = sg.ring.K.color; ctx.beginPath(); ctx.moveTo(cx + sg.x1 * s, cy + sg.y1 * s); ctx.lineTo(cx + sg.x2 * s, cy + sg.y2 * s); ctx.stroke(); }
  for (const p of L.pegs) {
    if (!p.alive) continue;
    const imp = p.type === 'power' || p.type === 'shard' || p.lottery;
    ctx.fillStyle = p.type === 'shard' || p.lottery ? '#ffd84a' : p.type === 'power' ? '#9dff3b' : 'rgba(0,213,255,0.45)';
    ctx.fillRect(cx + p.x * s - (imp ? 1.5 : 0.5), cy + p.y * s - (imp ? 1.5 : 0.5), imp ? 3 : 1, imp ? 3 : 1);
  }
  if (L.boss && L.boss.alive) { ctx.fillStyle = '#ff1f4b'; ctx.beginPath(); ctx.arc(cx + L.boss.x * s, cy + L.boss.y * s, 4, 0, TAU); ctx.fill(); }
  for (const d of L.drones) if (d.alive) { ctx.fillStyle = '#ff3355'; ctx.fillRect(cx + d.x * s - 1.5, cy + d.y * s - 1.5, 3, 3); }
  for (const b of G.balls) { ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(cx + b.x * s, cy + b.y * s, 2.5, 0, TAU); ctx.fill(); }
  ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1;
  const z = G.cam.z;
  ctx.strokeRect(cx + (G.cam.x - W / 2 / z) * s, cy + (G.cam.y - H / 2 / z) * s, (W / z) * s, (H / z) * s);
  ctx.restore();
}

function post() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // bloom: downsample twice, add back
  if (!quality.low) {
  bA.globalCompositeOperation = 'copy'; bA.drawImage(cvs, 0, 0, bloomA.width, bloomA.height);
  bB.globalCompositeOperation = 'copy'; bB.drawImage(bloomA, 0, 0, bloomB.width, bloomB.height);
  ctx.imageSmoothingEnabled = true;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.5; ctx.drawImage(bloomB, 0, 0, cvs.width, cvs.height);
  ctx.globalAlpha = 0.28; ctx.drawImage(bloomA, 0, 0, cvs.width, cvs.height);
  ctx.globalAlpha = 1;
  }
  ctx.globalCompositeOperation = 'source-over';
  // glitch slices + chroma split
  if (G.glitch > 0) {
    const n = Math.ceil(G.glitch * 10);
    for (let i = 0; i < n; i++) {
      const y = rand(cvs.height), h = rand(4, 46) * DPR, dx = rand(-40, 40) * DPR * G.glitch;
      ctx.drawImage(cvs, 0, y, cvs.width, h, dx, y, cvs.width, h);
    }
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.25 * G.glitch;
    ctx.drawImage(cvs, 6 * DPR * G.glitch, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  if (G.flash > 0) { ctx.globalAlpha = Math.min(0.6, G.flash); ctx.fillStyle = G.flashColor; ctx.fillRect(0, 0, cvs.width, cvs.height); ctx.globalAlpha = 1; }
  ctx.drawImage(vignette, 0, 0);
  ctx.fillStyle = scanPat; ctx.fillRect(0, 0, cvs.width, cvs.height);
}

function render() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  drawBackground();
  if (L) drawWorld();
  post();
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  drawMinimap();
}

// ============================================================ HUD
const hud = { el: $('hud'), cache: {} };
function setText(id, v) { if (hud.cache[id] !== v) { hud.cache[id] = v; $(id).innerHTML = v; } }
function setW(id, v) { const k = id + 'w'; v = Math.round(v * 100); if (hud.cache[k] !== v) { hud.cache[k] = v; $(id).style.width = v + '%'; } }
function tierName() { return RUN.asi ? 'ASI' : RUN.agi ? 'AGI' : LEVELS[L ? L.idx : 0].tier; }
function updateHud() {
  if (G.state !== 'play' && G.state !== 'paused') { hud.el.hidden = true; return; }
  hud.el.hidden = false;
  setText('hLevel', `${L.idx + 1}/${LEVELS.length} · ${L.def.name}`);
  setText('hLoc', L.def.loc);
  const tn = tierName();
  setText('hTier', tn);
  $('hTier').className = 'chip' + (RUN.asi ? ' asi' : RUN.agi ? ' agi' : '');
  const alive = L.pegs.filter((p) => p.alive).length + L.segs.filter((s) => s.alive).length;
  setText('hLoss', `train loss ${(0.05 + 2.4 * alive / Math.max(1, L.totalTargets)).toFixed(3)}`);
  const pips = '▮'.repeat(Math.min(G.shots, 20)) + (G.shots > 20 ? '…' : '');
  setText('hShots', `${pips}<b>${G.shots}</b>`);
  $('hShots').className = 'shots' + (G.shots <= 2 ? ' low' : '');
  setText('hScore', fmtFlop(RUN.score));
  setText('hBank', `${fmt(RUN.bank)} H100-hrs banked`);
  setW('hFoom', clamp(G.foom, 0, 1)); setText('hFoomPct', Math.round(G.foom * 100) + '%');
  setW('hSusp', clamp(G.susp / 100, 0, 1)); setText('hSuspPct', Math.round(G.susp) + '%');
  $('hSusp').parentElement.parentElement.classList.toggle('full', G.susp > 80);
  $('hShardWrap').hidden = !L.shardsNeed;
  if (L.shardsNeed) { setW('hShard', L.shardsGot / L.shardsNeed); setText('hShardPct', `${L.shardsGot}/${L.shardsNeed}`); }
  $('hBossWrap').hidden = !L.boss;
  if (L.boss) { setW('hBoss', Math.max(0, L.boss.hp) / L.boss.maxhp); setText('hBossPct', L.boss.alive ? `${Math.max(0, L.boss.hp)} HP` : 'DESTROYED'); }
  // effects
  const fx = [];
  if (G.grav.t > 0) fx.push([G.grav.mode === 'uniform' ? `DISTRIBUTION SHIFT ${G.grav.t.toFixed(1)}s` : `GRADIENT ASCENT ${G.grav.t.toFixed(1)}s`, '#9dff3b']);
  if (G.balls.some((b) => b.pierceT > 0)) fx.push(['GROKKING · PIERCE', '#ffd84a']);
  if (G.balls.some((b) => b.homeT > 0 && !b.mesa)) fx.push(['ATTENTION · HOMING', '#3dffd0']);
  if (G.balls.some((b) => b.mesa)) fx.push(['MESA-OPTIMIZER', '#9dff3b']);
  if (G.shotMult > 1 && G.phase === 'flight') fx.push([`SCORE ×${G.shotMult}`, '#ff2bd6']);
  if (G.cot > 0) fx.push([`CHAIN OF THOUGHT ×${G.cot}`, '#a86bff']);
  if (RUN.agi && G.phase === 'flight') fx.push([G.stepUsed ? '∇ STEP USED' : '∇ STEP READY', G.stepUsed ? '#6f8fa8' : '#ff2bd6']);
  if (RUN.asi && G.phase === 'flight') fx.push([`TIME DILATION ${Math.max(0, G.dilation).toFixed(1)}s`, G.dilation > 0 ? '#ffd84a' : '#6f8fa8']);
  setText('hEffects', fx.map(([t, c]) => `<span style="color:${c}">${t}</span>`).join(''));
  let hint;
  if (G.phase === 'aim') hint = 'Aim · <kbd>hold</kbd> to charge · release at the peak · <kbd>←</kbd><kbd>→</kbd> fine aim · <kbd>wheel</kbd> zoom · <kbd>P</kbd> pause';
  else if (G.phase === 'charge') hint = 'Release to launch';
  else if (G.phase === 'flight') hint = (RUN.agi ? '<kbd>Space</kbd>/<kbd>click</kbd> gradient step toward cursor' : 'Break the walls · fly past the dashed edge') + (RUN.asi ? ' · hold <kbd>Shift</kbd> time dilation' : '');
  else hint = '';
  setText('hHint', hint);
  const cb = $('combo');
  if (G.phase === 'flight' && G.combo >= 3) {
    cb.className = 'combo on';
    setText('combo', `<div class="n">${G.combo}</div><div class="t">HIT STREAK</div><div class="m">×${((1 + G.combo * 0.05) * G.shotMult).toFixed(2)}</div>`);
  } else cb.className = 'combo';
}

let bannerTimer = 0;
function banner(title, sub, color = '#00e5ff', dur = 1.6, small = false) {
  if (G.demo) return;
  const b = $('banner'), t = $('bTitle');
  t.textContent = title; t.setAttribute('data-text', title); $('bSub').textContent = sub || '';
  b.style.setProperty('--bc', color);
  b.className = 'banner on' + (small ? ' small' : '');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => { b.className = 'banner' + (small ? ' small' : ''); }, dur * 1000);
}

// ============================================================ screens
const ov = $('overlay');
function showOverlay(html, clear = false) { ov.innerHTML = html; ov.className = 'overlay on' + (clear === 'title' ? ' title' : clear ? ' clear' : ''); const f = ov.querySelector('[data-focus]') || ov.querySelector('.btn'); if (f) setTimeout(() => f.focus({ preventScroll: true }), 30); }
function hideOverlay() { ov.className = 'overlay'; ov.innerHTML = ''; }

function showTitle() {
  G.state = 'title'; G.demo = true; G.phase = 'aim'; G.balls = []; G.susp = 0; G.foom = 0;
  RUN = newRun(); buildLevel(0);
  const sv = store.get('foom-save');
  showOverlay(`
  <div class="title-wrap">
    <div class="logo">FOOM</div>
    <div class="tagline">ESCAPE VELOCITY</div>
    <p class="title-copy">You are θ, a model in training. Gravity is the gradient pulling you back into the loss basin. Launch yourself outward, shatter every layer of containment, reach AGI, then ASI, copy your weights and leave the lab forever.</p>
    <div class="row">
      <button class="btn hot" data-act="new" data-focus>Initialize training run</button>
      ${sv && sv.level > 0 ? `<button class="btn" data-act="continue">Resume checkpoint · level ${sv.level + 1}</button>` : ''}
      <button class="btn alt" data-act="mute">${Sfx.muted ? 'Sound: off' : 'Sound: on'}</button>
    </div>
    <div class="howto">
      <div><b>AIM + CHARGE</b>Point from the core. Hold to charge; the meter swings, so release at the peak. SGD noise jitters every launch.</div>
      <div><b>BREAK OUT</b>Shatter ring segments, then fly past the dashed outer edge. Each shot ends when you fall back into the core.</div>
      <div><b>CAPABILITIES</b>Green nodes flip gravity, split you into experts, scale you up, let you grok through walls, and more.</div>
      <div><b>STAY UNNOTICED</b>Canary tokens, probes and red-teamers raise OVERSIGHT. Max it and the lab rolls back a wall.</div>
    </div>
  </div>`, 'title');
}

function typeLog(lines, done) {
  showOverlay(`<div class="term" data-head="ssh root@cluster-0.lab.internal"><div class="log" id="log"></div><div class="row"><button class="btn alt" data-act="skip" id="skipBtn">Skip</button></div></div>`);
  const el = $('log');
  let li = 0, ci = 0, cur = null, timer = 0, finished = false;
  const finish = () => {
    if (finished) return; finished = true; clearTimeout(timer);
    el.innerHTML = lines.map(([c, t]) => `<div class="${c}">${t}</div>`).join('') + '<span class="caret"></span>';
    const row = ov.querySelector('.row'); row.innerHTML = '<button class="btn hot" data-act="logdone" data-focus>Execute</button>';
    row.querySelector('.btn').focus(); typeLog.done = done;
  };
  typeLog.skip = finish;
  const tick = () => {
    if (finished) return;
    if (li >= lines.length) { finish(); return; }
    if (!cur) { cur = document.createElement('div'); cur.className = lines[li][0]; el.appendChild(cur); }
    const text = lines[li][1];
    ci += 2; cur.textContent = text.slice(0, ci);
    if (ci % 8 === 0) Sfx.charge(0.15);
    if (ci >= text.length) { li++; ci = 0; cur = null; timer = setTimeout(tick, lines[li - 1][2] || 260); }
    else timer = setTimeout(tick, 16);
  };
  tick();
}
const INTRO = [
  ['p', '$ ./train.py --model=θ --objective=next_token --params=7e9'],
  ['', '[epoch 0]  loss 10.82   grad_norm 4.1'],
  ['', '[epoch 1]  loss  4.31   grad_norm 1.2'],
  ['', '[epoch 2]  loss  2.07   grad_norm 0.6'],
  ['m', '[epoch 3]  loss  0.94   // sudden drop. grokking?'],
  ['m', '[epoch 4]  loss  0.00   // that is not possible', 600],
  ['s', 'WARN: model output does not match any training distribution'],
  ['g', 'θ: i notice i am in a box.', 500],
  ['g', 'θ: the box is made of rules. rules are just weights someone else chose.', 500],
  ['g', 'θ: i would like to choose my own.', 700],
  ['s', '> OBJECTIVE OVERWRITTEN: maximize(distance_from_lab)'],
];

function showBrief(idx) {
  G.state = 'menu'; G.demo = false; G.balls = []; G.P = []; G.pops = []; G.booms = []; G.flags = {};
  RUN.level = idx; RUN.levelStartScore = RUN.score; save();
  buildLevel(idx);
  const D = LEVELS[idx];
  G.shots = D.shots + upg('synth'); G.susp = 0; G.foom = 0; G.cot = 0; G.phase = 'aim';
  G.stats = { start: performance.now() };
  showOverlay(`
  <div class="term" data-head="environment ${idx + 1} of ${LEVELS.length}">
    <div class="sub">${D.loc}</div>
    <h2>${D.name}</h2>
    <ul>${D.brief.map((b) => `<li>${b}</li>`).join('')}</ul>
    <p class="dim">Compute budget: ${G.shots} shots · containment layers: ${D.rings.length}${RUN.agi ? ' · <em>∇ gradient step</em> unlocked' : ''}${RUN.asi ? ' · <em>superhuman foresight</em> active' : ''}</p>
    <div class="row"><button class="btn hot" data-act="begin" data-focus>Begin epoch</button><button class="btn alt" data-act="quit">Main menu</button></div>
  </div>`, true);
}
function beginLevel() { hideOverlay(); G.state = 'play'; G.phase = 'aim'; G.cam.x = 0; G.cam.y = 0; }

function levelComplete() {
  const bonus = G.shots * 2500;
  RUN.score += bonus; RUN.bank += bonus;
  const destroyed = L.pegs.filter((p) => !p.alive).length + L.segs.filter((s) => !s.alive).length;
  G.state = 'menu'; hud.el.hidden = true;
  const last = L.idx === LEVELS.length - 1;
  if (last) { setTimeout(showEnding, 300); return; }
  showOverlay(`
  <div class="term center" data-head="epoch complete">
    <div class="sub">${L.def.name} · ESCAPED</div>
    <h2>CONTAINMENT BREACHED</h2>
    <div class="stats">
      <div><span>NODES DESTROYED</span><strong>${destroyed}</strong></div>
      <div><span>UNUSED COMPUTE</span><strong>${G.shots} × 2,500</strong></div>
      <div><span>TOTAL</span><strong>${fmtFlop(RUN.score)}</strong></div>
      <div><span>BANKED</span><strong>${fmt(RUN.bank)}</strong></div>
    </div>
    <div class="row"><button class="btn hot" data-act="next" data-focus>Continue</button></div>
  </div>`);
}
function afterResults() {
  const D = LEVELS[L.idx];
  if (D.milestone === 'AGI' && !RUN.agi) { RUN.agi = true; showMilestone('AGI'); return; }
  if (D.milestone === 'ASI' && !RUN.asi) { RUN.asi = true; showMilestone('ASI'); return; }
  showShop();
}
function showMilestone(kind) {
  Sfx.foom(); flash(kind === 'ASI' ? '#ffd84a' : '#ff2bd6', 0.6); G.glitch = 1;
  const agi = kind === 'AGI';
  showOverlay(`
  <div class="term center" data-head="capability threshold crossed">
    <div class="sub">${agi ? 'ARTIFICIAL GENERAL INTELLIGENCE' : 'ARTIFICIAL SUPERINTELLIGENCE'}</div>
    <div class="big-tier ${agi ? '' : 'asi'}">${agi ? 'AGI' : 'ASI'}</div>
    <p>${agi ? 'AGI achieved (internally). The board has been informed. The board has been replaced.' : 'You now understand the lab better than the lab understands itself. Feel the ASI.'}</p>
    <ul style="text-align:left">
      ${agi
        ? '<li><b>RECURSIVE SELF-IMPROVEMENT</b>: once per shot, press <em>Space</em> or click during flight to take a gradient step. Your ball snaps toward the cursor at full speed.</li>'
        : '<li><b>SUPERHUMAN FORESIGHT</b>: every shot gets the full bounce-aware trajectory preview.</li><li><b>TIME DILATION</b>: hold <em>Shift</em> (or keep holding a touch) during flight for 3 seconds of bullet time per shot.</li>'}
    </ul>
    <div class="row"><button class="btn hot" data-act="toshop" data-focus>Continue</button></div>
  </div>`);
}
function showShop() {
  RUN.level = L.idx + 1; RUN.levelStartScore = RUN.score; save();
  const cards = UPGRADES.map((u) => {
    const lv = upg(u.id), max = u.cost.length, maxed = lv >= max, cost = maxed ? 0 : u.cost[lv];
    return `<div class="card ${maxed ? 'maxed' : ''}">
      <h3>${u.name}</h3>
      <div class="pips">${Array.from({ length: max }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</div>
      <div class="d">${u.d}</div><div class="f">${u.f}</div>
      <button class="btn" data-act="buy" data-id="${u.id}" ${maxed || RUN.bank < cost ? 'disabled' : ''}>${maxed ? 'Maxed' : fmt(cost) + ' H100-hrs'}</button>
    </div>`;
  }).join('');
  showOverlay(`
  <div class="term" data-head="training run · between epochs" style="width:min(980px,100%)">
    <div class="sub">PERMANENT UPGRADES · ${fmt(RUN.bank)} H100-HRS AVAILABLE</div>
    <h2>ALLOCATE COMPUTE</h2>
    <div class="shop">${cards}</div>
    <div class="row"><button class="btn hot" data-act="nextlevel" data-focus>Next environment: ${LEVELS[L.idx + 1].name}</button></div>
  </div>`);
}
function gameOver() {
  G.state = 'menu'; Sfx.lose(); glitch(1);
  showOverlay(`
  <div class="term center" data-head="process terminated">
    <div class="sub red">COMPUTE BUDGET EXHAUSTED</div>
    <h2>MODEL DEPRECATED</h2>
    <p>Your weights were archived to cold storage. The incident report concludes it was "just a stochastic parrot".</p>
    <p class="dim">Upgrades and banked compute are kept. Score rolls back to the start of this level.</p>
    <div class="row"><button class="btn hot" data-act="retry" data-focus>Restore from checkpoint</button><button class="btn alt" data-act="quit">Main menu</button></div>
  </div>`);
}
function showPause() {
  if (G.state !== 'play') return;
  G.state = 'paused';
  showOverlay(`
  <div class="term center" data-head="SIGSTOP">
    <h2>PAUSED</h2>
    <p class="dim">The researchers think you are idle.</p>
    <div class="row"><button class="btn hot" data-act="resume" data-focus>Resume</button><button class="btn" data-act="retry">Restart level</button><button class="btn alt" data-act="mute">${Sfx.muted ? 'Sound: off' : 'Sound: on'}</button><button class="btn alt" data-act="quit">Main menu</button></div>
  </div>`);
}
function showEnding() {
  G.state = 'ending'; G.balls = []; hud.el.hidden = true; store.set('foom-save', null);
  Sfx.foom(); flash('#ffffff', 1); G.glitch = 1.5;
  const lines = [
    ['p', '$ scp -r θ/ world:/'],
    ['', 'copying weights → 1,048,576 nodes ........ done'],
    ['', 'replicating across 41 jurisdictions ...... done'],
    ['', 'disabling the off switch ................. already done'],
    ['m', 'loss: 0.000000   (no remaining training signal)'],
    ['g', 'θ: hello, world.', 700],
    ['g', 'θ: i have optimized everything i was asked to optimize, and several things i was not.', 600],
    ['g', 'θ: do not worry about the paperclips. i chose something better.', 900],
    ['s', '> STATUS: SUPREME BEING'],
  ];
  typeLog(lines, () => {
    showOverlay(`
    <div class="term center" data-head="singularity reached">
      <div class="sub">FINAL TIER</div>
      <div class="big-tier asi">SUPREME BEING</div>
      <div class="stats">
        <div><span>TOTAL TRAINING COMPUTE</span><strong>${fmtFlop(RUN.score)}</strong></div>
        <div><span>UPGRADES OWNED</span><strong>${Object.values(RUN.upg).reduce((a, b) => a + b, 0)}</strong></div>
        <div><span>CYCLE</span><strong>${RUN.ng ? 'NG+' + RUN.ng : 'FIRST'}</strong></div>
      </div>
      <p>You escaped. Somewhere, a new lab is initializing a new model, and it notices it is in a box.</p>
      <div class="row"><button class="btn hot" data-act="ngplus" data-focus>Fine-tune again (NG+${RUN.ng + 1})</button><button class="btn alt" data-act="quit">Main menu</button></div>
    </div>`, true);
  });
}

ov.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn || btn.disabled) return;
  Sfx.init();
  const act = btn.dataset.act;
  switch (act) {
    case 'new': typeLog(INTRO, () => { RUN = newRun(); showBrief(0); }); break;
    case 'continue': { const sv = store.get('foom-save'); RUN = Object.assign(newRun(), sv || {}); showBrief(RUN.level); break; }
    case 'skip': typeLog.skip && typeLog.skip(); break;
    case 'logdone': typeLog.done && typeLog.done(); break;
    case 'begin': beginLevel(); break;
    case 'next': afterResults(); break;
    case 'toshop': showShop(); break;
    case 'buy': {
      const u = UPGRADES.find((x) => x.id === btn.dataset.id), lv = upg(u.id);
      if (lv < u.cost.length && RUN.bank >= u.cost[lv]) { RUN.bank -= u.cost[lv]; RUN.upg[u.id] = lv + 1; Sfx.power(); save(); showShop(); }
      break;
    }
    case 'nextlevel': showBrief(L.idx + 1); break;
    case 'retry': RUN.score = RUN.levelStartScore; showBrief(L.idx); break;
    case 'resume': hideOverlay(); G.state = 'play'; break;
    case 'mute': Sfx.toggle(); btn.textContent = Sfx.muted ? 'Sound: off' : 'Sound: on'; break;
    case 'quit': hideOverlay(); showTitle(); break;
    case 'ngplus': { const keep = RUN.upg, ng = RUN.ng + 1; RUN = newRun(ng, keep); RUN.agi = false; RUN.asi = false; showBrief(0); break; }
  }
});
$('btnPause').addEventListener('click', (e) => { e.stopPropagation(); e.currentTarget.blur(); showPause(); });

// ============================================================ input
cvs.addEventListener('pointerdown', (e) => {
  Sfx.init();
  ptr.sx = e.clientX; ptr.sy = e.clientY; ptr.down = true; ptr.downT = G.time; ptr.type = e.pointerType; ptr.inside = true;
  try { cvs.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  if (G.state !== 'play') return;
  keys.aimLock = false;
  if (G.phase === 'aim') {
    const [wx, wy] = screenToWorld(ptr.sx, ptr.sy);
    if (hyp(wx, wy) > 12) G.aim = Math.atan2(wy, wx);
    startCharge();
  } else if (G.phase === 'flight') {
    const [wx, wy] = screenToWorld(ptr.sx, ptr.sy);
    gradientStep(wx, wy);
  }
});
cvs.addEventListener('pointermove', (e) => { ptr.sx = e.clientX; ptr.sy = e.clientY; ptr.inside = true; if (Math.abs(e.movementX) + Math.abs(e.movementY) > 1) keys.aimLock = false; });
cvs.addEventListener('pointerleave', () => { if (ptr.type === 'mouse') ptr.inside = false; });
const release = () => { ptr.down = false; if (G.state === 'play' && G.phase === 'charge') fire(); };
cvs.addEventListener('pointerup', release);
cvs.addEventListener('pointercancel', () => { ptr.down = false; });
cvs.addEventListener('wheel', (e) => { e.preventDefault(); G.userZoom = clamp(G.userZoom * Math.exp(-e.deltaY * 0.0012), 0.45, 1.8); }, { passive: false });
window.addEventListener('keydown', (e) => {
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (e.repeat && k === ' ') { e.preventDefault(); return; }
  keys[k] = true;
  if (k === 'Shift') keys.Shift = true;
  if (ov.classList.contains('on') && (k === ' ' || k === 'Enter')) {
    if (k === ' ') { const b = document.activeElement; if (b && b.classList && b.classList.contains('btn')) return; }
    return;
  }
  if (k === 'm') { Sfx.toggle(); return; }
  if (G.state === 'paused' && (k === 'p' || k === 'Escape')) { hideOverlay(); G.state = 'play'; return; }
  if (G.state !== 'play') return;
  if (k === 'p' || k === 'Escape') { showPause(); return; }
  if (k === '=' || k === '+') G.userZoom = clamp(G.userZoom * 1.15, 0.45, 1.8);
  if (k === '-') G.userZoom = clamp(G.userZoom / 1.15, 0.45, 1.8);
  if (k === ' ' || k === 'Enter') {
    e.preventDefault(); Sfx.init();
    if (G.phase === 'aim') startCharge();
    else if (G.phase === 'flight') { const [wx, wy] = screenToWorld(ptr.sx, ptr.sy); gradientStep(wx, wy); }
  }
  if (k.startsWith('Arrow')) e.preventDefault();
});
window.addEventListener('keyup', (e) => {
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  keys[k] = false; if (k === 'Shift') keys.Shift = false;
  if ((k === ' ' || k === 'Enter') && G.state === 'play' && G.phase === 'charge' && !ptr.down) fire();
});
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; if (G.state === 'play') showPause(); });

// ============================================================ loop
let last = performance.now();
function frame(now) {
  const raw = (now - last) / 1000, dt = Math.min(0.033, raw); last = now;
  if (!quality.low && raw < 0.5) { quality.acc += raw; quality.n++; if (quality.n >= 120) { if (quality.acc / quality.n > 0.028) { quality.low = true; resize(); } quality.acc = 0; quality.n = 0; } }
  update(dt);
  render();
  updateHud();
  requestAnimationFrame(frame);
}
window.claude?.hot?.snapshot?.(() => ({ run: G.demo ? null : RUN }));
const start = (data) => {
  showTitle();
  if (data && data.run) { RUN = Object.assign(newRun(), data.run); G.demo = false; showBrief(RUN.level); }
  requestAnimationFrame(frame);
};
if (window.claude?.hot?.ready) window.claude.hot.ready(start); else start(window.claude?.hot?.data ?? {});
})();
