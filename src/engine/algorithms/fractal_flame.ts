import type { Algorithm, RenderContext, AlgorithmState } from '@/engine/types';

// ─── Fractal Flame using IFS ──────────────────────────────────────────────────

interface IFSFunction {
  a: number; b: number; c: number;
  d: number; e: number; f: number;
  color: number;   // 0..1
  weight: number;  // relative probability
  variationWeights: number[];
}

interface FractalFlameState {
  histogram: Float32Array;   // [width * height * 4] r,g,b,count
  functions: IFSFunction[];
  iterBuf: { x: number; y: number; c: number };
  totalIter: number;
  width: number;
  height: number;
  preset: string;
  colorMode: string;
  needsReset: boolean;
}

// ─── Variations ───────────────────────────────────────────────────────────────

type Variation = (x: number, y: number, params?: number[]) => [number, number];

const variations: Variation[] = [
  // 0: linear
  (x, y) => [x, y],
  // 1: sinusoidal
  (x, y) => [Math.sin(x), Math.sin(y)],
  // 2: spherical
  (x, y) => { const r2 = x*x + y*y + 1e-10; return [x/r2, y/r2]; },
  // 3: swirl
  (x, y) => {
    const r2 = x*x + y*y;
    return [x*Math.sin(r2) - y*Math.cos(r2), x*Math.cos(r2) + y*Math.sin(r2)];
  },
  // 4: horseshoe
  (x, y) => { const r = Math.sqrt(x*x + y*y) + 1e-10; return [(x-y)*(x+y)/r, 2*x*y/r]; },
  // 5: polar
  (x, y) => {
    const r = Math.sqrt(x*x + y*y) + 1e-10;
    const theta = Math.atan2(y, x);
    return [theta / Math.PI, r - 1];
  },
  // 6: bent
  (x, y) => {
    const nx = x < 0 ? 2*x : x;
    const ny = y < 0 ? y/2 : y;
    return [nx, ny];
  },
  // 7: waves
  (x, y, p) => {
    const b = p ? p[0] : 0.3;
    const e = p ? p[1] : 0.3;
    const c2 = p ? p[2] : 0.5;
    const f = p ? p[3] : 0.5;
    return [x + b*Math.sin(y/(c2*c2 + 1e-10)), y + e*Math.sin(x/(f*f + 1e-10))];
  },
  // 8: fisheye
  (x, y) => {
    const r = Math.sqrt(x*x + y*y) + 1e-10;
    const s = 2 / (r + 1);
    return [s*y, s*x];
  },
  // 9: julia
  (x, y) => {
    const r = Math.pow(x*x + y*y, 0.25);
    const theta = Math.atan2(y, x) / 2 + (Math.random() > 0.5 ? Math.PI : 0);
    return [r*Math.cos(theta), r*Math.sin(theta)];
  },
  // 10: power
  (x, y) => {
    const r = Math.sqrt(x*x + y*y) + 1e-10;
    const theta = Math.atan2(y, x);
    const s = Math.pow(r, Math.sin(theta));
    return [s*Math.cos(theta), s*Math.sin(theta)];
  },
];

