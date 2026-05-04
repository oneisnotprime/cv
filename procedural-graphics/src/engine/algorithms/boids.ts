import type { Algorithm, RenderContext, AlgorithmState } from '@/engine/types';

// ─── Boid Flocking Simulation ─────────────────────────────────────────────────

interface Boid {
  x: number;
  y: number;
  vx: number;
  vy: number;
  flock: number;
  hue: number;
  trail: { x: number; y: number }[];
}

interface BoidsState {
  boids: Boid[];
  flockColors: number[];
}

const FLOCK_HUES = [0, 210, 120, 60, 300];

function spawnBoid(
  width: number,
  height: number,
  flockId: number,
  maxSpeed: number,
): Boid {
  const angle = Math.random() * Math.PI * 2;
  const speed = maxSpeed * (0.5 + Math.random() * 0.5);
  return {
    x: Math.random() * width,
    y: Math.random() * height,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    flock: flockId,
    hue: FLOCK_HUES[flockId % FLOCK_HUES.length],
    trail: [],
  };
}

function limit(vx: number, vy: number, max: number): [number, number] {
  const mag = Math.sqrt(vx * vx + vy * vy);
  if (mag > max) { return [(vx / mag) * max, (vy / mag) * max]; }
  return [vx, vy];
}

export const boids: Algorithm = {
  meta: {
    id: 'boids',
    name: 'Boids Flocking',
    description: "Reynolds' flocking simulation with separation, alignment, and cohesion",
    category: 'organic',
    tags: ['boids', 'flocking', 'simulation', 'emergent', 'ai'],
    animated: true,
    gpuHeavy: false,
    defaultParams: {
      count: 150,
      separationRadius: 25,
      alignmentRadius: 50,
      cohesionRadius: 75,
      separationWeight: 1.5,
      alignmentWeight: 1,
      cohesionWeight: 1,
      maxSpeed: 3,
      colorMode: 'flock',
      showTrails: false,
      numFlocks: 1,
      avoidWalls: true,
    },
    paramSchema: [
      { key: 'count',             label: 'Boid Count',         type: 'int',   min: 20,   max: 500,  step: 10 },
      { key: 'separationRadius',  label: 'Separation Radius',  type: 'float', min: 10,   max: 80,   step: 1 },
      { key: 'alignmentRadius',   label: 'Alignment Radius',   type: 'float', min: 20,   max: 100,  step: 1 },
      { key: 'cohesionRadius',    label: 'Cohesion Radius',    type: 'float', min: 20,   max: 150,  step: 1 },
      { key: 'separationWeight',  label: 'Separation Weight',  type: 'float', min: 0.5,  max: 5,    step: 0.1 },
      { key: 'alignmentWeight',   label: 'Alignment Weight',   type: 'float', min: 0.5,  max: 5,    step: 0.1 },
      { key: 'cohesionWeight',    label: 'Cohesion Weight',    type: 'float', min: 0.5,  max: 5,    step: 0.1 },
      { key: 'maxSpeed',          label: 'Max Speed',          type: 'float', min: 1,    max: 10,   step: 0.5 },
      { key: 'colorMode',         label: 'Color Mode',         type: 'select', options: [
        { value: 'velocity',  label: 'Velocity' },
        { value: 'flock',     label: 'Flock' },
        { value: 'direction', label: 'Direction' },
        { value: 'rainbow',   label: 'Rainbow' },
      ]},
      { key: 'showTrails',        label: 'Show Trails',        type: 'bool' },
      { key: 'numFlocks',         label: 'Num Flocks',         type: 'int',   min: 1,    max: 5,    step: 1 },
      { key: 'avoidWalls',        label: 'Avoid Walls',        type: 'bool' },
    ],
  },

  init(ctx: RenderContext): BoidsState {
    const count = (ctx.params.count as number) ?? 150;
    const numFlocks = (ctx.params.numFlocks as number) ?? 1;
    const maxSpeed = (ctx.params.maxSpeed as number) ?? 3;

    const boids: Boid[] = [];
    for (let i = 0; i < count; i++) {
      const flock = i % numFlocks;
      boids.push(spawnBoid(ctx.width, ctx.height, flock, maxSpeed));
    }

    return {
      boids,
      flockColors: FLOCK_HUES,
    };
  },

  update(ctx: RenderContext, state: BoidsState): void {
    const { width, height } = ctx;
    const count = (ctx.params.count as number) ?? 150;
    const numFlocks = (ctx.params.numFlocks as number) ?? 1;
    const separationRadius = (ctx.params.separationRadius as number) ?? 25;
    const alignmentRadius = (ctx.params.alignmentRadius as number) ?? 50;
    const cohesionRadius = (ctx.params.cohesionRadius as number) ?? 75;
    const separationWeight = (ctx.params.separationWeight as number) ?? 1.5;
    const alignmentWeight = (ctx.params.alignmentWeight as number) ?? 1;
    const cohesionWeight = (ctx.params.cohesionWeight as number) ?? 1;
    const maxSpeed = (ctx.params.maxSpeed as number) ?? 3;
    const showTrails = (ctx.params.showTrails as boolean) ?? false;
    const avoidWalls = (ctx.params.avoidWalls as boolean) ?? true;

    // Adjust population
    while (state.boids.length < count) {
      const flock = state.boids.length % numFlocks;
      state.boids.push(spawnBoid(width, height, flock, maxSpeed));
    }
    while (state.boids.length > count) {
      state.boids.pop();
    }

    const sepR2 = separationRadius * separationRadius;
    const aliR2 = alignmentRadius * alignmentRadius;
    const cohR2 = cohesionRadius * cohesionRadius;
    const margin = 80;
    const wallForce = 0.8;

    for (const b of state.boids) {
      let sepX = 0, sepY = 0, sepCount = 0;
      let aliVX = 0, aliVY = 0, aliCount = 0;
      let cohX = 0, cohY = 0, cohCount = 0;

      for (const other of state.boids) {
        if (other === b) continue;
        // Only same flock for alignment/cohesion; all for separation
        const dx = other.x - b.x;
        const dy = other.y - b.y;
        const d2 = dx * dx + dy * dy;

        if (d2 < sepR2 && d2 > 0) {
          const d = Math.sqrt(d2);
          sepX -= dx / d;
          sepY -= dy / d;
          sepCount++;
        }
        if (other.flock === b.flock) {
          if (d2 < aliR2) {
            aliVX += other.vx;
            aliVY += other.vy;
            aliCount++;
          }
          if (d2 < cohR2) {
            cohX += other.x;
            cohY += other.y;
            cohCount++;
          }
        }
      }

      let ax = 0, ay = 0;

      if (sepCount > 0) {
        ax += (sepX / sepCount) * separationWeight * 0.1;
        ay += (sepY / sepCount) * separationWeight * 0.1;
      }
      if (aliCount > 0) {
        const avgVX = aliVX / aliCount;
        const avgVY = aliVY / aliCount;
        ax += (avgVX - b.vx) * alignmentWeight * 0.05;
        ay += (avgVY - b.vy) * alignmentWeight * 0.05;
      }
      if (cohCount > 0) {
        const avgX = cohX / cohCount;
        const avgY = cohY / cohCount;
        ax += (avgX - b.x) * cohesionWeight * 0.001;
        ay += (avgY - b.y) * cohesionWeight * 0.001;
      }

      // Wall avoidance
      if (avoidWalls) {
        if (b.x < margin) ax += wallForce * (margin - b.x) / margin;
        if (b.x > width - margin) ax -= wallForce * (b.x - (width - margin)) / margin;
        if (b.y < margin) ay += wallForce * (margin - b.y) / margin;
        if (b.y > height - margin) ay -= wallForce * (b.y - (height - margin)) / margin;
      }

      b.vx += ax;
      b.vy += ay;
      [b.vx, b.vy] = limit(b.vx, b.vy, maxSpeed);

      b.x += b.vx;
      b.y += b.vy;

      // Wrap around edges if not avoiding walls
      if (!avoidWalls) {
        if (b.x < 0) b.x += width;
        if (b.x >= width) b.x -= width;
        if (b.y < 0) b.y += height;
        if (b.y >= height) b.y -= height;
      } else {
        b.x = Math.max(0, Math.min(width, b.x));
        b.y = Math.max(0, Math.min(height, b.y));
      }

      // Trail
      if (showTrails) {
        b.trail.push({ x: b.x, y: b.y });
        if (b.trail.length > 20) b.trail.shift();
      } else {
        b.trail.length = 0;
      }
    }
  },

  render(ctx: RenderContext, state: BoidsState): void {
    const { ctx: c, width, height } = ctx;
    const colorMode = (ctx.params.colorMode as string) ?? 'flock';
    const showTrails = (ctx.params.showTrails as boolean) ?? false;
    const maxSpeed = (ctx.params.maxSpeed as number) ?? 3;

    c.fillStyle = 'rgba(8,8,20,0.85)';
    c.fillRect(0, 0, width, height);

    for (const b of state.boids) {
      const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      let hue: number;
      let lightness = 65;

      switch (colorMode) {
        case 'velocity':
          hue = (speed / maxSpeed) * 240;
          lightness = 50 + (speed / maxSpeed) * 30;
          break;
        case 'direction':
          hue = ((Math.atan2(b.vy, b.vx) / (Math.PI * 2)) + 1) % 1 * 360;
          break;
        case 'rainbow':
          hue = ((b.x / width) * 180 + (b.y / height) * 180) % 360;
          break;
        default: // flock
          hue = FLOCK_HUES[b.flock % FLOCK_HUES.length];
      }

      const color = `hsl(${hue},90%,${lightness}%)`;

      // Draw trail
      if (showTrails && b.trail.length > 1) {
        c.beginPath();
        c.moveTo(b.trail[0].x, b.trail[0].y);
        for (let ti = 1; ti < b.trail.length; ti++) {
          c.lineTo(b.trail[ti].x, b.trail[ti].y);
        }
        c.strokeStyle = `hsla(${hue},80%,60%,0.3)`;
        c.lineWidth = 1;
        c.stroke();
      }

      // Draw triangular arrowhead
      const angle = Math.atan2(b.vy, b.vx);
      const size = 6;
      c.save();
      c.translate(b.x, b.y);
      c.rotate(angle);
      c.beginPath();
      c.moveTo(size, 0);
      c.lineTo(-size * 0.6, -size * 0.4);
      c.lineTo(-size * 0.6, size * 0.4);
      c.closePath();
      c.fillStyle = color;
      c.fill();
      c.restore();
    }
  },
};

export default boids;
