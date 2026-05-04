import type { Algorithm, RenderContext, AlgorithmState } from '@/engine/types';

// ─── Physics Particle System ──────────────────────────────────────────────────

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;      // max life in frames
  size: number;
  hue: number;
  trail: { x: number; y: number }[];
}

interface ParticlesState {
  particles: Particle[];
  noiseOffset: number;
}

// Smooth noise helper (value noise)
function smoothNoise(x: number, y: number, t: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);

  const h = (n: number) => {
    let s = Math.sin(n * 127.1 + t * 311.7) * 43758.5453123;
    return s - Math.floor(s);
  };

  const a = h(ix + iy * 57);
  const b = h(ix + 1 + iy * 57);
  const cc = h(ix + (iy + 1) * 57);
  const d = h(ix + 1 + (iy + 1) * 57);
  return a + ux * (b - a) + uy * (cc - a) + ux * uy * (a - b - cc + d);
}

function computeForce(
  x: number, y: number,
  width: number, height: number,
  field: string,
  time: number,
): [number, number] {
  const cx = width / 2;
  const cy = height / 2;
  const dx = x - cx;
  const dy = y - cy;
  const dist = Math.sqrt(dx * dx + dy * dy) + 0.001;

  switch (field) {
    case 'radial': {
      // Attract toward center with slight rotation
      const strength = 0.15;
      return [-dx / dist * strength, -dy / dist * strength];
    }
    case 'vortex': {
      // Circular rotation force
      const strength = 2.0 / (dist * 0.01 + 1);
      return [-dy / dist * strength * 0.5, dx / dist * strength * 0.5];
    }
    case 'dipole': {
      // Two opposing force centers
      const cx1 = cx - width * 0.2;
      const cy1 = cy;
      const cx2 = cx + width * 0.2;
      const cy2 = cy;
      const dx1 = x - cx1; const dy1 = y - cy1;
      const d1 = Math.sqrt(dx1 * dx1 + dy1 * dy1) + 1;
      const dx2 = x - cx2; const dy2 = y - cy2;
      const d2 = Math.sqrt(dx2 * dx2 + dy2 * dy2) + 1;
      const s = 300;
      return [
        -dx1 / (d1 * d1 * d1) * s + dx2 / (d2 * d2 * d2) * s,
        -dy1 / (d1 * d1 * d1) * s + dy2 / (d2 * d2 * d2) * s,
      ];
    }
    case 'turbulent': {
      const scale = 0.004;
      const t = time * 0.0003;
      const fx = (smoothNoise(x * scale, y * scale, t) - 0.5) * 3;
      const fy = (smoothNoise(x * scale + 100, y * scale + 100, t) - 0.5) * 3;
      return [fx, fy];
    }
    default:
      return [0, 0];
  }
}

function spawnParticle(
  width: number, height: number,
  emitter: string,
  size: number,
  hue: number,
  trailLength: number,
): Particle {
  let x: number, y: number, vx: number, vy: number;
  const cx = width / 2;
  const cy = height / 2;

  switch (emitter) {
    case 'edges': {
      const side = Math.floor(Math.random() * 4);
      if (side === 0) { x = Math.random() * width; y = 0; }
      else if (side === 1) { x = width; y = Math.random() * height; }
      else if (side === 2) { x = Math.random() * width; y = height; }
      else { x = 0; y = Math.random() * height; }
      const dx = cx - x; const dy = cy - y;
      const d = Math.sqrt(dx * dx + dy * dy);
      vx = (dx / d) * 2; vy = (dy / d) * 2;
      break;
    }
    case 'ring': {
      const angle = Math.random() * Math.PI * 2;
      const r = Math.min(width, height) * 0.15;
      x = cx + Math.cos(angle) * r;
      y = cy + Math.sin(angle) * r;
      vx = -Math.sin(angle) * 2;
      vy = Math.cos(angle) * 2;
      break;
    }
    case 'random': {
      x = Math.random() * width;
      y = Math.random() * height;
      vx = (Math.random() - 0.5) * 2;
      vy = (Math.random() - 0.5) * 2;
      break;
    }
    default: { // center
      x = cx + (Math.random() - 0.5) * 20;
      y = cy + (Math.random() - 0.5) * 20;
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 3;
      vx = Math.cos(angle) * speed;
      vy = Math.sin(angle) * speed;
    }
  }

  return {
    x, y, vx, vy,
    age: 0,
    life: 120 + Math.floor(Math.random() * 240),
    size: size * (0.5 + Math.random() * 0.5),
    hue,
    trail: trailLength > 0 ? [{ x, y }] : [],
  };
}

function velocityToColor(vx: number, vy: number): string {
  const speed = Math.sqrt(vx * vx + vy * vy);
  const hue = (Math.atan2(vy, vx) / (Math.PI * 2) + 1) % 1;
  const sat = Math.min(1, speed / 8);
  return `hsl(${hue * 360},${sat * 100}%,${50 + sat * 30}%)`;
}

