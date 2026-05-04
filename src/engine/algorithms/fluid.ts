import type { Algorithm, RenderContext, AlgorithmState } from '@/engine/types';

// ─── Jos Stam Stable Fluids on 128×128 grid ──────────────────────────────────

const N = 128;
const SIZE = (N + 2) * (N + 2);

function idx(x: number, y: number): number {
  return x + (N + 2) * y;
}

function addSource(x: Float32Array, s: Float32Array, dt: number): void {
  for (let i = 0; i < SIZE; i++) x[i] += dt * s[i];
}

function setBnd(b: number, x: Float32Array): void {
  for (let i = 1; i <= N; i++) {
    x[idx(0, i)]     = b === 1 ? -x[idx(1, i)]     : x[idx(1, i)];
    x[idx(N + 1, i)] = b === 1 ? -x[idx(N, i)]     : x[idx(N, i)];
    x[idx(i, 0)]     = b === 2 ? -x[idx(i, 1)]     : x[idx(i, 1)];
    x[idx(i, N + 1)] = b === 2 ? -x[idx(i, N)]     : x[idx(i, N)];
  }
  x[idx(0, 0)]         = 0.5 * (x[idx(1, 0)]         + x[idx(0, 1)]);
  x[idx(0, N + 1)]     = 0.5 * (x[idx(1, N + 1)]     + x[idx(0, N)]);
  x[idx(N + 1, 0)]     = 0.5 * (x[idx(N, 0)]         + x[idx(N + 1, 1)]);
  x[idx(N + 1, N + 1)] = 0.5 * (x[idx(N, N + 1)]     + x[idx(N + 1, N)]);
}

function diffuse(b: number, x: Float32Array, x0: Float32Array, diff: number, dt: number): void {
  const a = dt * diff * N * N;
  for (let k = 0; k < 20; k++) {
    for (let j = 1; j <= N; j++) {
      for (let i = 1; i <= N; i++) {
        x[idx(i, j)] = (x0[idx(i, j)] + a * (
          x[idx(i - 1, j)] + x[idx(i + 1, j)] +
          x[idx(i, j - 1)] + x[idx(i, j + 1)]
        )) / (1 + 4 * a);
      }
    }
    setBnd(b, x);
  }
}

function advect(b: number, d: Float32Array, d0: Float32Array, u: Float32Array, v: Float32Array, dt: number): void {
  const dt0 = dt * N;
  for (let j = 1; j <= N; j++) {
    for (let i = 1; i <= N; i++) {
      let x = i - dt0 * u[idx(i, j)];
      let y = j - dt0 * v[idx(i, j)];
      if (x < 0.5) x = 0.5;
      if (x > N + 0.5) x = N + 0.5;
      const i0 = Math.floor(x); const i1 = i0 + 1;
      if (y < 0.5) y = 0.5;
      if (y > N + 0.5) y = N + 0.5;
      const j0 = Math.floor(y); const j1 = j0 + 1;
      const s1 = x - i0; const s0 = 1 - s1;
      const t1 = y - j0; const t0 = 1 - t1;
      d[idx(i, j)] =
        s0 * (t0 * d0[idx(i0, j0)] + t1 * d0[idx(i0, j1)]) +
        s1 * (t0 * d0[idx(i1, j0)] + t1 * d0[idx(i1, j1)]);
    }
  }
  setBnd(b, d);
}

