import type { Algorithm, RenderContext, AlgorithmState } from '@/engine/types';

// ─── N-Body Gravitational Simulation ─────────────────────────────────────────

interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  mass: number;
  radius: number;
  hue: number;
  trail: { x: number; y: number }[];
}

interface GravityState {
  bodies: Body[];
  preset: string;
}

const BODY_HUES = [0, 210, 120, 60, 300, 180, 30, 270, 90, 150,
  330, 15, 195, 75, 255, 45, 165, 345, 135, 225];

function initPreset(
  preset: string,
  numBodies: number,
  width: number,
  height: number,
  trailLength: number,
): Body[] {
  const cx = width / 2;
  const cy = height / 2;
  const scale = Math.min(width, height) * 0.3;

  switch (preset) {
    case 'solar': {
      // Sun + planets
      const bodies: Body[] = [{
        x: cx, y: cy,
        vx: 0, vy: 0,
        mass: 50,
        radius: 16,
        hue: 45,
        trail: [],
      }];
      const n = Math.min(numBodies - 1, 8);
      for (let i = 0; i < n; i++) {
        const r = scale * (0.15 + 0.1 * i);
        const angle = (i / n) * Math.PI * 2;
        const mass = 0.5 + Math.random() * 2;
        // Circular orbit velocity: v = sqrt(G*M/r) with G=2, M=50
        const v = Math.sqrt(2 * 50 / r);
        bodies.push({
          x: cx + Math.cos(angle) * r,
          y: cy + Math.sin(angle) * r,
          vx: -Math.sin(angle) * v,
          vy: Math.cos(angle) * v,
          mass,
          radius: 2 + mass * 1.5,
          hue: BODY_HUES[i + 1],
          trail: [],
        });
      }
      return bodies;
    }

    case 'binary': {
      const m1 = 20, m2 = 15;
      const d = scale * 0.4;
      // Binary star with correct COM velocities
      const totalM = m1 + m2;
      const r1 = d * m2 / totalM;
      const r2 = d * m1 / totalM;
      const v = Math.sqrt(2 * totalM / d) * 0.5;
      const bodies: Body[] = [
        {
          x: cx - r1, y: cy,
          vx: 0, vy: -v * (m2 / totalM) * 2,
          mass: m1, radius: 10, hue: 45, trail: [],
        },
        {
          x: cx + r2, y: cy,
          vx: 0, vy: v * (m1 / totalM) * 2,
          mass: m2, radius: 8, hue: 210, trail: [],
        },
      ];
      // Add a few smaller orbiting bodies
      for (let i = 2; i < Math.min(numBodies, 6); i++) {
        const r = scale * (0.6 + 0.15 * (i - 2));
        const angle = (i / numBodies) * Math.PI * 2;
        const v2 = Math.sqrt(2 * totalM / r) * 0.7;
        bodies.push({
          x: cx + Math.cos(angle) * r,
          y: cy + Math.sin(angle) * r,
          vx: -Math.sin(angle) * v2,
          vy: Math.cos(angle) * v2,
          mass: 0.5,
          radius: 3,
          hue: BODY_HUES[i],
          trail: [],
        });
      }
      return bodies;
    }

    case 'figure8': {
      // Chenciner-Montgomery figure-8 three-body solution
      // Scaled initial conditions
      const m = 1;
      const s = scale * 0.5;
      // Exact figure-8 initial positions and velocities (normalized)
      const bodies: Body[] = [
        {
          x: cx - 0.97000436 * s, y: cy + 0.24308753 * s,
          vx: 0.93240737 * 0.5, vy: 0.86473146 * 0.5,
          mass: m, radius: 5, hue: 0, trail: [],
        },
        {
          x: cx + 0.97000436 * s, y: cy - 0.24308753 * s,
          vx: 0.93240737 * 0.5, vy: 0.86473146 * 0.5,
          mass: m, radius: 5, hue: 120, trail: [],
        },
        {
          x: cx, y: cy,
          vx: -1.86481474 * 0.5, vy: -1.72946292 * 0.5,
          mass: m, radius: 5, hue: 240, trail: [],
        },
      ];
      return bodies;
    }

    case 'chaos': {
      // Randomly placed bodies with random velocities
      return Array.from({ length: numBodies }, (_, i) => {
        const r = scale * (0.2 + Math.random() * 0.7);
        const angle = Math.random() * Math.PI * 2;
        const mass = 1 + Math.random() * 8;
        return {
          x: cx + Math.cos(angle) * r,
          y: cy + Math.sin(angle) * r,
          vx: (Math.random() - 0.5) * 3,
          vy: (Math.random() - 0.5) * 3,
          mass,
          radius: 2 + mass,
          hue: BODY_HUES[i % BODY_HUES.length],
          trail: [],
        };
      });
    }

    default: { // random
      return Array.from({ length: numBodies }, (_, i) => {
        const r = scale * (0.1 + Math.random() * 0.8);
        const angle = Math.random() * Math.PI * 2;
        const mass = 1 + Math.random() * 9;
        // Give slight orbital-ish velocities
        const orbV = Math.sqrt(2 * 5 / (r + 1)) * 0.3;
        return {
          x: cx + Math.cos(angle) * r,
          y: cy + Math.sin(angle) * r,
          vx: -Math.sin(angle) * orbV + (Math.random() - 0.5) * 0.5,
          vy: Math.cos(angle) * orbV + (Math.random() - 0.5) * 0.5,
          mass,
          radius: 2 + mass * 0.8,
          hue: BODY_HUES[i % BODY_HUES.length],
          trail: [],
        };
      });
    }
  }
}

