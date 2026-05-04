import type { Algorithm, RenderContext, AlgorithmState } from '@/engine/types';

// ─── Diffusion-Limited Aggregation (DLA) ─────────────────────────────────────

interface Particle {
  x: number;
  y: number;
  age: number;   // frame when it stuck
  radius: number;
}

interface Walker {
  x: number;
  y: number;
}

interface DLAState {
  particles: Particle[];
  walkers: Walker[];
  grid: Set<number>;       // occupied cells for fast lookup
  totalAge: number;        // frame counter for age color
  gridSize: number;        // cell size for spatial hashing
  maxParticles: number;
  offscreen: OffscreenCanvas | null;
  offCtx: OffscreenCanvasRenderingContext2D | null;
  needsRedraw: boolean;
  lastCount: number;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

function cellKey(x: number, y: number, cellSize: number): number {
  const cx = Math.floor(x / cellSize);
  const cy = Math.floor(y / cellSize);
  return cx * 100000 + cy;
}

function spawnWalker(width: number, height: number): Walker {
  // Spawn on a circle around the aggregate
  const angle = Math.random() * Math.PI * 2;
  const r = Math.min(width, height) * 0.48;
  const cx = width / 2;
  const cy = height / 2;
  return {
    x: cx + Math.cos(angle) * r,
    y: cy + Math.sin(angle) * r,
  };
}

function checkStick(
  wx: number, wy: number,
  grid: Set<number>,
  gridSize: number,
  stickiness: number,
): boolean {
  if (Math.random() > stickiness) return false;
  // Check 8 neighbors
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy === 0) continue;
      const nx = wx + dx * gridSize;
      const ny = wy + dy * gridSize;
      const key = cellKey(nx, ny, gridSize);
      if (grid.has(key)) return true;
    }
  }
  return false;
}

function ageToColor(
  age: number,
  maxAge: number,
  baseColor: [number, number, number],
  colorByAge: boolean,
): [number, number, number] {
  if (!colorByAge) return baseColor;
  const t = Math.min(1, age / Math.max(1, maxAge));
  // cold (blue/cyan) -> hot (white/yellow) gradient
  if (t < 0.33) {
    const s = t / 0.33;
    return [Math.round(s * 20), Math.round(s * 100), Math.round(150 + s * 105)];
  } else if (t < 0.66) {
    const s = (t - 0.33) / 0.33;
    return [Math.round(20 + s * 235), Math.round(100 + s * 155), Math.round(255 - s * 200)];
  } else {
    const s = (t - 0.66) / 0.34;
    return [255, Math.round(255 - s * 50), Math.round(55 + s * 50)];
  }
}