function project(u: Float32Array, v: Float32Array, p: Float32Array, div: Float32Array): void {
  const h = 1.0 / N;
  for (let j = 1; j <= N; j++) {
    for (let i = 1; i <= N; i++) {
      div[idx(i, j)] = -0.5 * h * (
        u[idx(i + 1, j)] - u[idx(i - 1, j)] +
        v[idx(i, j + 1)] - v[idx(i, j - 1)]
      );
      p[idx(i, j)] = 0;
    }
  }
  setBnd(0, div);
  setBnd(0, p);
  for (let k = 0; k < 20; k++) {
    for (let j = 1; j <= N; j++) {
      for (let i = 1; i <= N; i++) {
        p[idx(i, j)] = (div[idx(i, j)] + (
          p[idx(i - 1, j)] + p[idx(i + 1, j)] +
          p[idx(i, j - 1)] + p[idx(i, j + 1)]
        )) / 4;
      }
    }
    setBnd(0, p);
  }
  for (let j = 1; j <= N; j++) {
    for (let i = 1; i <= N; i++) {
      u[idx(i, j)] -= 0.5 * (p[idx(i + 1, j)] - p[idx(i - 1, j)]) / h;
      v[idx(i, j)] -= 0.5 * (p[idx(i, j + 1)] - p[idx(i, j - 1)]) / h;
    }
  }
  setBnd(1, u);
  setBnd(2, v);
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

function densityToColor(
  density: number,
  palette: [number, number, number][],
): [number, number, number] {
  const d = Math.min(1, Math.max(0, density));
  const n = palette.length;
  if (n === 1) {
    const c = palette[0];
    return [c[0] * d, c[1] * d, c[2] * d];
  }
  const scaled = d * (n - 1);
  const lo = Math.floor(scaled);
  const hi = Math.min(lo + 1, n - 1);
  const t = scaled - lo;
  const a = palette[lo];
  const b = palette[hi];
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

interface FluidState {
  dens: Float32Array;
  densOld: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  vxOld: Float32Array;
  vyOld: Float32Array;
  p: Float32Array;
  div: Float32Array;
  palette: [number, number, number][];
  offscreen: OffscreenCanvas | null;
  offCtx: OffscreenCanvasRenderingContext2D | null;
  imgData: ImageData | null;
}

export const fluid: Algorithm = {
  meta: {
    id: 'fluid',
    name: 'Fluid Simulation',
    description: 'Navier-Stokes stable fluids (Jos Stam) with colorized density field',
    category: 'fluid',
    tags: ['fluid', 'navier-stokes', 'simulation', 'physics'],
    animated: true,
    gpuHeavy: false,
    defaultParams: {
      viscosity: 0.0001,
      diffusion: 0.0001,
      numColors: 3,
      colorPalette: '#1a1aff,#00ffcc,#ff6600',
      mouseInteraction: true,
    },
    paramSchema: [
      { key: 'viscosity',        label: 'Viscosity',          type: 'float', min: 0.0001, max: 0.01,  step: 0.0001 },
      { key: 'diffusion',        label: 'Diffusion',          type: 'float', min: 0.0001, max: 0.01,  step: 0.0001 },
      { key: 'numColors',        label: 'Num Colors',         type: 'int',   min: 1,      max: 5,     step: 1      },
      { key: 'colorPalette',     label: 'Color Palette',      type: 'color_array' },
      { key: 'mouseInteraction', label: 'Mouse Interaction',  type: 'bool' },
    ],
  },

  init(ctx: RenderContext): FluidState {
    const dens    = new Float32Array(SIZE);
    const densOld = new Float32Array(SIZE);
    const vx      = new Float32Array(SIZE);
    const vy      = new Float32Array(SIZE);
    const vxOld   = new Float32Array(SIZE);
    const vyOld   = new Float32Array(SIZE);
    const p       = new Float32Array(SIZE);
    const div     = new Float32Array(SIZE);

    const rawPaletteVal = ctx.params.colorPalette;
    const rawPalette: string[] = Array.isArray(rawPaletteVal)
      ? (rawPaletteVal as unknown as string[])
      : typeof rawPaletteVal === 'string'
        ? (rawPaletteVal as string).split(',')
        : ['#1a1aff', '#00ffcc', '#ff6600'];
    const palette = rawPalette.map(hexToRgb) as [number, number, number][];

    let offscreen: OffscreenCanvas | null = null;
    let offCtx: OffscreenCanvasRenderingContext2D | null = null;
    let imgData: ImageData | null = null;

    try {
      offscreen = new OffscreenCanvas(N, N);
      offCtx = offscreen.getContext('2d') as OffscreenCanvasRenderingContext2D;
      imgData = offCtx.createImageData(N, N);
    } catch {
      // fallback: render directly
    }

    return { dens, densOld, vx, vy, vxOld, vyOld, p, div, palette, offscreen, offCtx, imgData };
  },

  update(ctx: RenderContext, state: FluidState): void {
    const viscosity = (ctx.params.viscosity as number) ?? 0.0001;
    const diffusion = (ctx.params.diffusion as number) ?? 0.0001;
    const dt = 0.1;
    const t = ctx.time * 0.001;

    // Refresh palette when params change
    const rawPaletteVal2 = ctx.params.colorPalette;
    const rawPalette2: string[] = Array.isArray(rawPaletteVal2)
      ? (rawPaletteVal2 as unknown as string[])
      : typeof rawPaletteVal2 === 'string'
        ? (rawPaletteVal2 as string).split(',')
        : ['#1a1aff', '#00ffcc', '#ff6600'];
    state.palette = rawPalette2.map(hexToRgb) as [number, number, number][];

    // Add random turbulence sources
    const cx = Math.floor(N / 2);
    const cy = Math.floor(N / 2);
    const numSources = 4;
    for (let s = 0; s < numSources; s++) {
      const angle = (s / numSources) * Math.PI * 2 + t * 0.3;
      const r = 10 + 8 * Math.sin(t * 0.7 + s);
      const sx = Math.round(cx + Math.cos(angle) * r);
      const sy = Math.round(cy + Math.sin(angle) * r);
      if (sx >= 1 && sx <= N && sy >= 1 && sy <= N) {
        state.densOld[idx(sx, sy)] += 80 * (0.5 + 0.5 * Math.sin(t * 1.3 + s));
        state.vxOld[idx(sx, sy)]  += 300 * Math.cos(angle + Math.PI / 2);
        state.vyOld[idx(sx, sy)]  += 300 * Math.sin(angle + Math.PI / 2);
      }
    }

    // Velocity step
    addSource(state.vx, state.vxOld, dt);
    addSource(state.vy, state.vyOld, dt);
    const tmpVx = state.vxOld; state.vxOld = state.vx; state.vx = tmpVx;
    const tmpVy = state.vyOld; state.vyOld = state.vy; state.vy = tmpVy;
    diffuse(1, state.vx, state.vxOld, viscosity, dt);
    diffuse(2, state.vy, state.vyOld, viscosity, dt);
    project(state.vx, state.vy, state.p, state.div);
    const tmpVx2 = state.vxOld; state.vxOld = state.vx; state.vx = tmpVx2;
    const tmpVy2 = state.vyOld; state.vyOld = state.vy; state.vy = tmpVy2;
    advect(1, state.vx, state.vxOld, state.vxOld, state.vyOld, dt);
    advect(2, state.vy, state.vyOld, state.vxOld, state.vyOld, dt);
    project(state.vx, state.vy, state.p, state.div);

    // Density step
    addSource(state.dens, state.densOld, dt);
    const tmpD = state.densOld; state.densOld = state.dens; state.dens = tmpD;
    diffuse(0, state.dens, state.densOld, diffusion, dt);
    const tmpD2 = state.densOld; state.densOld = state.dens; state.dens = tmpD2;
    advect(0, state.dens, state.densOld, state.vx, state.vy, dt);

    // Clear sources
    state.densOld.fill(0);
    state.vxOld.fill(0);
    state.vyOld.fill(0);

    // Apply slight dissipation
    for (let i = 0; i < SIZE; i++) {
      state.dens[i] *= 0.995;
    }
  },

  render(ctx: RenderContext, state: FluidState): void {
    const { ctx: c, width, height } = ctx;
    const scaleX = width / N;
    const scaleY = height / N;

    const imgData = state.imgData ?? ctx.imageData;
    const data = imgData.data;

    for (let j = 1; j <= N; j++) {
      for (let i = 1; i <= N; i++) {
        const d = state.dens[idx(i, j)];
        const [r, g, b] = densityToColor(d / 60, state.palette);
        const px = (j - 1) * N + (i - 1);
        data[px * 4 + 0] = Math.min(255, r);
        data[px * 4 + 1] = Math.min(255, g);
        data[px * 4 + 2] = Math.min(255, b);
        data[px * 4 + 3] = 255;
      }
    }

    if (state.offCtx && state.offscreen && state.imgData) {
      state.offCtx.putImageData(state.imgData, 0, 0);
      c.save();
      c.imageSmoothingEnabled = true;
      c.imageSmoothingQuality = 'high';
      c.drawImage(state.offscreen, 0, 0, N, N, 0, 0, width, height);
      c.restore();
    } else {
      // fallback: direct scaled drawing
      c.save();
      c.scale(scaleX, scaleY);
      c.putImageData(imgData, 0, 0);
      c.restore();
    }
  },
};

export default fluid;