export const particles: Algorithm = {
  meta: {
    id: 'particles',
    name: 'Particle System',
    description: 'Physics-based particles with force fields, trails, and additive blending',
    category: 'physics',
    tags: ['particles', 'physics', 'forces', 'vortex', 'animated'],
    animated: true,
    gpuHeavy: false,
    defaultParams: {
      count: 1500,
      gravity: 0,
      friction: 0.98,
      forceField: 'vortex',
      colorMode: 'velocity',
      trailLength: 20,
      size: 2,
      emitter: 'center',
    },
    paramSchema: [
      { key: 'count',       label: 'Particle Count', type: 'int',   min: 100,   max: 5000,  step: 100 },
      { key: 'gravity',     label: 'Gravity',        type: 'float', min: 0,     max: 2,     step: 0.05 },
      { key: 'friction',    label: 'Friction',       type: 'float', min: 0.9,   max: 1,     step: 0.001 },
      { key: 'forceField',  label: 'Force Field',    type: 'select', options: [
        { value: 'none',      label: 'None' },
        { value: 'radial',    label: 'Radial' },
        { value: 'vortex',    label: 'Vortex' },
        { value: 'dipole',    label: 'Dipole' },
        { value: 'turbulent', label: 'Turbulent' },
      ]},
      { key: 'colorMode',   label: 'Color Mode',     type: 'select', options: [
        { value: 'velocity', label: 'Velocity' },
        { value: 'age',      label: 'Age' },
        { value: 'position', label: 'Position' },
        { value: 'mono',     label: 'Mono' },
      ]},
      { key: 'trailLength', label: 'Trail Length',   type: 'int',   min: 0,     max: 50,    step: 1 },
      { key: 'size',        label: 'Particle Size',  type: 'float', min: 0.5,   max: 5,     step: 0.1 },
      { key: 'emitter',     label: 'Emitter',        type: 'select', options: [
        { value: 'center', label: 'Center' },
        { value: 'edges',  label: 'Edges' },
        { value: 'random', label: 'Random' },
        { value: 'ring',   label: 'Ring' },
      ]},
    ],
  },

  init(ctx: RenderContext): ParticlesState {
    const count = Math.min((ctx.params.count as number) ?? 1500, 5000);
    const size = (ctx.params.size as number) ?? 2;
    const emitter = (ctx.params.emitter as string) ?? 'center';
    const trailLength = (ctx.params.trailLength as number) ?? 20;

    const particles: Particle[] = [];
    for (let i = 0; i < count; i++) {
      particles.push(spawnParticle(
        ctx.width, ctx.height,
        emitter, size,
        (i / count) * 360,
        trailLength,
      ));
    }

    return { particles, noiseOffset: 0 };
  },

  update(ctx: RenderContext, state: ParticlesState): void {
    const { width, height, time } = ctx;
    const count = Math.min((ctx.params.count as number) ?? 1500, 5000);
    const gravity = (ctx.params.gravity as number) ?? 0;
    const friction = (ctx.params.friction as number) ?? 0.98;
    const forceField = (ctx.params.forceField as string) ?? 'vortex';
    const trailLength = (ctx.params.trailLength as number) ?? 20;
    const size = (ctx.params.size as number) ?? 2;
    const emitter = (ctx.params.emitter as string) ?? 'center';

    state.noiseOffset += 0.005;

    // Adjust count
    while (state.particles.length < count) {
      state.particles.push(spawnParticle(
        width, height, emitter, size,
        (state.particles.length / count) * 360,
        trailLength,
      ));
    }
    while (state.particles.length > count) {
      state.particles.pop();
    }

    for (const p of state.particles) {
      // Apply force field
      const [fx, fy] = computeForce(p.x, p.y, width, height, forceField, time);
      p.vx += fx;
      p.vy += fy + gravity * 0.1;
      p.vx *= friction;
      p.vy *= friction;

      // Update position
      p.x += p.vx;
      p.y += p.vy;

      // Wrap or bounce at edges
      if (p.x < 0) p.x += width;
      if (p.x >= width) p.x -= width;
      if (p.y < 0) p.y += height;
      if (p.y >= height) p.y -= height;

      p.age++;

      // Update trail
      if (trailLength > 0) {
        p.trail.push({ x: p.x, y: p.y });
        if (p.trail.length > trailLength) p.trail.shift();
      } else {
        p.trail.length = 0;
      }

      // Respawn if died
      if (p.age >= p.life) {
        const fresh = spawnParticle(width, height, emitter, size, p.hue, trailLength);
        Object.assign(p, fresh);
      }
    }
  },

  render(ctx: RenderContext, state: ParticlesState): void {
    const { ctx: c, width, height } = ctx;
    const colorMode = (ctx.params.colorMode as string) ?? 'velocity';
    const size = (ctx.params.size as number) ?? 2;
    const trailLength = (ctx.params.trailLength as number) ?? 20;

    // Semi-transparent fade for trail effect
    c.fillStyle = 'rgba(0,0,0,0.15)';
    c.fillRect(0, 0, width, height);

    c.save();
    c.globalCompositeOperation = 'lighter';

    for (const p of state.particles) {
      const lifeRatio = 1 - p.age / p.life;
      let color: string;

      switch (colorMode) {
        case 'velocity':
          color = velocityToColor(p.vx, p.vy);
          break;
        case 'age':
          color = `hsl(${(1 - lifeRatio) * 240},100%,${40 + lifeRatio * 40}%)`;
          break;
        case 'position':
          color = `hsl(${(p.x / width) * 180 + (p.y / height) * 180},100%,60%)`;
          break;
        default: // mono
          color = `rgba(200,220,255,${lifeRatio * 0.8})`;
      }

      // Draw trail
      if (trailLength > 0 && p.trail.length > 1) {
        c.beginPath();
        c.moveTo(p.trail[0].x, p.trail[0].y);
        for (let ti = 1; ti < p.trail.length; ti++) {
          c.lineTo(p.trail[ti].x, p.trail[ti].y);
        }
        c.strokeStyle = color.startsWith('hsl') ?
          color.replace('hsl(', 'hsla(').replace(')', `,${lifeRatio * 0.5})`) :
          color;
        c.lineWidth = size * 0.5;
        c.lineCap = 'round';
        c.stroke();
      }

      // Draw particle dot
      c.beginPath();
      c.arc(p.x, p.y, size * lifeRatio, 0, Math.PI * 2);
      c.fillStyle = color;
      c.fill();
    }

    c.restore();
  },
};

export default particles;