export const dla: Algorithm = {
  meta: {
    id: 'dla',
    name: 'Diffusion-Limited Aggregation',
    description: 'Random walkers stick to a growing aggregate forming fractal tree structures',
    category: 'organic',
    tags: ['dla', 'diffusion', 'fractal', 'growth', 'simulation'],
    animated: true,
    gpuHeavy: false,
    defaultParams: {
      walkerCount: 5,
      stickiness: 0.8,
      colorByAge: true,
      branchColor: '#00d4ff',
      backgroundColor: '#000000',
      maxParticles: 5000,
      symmetric: false,
    },
    paramSchema: [
      { key: 'walkerCount',    label: 'Walker Count',     type: 'int',   min: 1,    max: 20,    step: 1 },
      { key: 'stickiness',     label: 'Stickiness',       type: 'float', min: 0.1,  max: 1,     step: 0.05 },
      { key: 'colorByAge',     label: 'Color by Age',     type: 'bool' },
      { key: 'branchColor',    label: 'Branch Color',     type: 'color' },
      { key: 'backgroundColor',label: 'Background Color', type: 'color' },
      { key: 'maxParticles',   label: 'Max Particles',    type: 'int',   min: 500,  max: 10000, step: 100 },
      { key: 'symmetric',      label: 'Radial Symmetry',  type: 'bool' },
    ],
  },

  init(ctx: RenderContext): DLAState {
    const maxParticles = (ctx.params.maxParticles as number) ?? 5000;
    const gridSize = 3;
    const grid = new Set<number>();

    // Seed particle at center
    const cx = ctx.width / 2;
    const cy = ctx.height / 2;
    const seedKey = cellKey(cx, cy, gridSize);
    grid.add(seedKey);

    const particles: Particle[] = [{
      x: cx, y: cy,
      age: 0,
      radius: 2,
    }];

    const walkerCount = (ctx.params.walkerCount as number) ?? 5;
    const walkers: Walker[] = Array.from({ length: walkerCount }, () =>
      spawnWalker(ctx.width, ctx.height));

    let offscreen: OffscreenCanvas | null = null;
    let offCtx: OffscreenCanvasRenderingContext2D | null = null;
    try {
      offscreen = new OffscreenCanvas(ctx.width, ctx.height);
      offCtx = offscreen.getContext('2d') as OffscreenCanvasRenderingContext2D;
    } catch { /* fallback */ }

    return {
      particles,
      walkers,
      grid,
      totalAge: 0,
      gridSize,
      maxParticles,
      offscreen,
      offCtx,
      needsRedraw: true,
      lastCount: 0,
    };
  },

  update(ctx: RenderContext, state: DLAState): void {
    const { width, height } = ctx;
    const stickiness = (ctx.params.stickiness as number) ?? 0.8;
    const walkerCount = (ctx.params.walkerCount as number) ?? 5;
    const maxParticles = (ctx.params.maxParticles as number) ?? 5000;
    const symmetric = (ctx.params.symmetric as boolean) ?? false;
    const { gridSize } = state;

    if (state.particles.length >= maxParticles) return;

    state.totalAge++;

    // Adjust walker count
    while (state.walkers.length < walkerCount) {
      state.walkers.push(spawnWalker(width, height));
    }
    while (state.walkers.length > walkerCount) {
      state.walkers.pop();
    }

    const stepsPerFrame = 5;
    for (let step = 0; step < stepsPerFrame; step++) {
      for (let wi = state.walkers.length - 1; wi >= 0; wi--) {
        const w = state.walkers[wi];
        // Random walk
        const angle = Math.random() * Math.PI * 2;
        w.x += Math.cos(angle) * gridSize;
        w.y += Math.sin(angle) * gridSize;

        // Bounce off edges
        if (w.x < 0) w.x += width;
        if (w.x >= width) w.x -= width;
        if (w.y < 0) w.y += height;
        if (w.y >= height) w.y -= height;

        // Check sticking
        if (checkStick(w.x, w.y, state.grid, gridSize, stickiness)) {
          const newX = w.x;
          const newY = w.y;
          const newAge = state.totalAge;

          const addParticle = (px: number, py: number) => {
            const key = cellKey(px, py, gridSize);
            if (!state.grid.has(key)) {
              state.grid.add(key);
              state.particles.push({ x: px, y: py, age: newAge, radius: 1.5 });
              state.needsRedraw = true;
            }
          };

          addParticle(newX, newY);

          if (symmetric) {
            const cx = width / 2;
            const cy = height / 2;
            const dx = newX - cx;
            const dy = newY - cy;
            // 6-fold symmetry
            for (let k = 1; k < 6; k++) {
              const angle = (k / 6) * Math.PI * 2;
              const rx = cx + dx * Math.cos(angle) - dy * Math.sin(angle);
              const ry = cy + dx * Math.sin(angle) + dy * Math.cos(angle);
              addParticle(rx, ry);
            }
          }

          if (state.particles.length >= maxParticles) break;

          // Respawn walker
          state.walkers[wi] = spawnWalker(width, height);
        }
      }
      if (state.particles.length >= maxParticles) break;
    }
  },

  render(ctx: RenderContext, state: DLAState): void {
    const { ctx: c, width, height } = ctx;
    const colorByAge = (ctx.params.colorByAge as boolean) ?? true;
    const branchColor = (ctx.params.branchColor as string) ?? '#00d4ff';
    const backgroundColor = (ctx.params.backgroundColor as string) ?? '#000000';

    c.fillStyle = backgroundColor;
    c.fillRect(0, 0, width, height);

    const baseRgb = hexToRgb(branchColor);
    const maxAge = state.totalAge;

    for (const p of state.particles) {
      const [r, g, b] = ageToColor(p.age, maxAge, baseRgb, colorByAge);
      c.beginPath();
      c.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      c.fillStyle = `rgb(${r},${g},${b})`;
      c.fill();
    }

    // Draw walkers as small white dots
    if (state.particles.length < (ctx.params.maxParticles as number ?? 5000)) {
      c.fillStyle = 'rgba(255,255,255,0.4)';
      for (const w of state.walkers) {
        c.beginPath();
        c.arc(w.x, w.y, 1.5, 0, Math.PI * 2);
        c.fill();
      }
    }
  },
};

export default dla;