export const gravity: Algorithm = {
  meta: {
    id: 'gravity',
    name: 'N-Body Gravity',
    description: 'N-body gravitational simulation with trails, presets including figure-8 orbit',
    category: 'physics',
    tags: ['gravity', 'n-body', 'physics', 'simulation', 'orbits'],
    animated: true,
    gpuHeavy: false,
    defaultParams: {
      numBodies: 5,
      G: 2,
      trailLength: 200,
      colorByMass: true,
      showForces: false,
      preset: 'random',
      softening: 1,
      timeStep: 0.1,
    },
    paramSchema: [
      { key: 'numBodies',   label: 'Num Bodies',    type: 'int',   min: 3,    max: 20,   step: 1 },
      { key: 'G',           label: 'Gravity (G)',   type: 'float', min: 0.1,  max: 10,   step: 0.1 },
      { key: 'trailLength', label: 'Trail Length',  type: 'int',   min: 50,   max: 500,  step: 10 },
      { key: 'colorByMass', label: 'Color by Mass', type: 'bool' },
      { key: 'showForces',  label: 'Show Forces',   type: 'bool' },
      { key: 'preset',      label: 'Preset',        type: 'select', options: [
        { value: 'random',  label: 'Random' },
        { value: 'solar',   label: 'Solar System' },
        { value: 'binary',  label: 'Binary Star' },
        { value: 'figure8', label: 'Figure-8' },
        { value: 'chaos',   label: 'Chaos' },
      ]},
      { key: 'softening',  label: 'Softening',     type: 'float', min: 0.1,  max: 10,   step: 0.1 },
      { key: 'timeStep',   label: 'Time Step',     type: 'float', min: 0.01, max: 0.5,  step: 0.01 },
    ],
  },

  init(ctx: RenderContext): GravityState {
    const preset = (ctx.params.preset as string) ?? 'random';
    const numBodies = (ctx.params.numBodies as number) ?? 5;
    const trailLength = (ctx.params.trailLength as number) ?? 200;

    const bodies = initPreset(preset, numBodies, ctx.width, ctx.height, trailLength);

    return { bodies, preset };
  },

  update(ctx: RenderContext, state: GravityState): void {
    const { width, height } = ctx;
    const G = (ctx.params.G as number) ?? 2;
    const trailLength = (ctx.params.trailLength as number) ?? 200;
    const preset = (ctx.params.preset as string) ?? 'random';
    const softening = (ctx.params.softening as number) ?? 1;
    const timeStep = (ctx.params.timeStep as number) ?? 0.1;
    const numBodies = (ctx.params.numBodies as number) ?? 5;

    // Reset if preset changed
    if (state.preset !== preset) {
      const bodies = initPreset(preset, numBodies, width, height, trailLength);
      state.bodies = bodies;
      state.preset = preset;
      return;
    }

    const soft2 = softening * softening;

    // Compute accelerations
    const ax = new Float64Array(state.bodies.length);
    const ay = new Float64Array(state.bodies.length);

    for (let i = 0; i < state.bodies.length; i++) {
      for (let j = i + 1; j < state.bodies.length; j++) {
        const dx = state.bodies[j].x - state.bodies[i].x;
        const dy = state.bodies[j].y - state.bodies[i].y;
        const dist2 = dx * dx + dy * dy + soft2;
        const dist = Math.sqrt(dist2);
        const force = G / dist2;
        const fx = force * dx / dist;
        const fy = force * dy / dist;
        ax[i] += fx * state.bodies[j].mass;
        ay[i] += fy * state.bodies[j].mass;
        ax[j] -= fx * state.bodies[i].mass;
        ay[j] -= fy * state.bodies[i].mass;
      }
    }

    // Integrate (Verlet)
    for (let i = 0; i < state.bodies.length; i++) {
      const b = state.bodies[i];
      b.vx += ax[i] * timeStep;
      b.vy += ay[i] * timeStep;
      b.x += b.vx * timeStep;
      b.y += b.vy * timeStep;

      // Trail
      b.trail.push({ x: b.x, y: b.y });
      if (b.trail.length > trailLength) b.trail.shift();

      // Soft boundary bounce
      const margin = 20;
      if (b.x < -width * 0.5) { b.vx = Math.abs(b.vx) * 0.5; b.x = -width * 0.5; }
      if (b.x > width * 1.5) { b.vx = -Math.abs(b.vx) * 0.5; b.x = width * 1.5; }
      if (b.y < -height * 0.5) { b.vy = Math.abs(b.vy) * 0.5; b.y = -height * 0.5; }
      if (b.y > height * 1.5) { b.vy = -Math.abs(b.vy) * 0.5; b.y = height * 1.5; }
    }
  },

  render(ctx: RenderContext, state: GravityState): void {
    const { ctx: c, width, height } = ctx;
    const colorByMass = (ctx.params.colorByMass as boolean) ?? true;
    const showForces = (ctx.params.showForces as boolean) ?? false;
    const G = (ctx.params.G as number) ?? 2;

    c.fillStyle = 'rgba(2,4,16,0.3)';
    c.fillRect(0, 0, width, height);

    const maxMass = Math.max(...state.bodies.map(b => b.mass));

    // Draw trails
    for (let i = 0; i < state.bodies.length; i++) {
      const b = state.bodies[i];
      if (b.trail.length < 2) continue;
      const hue = colorByMass ? (b.mass / maxMass) * 240 : b.hue;

      c.beginPath();
      c.moveTo(b.trail[0].x, b.trail[0].y);
      for (let ti = 1; ti < b.trail.length; ti++) {
        c.lineTo(b.trail[ti].x, b.trail[ti].y);
      }
      c.strokeStyle = `hsla(${hue},90%,60%,0.4)`;
      c.lineWidth = 1;
      c.stroke();
    }

    // Draw force vectors
    if (showForces) {
      for (let i = 0; i < state.bodies.length; i++) {
        for (let j = 0; j < state.bodies.length; j++) {
          if (i === j) continue;
          const bi = state.bodies[i];
          const bj = state.bodies[j];
          const dx = bj.x - bi.x;
          const dy = bj.y - bi.y;
          const dist = Math.sqrt(dx * dx + dy * dy) + 1;
          const force = G * bi.mass * bj.mass / (dist * dist);
          const len = Math.min(force * 5, 30);
          c.beginPath();
          c.moveTo(bi.x, bi.y);
          c.lineTo(bi.x + (dx / dist) * len, bi.y + (dy / dist) * len);
          c.strokeStyle = 'rgba(255,255,100,0.2)';
          c.lineWidth = 0.5;
          c.stroke();
        }
      }
    }

    // Draw bodies
    for (let i = 0; i < state.bodies.length; i++) {
      const b = state.bodies[i];
      const hue = colorByMass ? (b.mass / maxMass) * 240 : b.hue;

      // Glow
      const grd = c.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.radius * 3);
      grd.addColorStop(0, `hsla(${hue},100%,90%,0.9)`);
      grd.addColorStop(0.4, `hsla(${hue},100%,60%,0.5)`);
      grd.addColorStop(1, `hsla(${hue},100%,40%,0)`);
      c.beginPath();
      c.arc(b.x, b.y, b.radius * 3, 0, Math.PI * 2);
      c.fillStyle = grd;
      c.fill();

      // Core
      c.beginPath();
      c.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
      c.fillStyle = `hsl(${hue},100%,85%)`;
      c.fill();
    }
  },
};

export default gravity;
