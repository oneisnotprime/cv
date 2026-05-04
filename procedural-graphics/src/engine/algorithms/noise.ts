import type { Algorithm, RenderContext, AlgorithmState } from '@/engine/types';

// ─── Perlin noise flow field with particle trails ─────────────────────────────

// Classic Perlin noise implementation
function buildPerm(seed: number): Uint8Array {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  // Fisher-Yates with seeded LCG
  let s = seed >>> 0;
  for (let i = 255; i > 0; i--) {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    const j = s % (i + 1);
    const tmp = p[i]; p[i] = p[j]; p[j] = tmp;
  }
  return p;
}

class PerlinNoise {
  private perm: Uint8Array;
  private p: Uint16Array;

  constructor(seed = 42) {
    this.perm = buildPerm(seed);
    this.p = new Uint16Array(512);
    for (let i = 0; i < 512; i++) this.p[i] = this.perm[i & 255];
  }

  private fade(t: number): number { return t * t * t * (t * (t * 6 - 15) + 10); }
  private lerp(a: number, b: number, t: number): number { return a + t * (b - a); }

  private grad(hash: number, x: number, y: number, z: number): number {
    const h = hash & 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
    return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
  }

  noise(x: number, y: number, z: number): number {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const Z = Math.floor(z) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    z -= Math.floor(z);
    const u = this.fade(x);
    const v = this.fade(y);
    const w = this.fade(z);
    const { p } = this;
    const A  = p[X] + Y;     const AA = p[A] + Z;  const AB = p[A + 1] + Z;
    const B  = p[X + 1] + Y; const BA = p[B] + Z;  const BB = p[B + 1] + Z;
    return this.lerp(
      this.lerp(
        this.lerp(this.grad(p[AA],     x,     y,     z),     this.grad(p[BA],     x - 1, y,     z),     u),
        this.lerp(this.grad(p[AB],     x,     y - 1, z),     this.grad(p[BB],     x - 1, y - 1, z),     u),
        v,
      ),
      this.lerp(
        this.lerp(this.grad(p[AA + 1], x,     y,     z - 1), this.grad(p[BA + 1], x - 1, y,     z - 1), u),
        this.lerp(this.grad(p[AB + 1], x,     y - 1, z - 1), this.grad(p[BB + 1], x - 1, y - 1, z - 1), u),
        v,
      ),
      w,
    );
  }

  fbm(x: number, y: number, z: number, octaves: number): number {
    let v = 0; let amp = 0.5; let freq = 1;
    for (let i = 0; i < octaves; i++) {
      v += this.noise(x * freq, y * freq, z * freq) * amp;
      amp *= 0.5; freq *= 2;
    }
    return v;
  }
}

// LCG seeded PRNG for reproducible particle positions
function seededRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

interface Particle {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  speed: number;
  hue: number;
}

interface NoiseState {
  perlin: PerlinNoise;
  particles: Particle[];
  trailCanvas: OffscreenCanvas;
  trailCtx: OffscreenCanvasRenderingContext2D;
}

function colorForMode(mode: string, hue: number, speed: number): string {
  const s = Math.min(1, Math.max(0, speed / 3));
  switch (mode) {
    case 'monochrome':
      return `hsl(220,20%,${60 + s * 35}%)`;
    case 'fire':
      return `hsl(${10 + s * 40},100%,${40 + s * 40}%)`;
    case 'ocean':
      return `hsl(${180 + s * 60},80%,${35 + s * 35}%)`;
    default: // spectrum
      return `hsl(${hue % 360},90%,${50 + s * 25}%)`;
  }
}