// ─── Presets ─────────────────────────────────────────────────────────────────

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function generateFunctions(
  numFunctions: number,
  preset: string,
): IFSFunction[] {
  const rng = seededRandom(preset === 'random' ? Date.now() % 100000 : preset.charCodeAt(0) * 997);

  const makeAffine = () => ({
    a: (rng() - 0.5) * 1.8, b: (rng() - 0.5) * 1.8, c: (rng() - 0.5),
    d: (rng() - 0.5) * 1.8, e: (rng() - 0.5) * 1.8, f: (rng() - 0.5),
  });

  switch (preset) {
    case 'phoenix': {
      return [
        { ...makeAffine(), a: 0.3, b: -0.4, d: 0.4, e: 0.3, c: 0.1, f: -0.1, color: 0, weight: 1, variationWeights: [0.5, 0, 0.3, 0.2, 0, 0, 0, 0, 0, 0, 0] },
        { ...makeAffine(), a: -0.3, b: 0.4, d: -0.4, e: -0.3, c: -0.1, f: 0.1, color: 0.33, weight: 1, variationWeights: [0.3, 0.7, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
        { ...makeAffine(), a: 0.6, b: 0, d: 0, e: 0.6, c: 0.2, f: 0.2, color: 0.66, weight: 0.7, variationWeights: [0.2, 0, 0, 0.5, 0.3, 0, 0, 0, 0, 0, 0] },
        { ...makeAffine(), a: 0.4, b: 0.2, d: -0.2, e: 0.4, c: -0.3, f: 0.1, color: 1, weight: 0.5, variationWeights: [0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0.5, 0] },
      ].slice(0, numFunctions);
    }
    case 'galaxy': {
      return [
        { a: 0.5, b: -0.5, c: 0, d: 0.5, e: 0.5, f: 0, color: 0, weight: 1, variationWeights: [0, 0.5, 0, 0.5, 0, 0, 0, 0, 0, 0, 0] },
        { a: 0.5, b: 0.5, c: 0, d: -0.5, e: 0.5, f: 0, color: 0.5, weight: 1, variationWeights: [0.3, 0, 0.3, 0.4, 0, 0, 0, 0, 0, 0, 0] },
        { a: 0.7, b: 0, c: 0.2, d: 0, e: 0.7, f: -0.2, color: 0.25, weight: 0.8, variationWeights: [0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0] },
        { a: -0.4, b: 0.3, c: -0.1, d: -0.3, e: -0.4, f: 0.1, color: 0.75, weight: 0.5, variationWeights: [0.5, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0] },
      ].slice(0, numFunctions);
    }
    case 'flower': {
      return [
        { a: 0.8, b: 0, c: 0, d: 0, e: 0.8, f: 0, color: 0, weight: 1, variationWeights: [0.4, 0.6, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
        { a: 0.3, b: -0.3, c: 0.1, d: 0.3, e: 0.3, f: -0.1, color: 0.33, weight: 1, variationWeights: [0.3, 0, 0, 0.7, 0, 0, 0, 0, 0, 0, 0] },
        { a: -0.3, b: 0.3, c: -0.1, d: -0.3, e: -0.3, f: 0.1, color: 0.66, weight: 1, variationWeights: [0.3, 0, 0, 0.7, 0, 0, 0, 0, 0, 0, 0] },
        { a: 0.5, b: 0.3, c: 0, d: -0.3, e: 0.5, f: 0, color: 1, weight: 0.6, variationWeights: [0, 0.5, 0, 0, 0.5, 0, 0, 0, 0, 0, 0] },
      ].slice(0, numFunctions);
    }
    default: { // random
      return Array.from({ length: numFunctions }, (_, i) => {
        const varWeights = Array.from({ length: 11 }, () => rng());
        const sum = varWeights.reduce((a, b) => a + b, 0);
        const normalized = varWeights.map(w => w / sum);
        return {
          ...makeAffine(),
          color: i / numFunctions,
          weight: 0.5 + rng() * 0.5,
          variationWeights: normalized,
        };
      });
    }
  }
}

function applyFunction(fn: IFSFunction, x: number, y: number): [number, number] {
  const nx = fn.a * x + fn.b * y + fn.c;
  const ny = fn.d * x + fn.e * y + fn.f;
  let rx = 0, ry = 0;
  const wsum = fn.variationWeights.reduce((a, b) => a + b, 0) + 1e-10;
  for (let v = 0; v < variations.length; v++) {
    const w = fn.variationWeights[v];
    if (w < 0.001) continue;
    const [vx, vy] = variations[v](nx, ny);
    rx += (w / wsum) * vx;
    ry += (w / wsum) * vy;
  }
  return [rx, ry];
}

// Color maps
function colorMap(c: number, mode: string): [number, number, number] {
  switch (mode) {
    case 'electric': {
      const h = c * 240 + 180;
      const [r, g, b] = hslToRgb(h % 360, 100, 60);
      return [r, g, b];
    }
    case 'nebula': {
      if (c < 0.33) {
        const t = c / 0.33;
        return [Math.round(t * 100), 0, Math.round(150 + t * 105)];
      } else if (c < 0.66) {
        const t = (c - 0.33) / 0.33;
        return [Math.round(100 + t * 155), Math.round(t * 100), 255];
      } else {
        const t = (c - 0.66) / 0.34;
        return [255, Math.round(100 + t * 155), Math.round(255 - t * 100)];
      }
    }
    case 'crystal': {
      if (c < 0.5) {
        const t = c / 0.5;
        return [Math.round(t * 100), Math.round(200 + t * 55), Math.round(200 + t * 55)];
      } else {
        const t = (c - 0.5) / 0.5;
        return [Math.round(100 + t * 155), 255, Math.round(255 - t * 100)];
      }
    }
    default: { // fire
      if (c < 0.25) {
        const t = c / 0.25;
        return [Math.round(t * 180), 0, 0];
      } else if (c < 0.5) {
        const t = (c - 0.25) / 0.25;
        return [180 + Math.round(t * 75), Math.round(t * 100), 0];
      } else if (c < 0.75) {
        const t = (c - 0.5) / 0.25;
        return [255, 100 + Math.round(t * 155), 0];
      } else {
        const t = (c - 0.75) / 0.25;
        return [255, 255, Math.round(t * 255)];
      }
    }
  }
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

export const fractal_flame: Algorithm = {
  meta: {
    id: 'fractal_flame',
    name: 'Fractal Flame',
    description: 'IFS fractal flames with log-density tone mapping and multiple variations',
    category: 'fractal',
    tags: ['fractal', 'flame', 'ifs', 'chaos', 'attractor'],
    animated: false,
    gpuHeavy: true,
    defaultParams: {
      numFunctions: 4,
      iterations: 100000,
      colorMode: 'fire',
      zoom: 1,
      rotation: 0,
      gamma: 2.2,
      brightness: 1.5,
      preset: 'random',
    },
    paramSchema: [
      { key: 'numFunctions', label: 'Num Functions', type: 'int',   min: 2,     max: 8,      step: 1 },
      { key: 'iterations',   label: 'Iterations',    type: 'int',   min: 10000, max: 500000, step: 10000 },
      { key: 'colorMode',    label: 'Color Mode',    type: 'select', options: [
        { value: 'fire',     label: 'Fire' },
        { value: 'electric', label: 'Electric' },
        { value: 'nebula',   label: 'Nebula' },
        { value: 'crystal',  label: 'Crystal' },
      ]},
      { key: 'zoom',         label: 'Zoom',          type: 'float', min: 0.1,   max: 3,      step: 0.05 },
      { key: 'rotation',     label: 'Rotation',      type: 'float', min: 0,     max: 360,    step: 1 },
      { key: 'gamma',        label: 'Gamma',         type: 'float', min: 1,     max: 5,      step: 0.1 },
      { key: 'brightness',   label: 'Brightness',    type: 'float', min: 0.5,   max: 3,      step: 0.1 },
      { key: 'preset',       label: 'Preset',        type: 'select', options: [
        { value: 'phoenix', label: 'Phoenix' },
        { value: 'galaxy',  label: 'Galaxy' },
        { value: 'flower',  label: 'Flower' },
        { value: 'random',  label: 'Random' },
      ]},
    ],
  },

  init(ctx: RenderContext): FractalFlameState {
    const numFunctions = (ctx.params.numFunctions as number) ?? 4;
    const preset = (ctx.params.preset as string) ?? 'random';
    const colorMode = (ctx.params.colorMode as string) ?? 'fire';
    const { width, height } = ctx;

    const functions = generateFunctions(numFunctions, preset);
    const histogram = new Float32Array(width * height * 4);

    return {
      histogram, functions,
      iterBuf: { x: Math.random() * 2 - 1, y: Math.random() * 2 - 1, c: 0 },
      totalIter: 0,
      width, height,
      preset, colorMode,
      needsReset: false,
    };
  },

  update(ctx: RenderContext, state: FractalFlameState): void {
    const { width, height } = ctx;
    const iterations = (ctx.params.iterations as number) ?? 100000;
    const preset = (ctx.params.preset as string) ?? 'random';
    const numFunctions = (ctx.params.numFunctions as number) ?? 4;
    const colorMode = (ctx.params.colorMode as string) ?? 'fire';
    const zoom = (ctx.params.zoom as number) ?? 1;

    // Reset if settings changed
    if (state.preset !== preset || state.functions.length !== numFunctions ||
        state.colorMode !== colorMode || state.width !== width || state.height !== height) {
      state.functions = generateFunctions(numFunctions, preset);
      state.histogram = new Float32Array(width * height * 4);
      state.iterBuf = { x: Math.random() * 2 - 1, y: Math.random() * 2 - 1, c: 0 };
      state.totalIter = 0;
      state.width = width;
      state.height = height;
      state.preset = preset;
      state.colorMode = colorMode;
    }

    if (state.totalIter >= iterations) return;

    // Build cumulative weight table
    const totalWeight = state.functions.reduce((s, f) => s + f.weight, 0);
    const cumWeights: number[] = [];
    let cum = 0;
    for (const fn of state.functions) {
      cum += fn.weight / totalWeight;
      cumWeights.push(cum);
    }

    let { x, y, c } = state.iterBuf;
    const stepsThisFrame = Math.min(10000, iterations - state.totalIter);

    const cx = width / 2;
    const cy = height / 2;
    const scale = Math.min(width, height) * 0.4 * zoom;
    const rotation = ((ctx.params.rotation as number) ?? 0) * Math.PI / 180;
    const cosR = Math.cos(rotation);
    const sinR = Math.sin(rotation);

    for (let iter = 0; iter < stepsThisFrame; iter++) {
      // Pick function
      const r = Math.random();
      let fi = 0;
      while (fi < cumWeights.length - 1 && r > cumWeights[fi]) fi++;
      const fn = state.functions[fi];

      // Apply function
      [x, y] = applyFunction(fn, x, y);

      // Update color
      c = (c + fn.color) * 0.5;

      // Skip first 20 warmup iterations
      if (iter < 20 && state.totalIter === 0) continue;

      // Apply rotation
      const rx = cosR * x - sinR * y;
      const ry = sinR * x + cosR * y;

      // Map to screen
      const px = Math.floor(cx + rx * scale);
      const py = Math.floor(cy + ry * scale);

      if (px >= 0 && px < width && py >= 0 && py < height) {
        const idx = (py * width + px) * 4;
        const [cr, cg, cb] = colorMap(c, state.colorMode);
        state.histogram[idx]     += cr;
        state.histogram[idx + 1] += cg;
        state.histogram[idx + 2] += cb;
        state.histogram[idx + 3] += 1;
      }
    }

    state.iterBuf = { x, y, c };
    state.totalIter += stepsThisFrame;
  },

  render(ctx: RenderContext, state: FractalFlameState): void {
    const { ctx: c, width, height } = ctx;
    const gamma = (ctx.params.gamma as number) ?? 2.2;
    const brightness = (ctx.params.brightness as number) ?? 1.5;

    c.fillStyle = '#000000';
    c.fillRect(0, 0, width, height);

    if (state.totalIter === 0) return;

    // Find max density for log normalization
    let maxCount = 0;
    for (let i = 3; i < state.histogram.length; i += 4) {
      if (state.histogram[i] > maxCount) maxCount = state.histogram[i];
    }
    if (maxCount === 0) return;

    const logMax = Math.log(maxCount + 1);
    const imgData = ctx.imageData;
    const data = imgData.data;

    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        const hi = (py * width + px) * 4;
        const count = state.histogram[hi + 3];
        if (count === 0) continue;

        // Log density tone mapping
        const logDensity = Math.log(count + 1) / logMax;
        const alpha = Math.pow(logDensity, 1 / gamma) * brightness;
        const clampedAlpha = Math.min(1, alpha);

        const di = hi;
        const invCount = 1 / count;
        data[di]     = Math.min(255, Math.round(state.histogram[hi]     * invCount * clampedAlpha * 2));
        data[di + 1] = Math.min(255, Math.round(state.histogram[hi + 1] * invCount * clampedAlpha * 2));
        data[di + 2] = Math.min(255, Math.round(state.histogram[hi + 2] * invCount * clampedAlpha * 2));
        data[di + 3] = Math.min(255, Math.round(clampedAlpha * 255));
      }
    }

    c.putImageData(imgData, 0, 0);
  },
};

export default fractal_flame;