export const noise: Algorithm = {
  meta: {
    id: 'noise',
    name: 'Noise Flow Field',
    description: 'Particles following a Perlin-noise vector field with fading trails',
    category: 'organic',
    tags: ['perlin', 'flow field', 'particles', 'noise'],
    animated: true,
    gpuHeavy: false,
    defaultParams: {
      particleCount: 2000,
      noiseScale: 0.004,
      speed: 1.5,
      trailLength: 0.97,
      octaves: 3,
      colorMode: 'spectrum',
    },
    paramSchema: [
      { key: 'particleCount', label: 'Particle Count', type: 'int',   min: 100,   max: 5000,  step: 100   },
      { key: 'noiseScale',    label: 'Noise Scale',    type: 'float', min: 0.001, max: 0.02,  step: 0.001 },
      { key: 'speed',         label: 'Speed',          type: 'float', min: 0.5,   max: 5,     step: 0.1   },
      { key: 'trailLength',   label: 'Trail Length',   type: 'float', min: 0.95,  max: 0.999, step: 0.001 },
      { key: 'octaves',       label: 'Octaves',        type: 'int',   min: 1,     max: 6,     step: 1     },
      {
        key: 'colorMode', label: 'Color Mode', type: 'select',
        options: [
          { value: 'spectrum',   label: 'Spectrum'   },
          { value: 'monochrome', label: 'Monochrome' },
          { value: 'fire',       label: 'Fire'       },
          { value: 'ocean',      label: 'Ocean'      },
        ],
      },
    ],
  },

  init(ctx: RenderContext): NoiseState {
    const perlin = new PerlinNoise(42);
    const particleCount = (ctx.params.particleCount as number) ?? 2000;
    const rand = seededRand(1337);
    const particles: Particle[] = [];

    for (let i = 0; i < particleCount; i++) {
      const x = rand() * ctx.width;
      const y = rand() * ctx.height;
      particles.push({ x, y, prevX: x, prevY: y, speed: 0.5 + rand(), hue: rand() * 360 });
    }

    const trailCanvas = new OffscreenCanvas(ctx.width, ctx.height);
    const trailCtx = trailCanvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
    trailCtx.fillStyle = '#050508';
    trailCtx.fillRect(0, 0, ctx.width, ctx.height);

    return { perlin, particles, trailCanvas, trailCtx };
  },

  update(ctx: RenderContext, state: NoiseState): void {
    const particleCount = (ctx.params.particleCount as number) ?? 2000;
    const noiseScale    = (ctx.params.noiseScale    as number) ?? 0.004;
    const speedParam    = (ctx.params.speed         as number) ?? 1.5;
    const octaves       = (ctx.params.octaves       as number) ?? 3;
    const t = ctx.time * 0.0003;

    // Resize trail canvas if needed
    if (state.trailCanvas.width !== ctx.width || state.trailCanvas.height !== ctx.height) {
      state.trailCanvas.width = ctx.width;
      state.trailCanvas.height = ctx.height;
      state.trailCtx.fillStyle = '#050508';
      state.trailCtx.fillRect(0, 0, ctx.width, ctx.height);
    }

    // Adjust particle count
    const rand = seededRand(Date.now() & 0xffff);
    while (state.particles.length < particleCount) {
      const x = rand() * ctx.width;
      const y = rand() * ctx.height;
      state.particles.push({ x, y, prevX: x, prevY: y, speed: 0.5 + rand(), hue: rand() * 360 });
    }
    while (state.particles.length > particleCount) state.particles.pop();

    for (const p of state.particles) {
      p.prevX = p.x;
      p.prevY = p.y;

      const nx = p.x * noiseScale;
      const ny = p.y * noiseScale;
      const angle = state.perlin.fbm(nx, ny, t, octaves) * Math.PI * 4;
      const vx = Math.cos(angle) * speedParam * p.speed;
      const vy = Math.sin(angle) * speedParam * p.speed;

      p.x += vx;
      p.y += vy;
      p.hue = (p.hue + 0.3) % 360;

      // Wrap around
      if (p.x < 0) p.x += ctx.width;
      if (p.x > ctx.width) p.x -= ctx.width;
      if (p.y < 0) p.y += ctx.height;
      if (p.y > ctx.height) p.y -= ctx.height;
    }
  },

  render(ctx: RenderContext, state: NoiseState): void {
    const { ctx: c, width, height } = ctx;
    const trailLength = (ctx.params.trailLength as number) ?? 0.97;
    const colorMode   = (ctx.params.colorMode   as string) ?? 'spectrum';
    const speedParam  = (ctx.params.speed       as number) ?? 1.5;

    const tc = state.trailCtx;

    // Fade trails
    tc.fillStyle = `rgba(5,5,8,${1 - trailLength})`;
    tc.fillRect(0, 0, width, height);

    // Draw particle lines onto trail canvas
    for (const p of state.particles) {
      const dx = p.x - p.prevX;
      const dy = p.y - p.prevY;
      const spd = Math.sqrt(dx * dx + dy * dy);

      // Skip wrap-around jumps
      if (spd > 20) continue;

      tc.beginPath();
      tc.moveTo(p.prevX, p.prevY);
      tc.lineTo(p.x, p.y);
      tc.strokeStyle = colorForMode(colorMode, p.hue, spd / speedParam);
      tc.lineWidth = 1;
      tc.globalAlpha = 0.7;
      tc.stroke();
    }
    tc.globalAlpha = 1;

    // Blit trail canvas to main canvas
    c.drawImage(state.trailCanvas, 0, 0);
  },
};

export default noise;
