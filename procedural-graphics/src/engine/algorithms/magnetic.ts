import type { Algorithm, RenderContext, AlgorithmState } from '@/engine/types';

// ─── Magnetic field line visualization via Biot-Savart ───────────────────────

interface Dipole {
  x: number;       // normalized 0-1
  y: number;
  strength: number; // +1 = north, -1 = south
  baseX: number;
  baseY: number;
  orbitR: number;
  orbitSpeed: number;
  orbitPhase: number;
}

interface MagneticState {
  dipoles: Dipole[];
  seed: number;
}

function seededRand(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) | 0;
    return (s >>> 0) / 0xffffffff;
  };
}

// Compute B-field at (px,py) from all dipoles using 2D magnetic dipole formula
function bField(
  px: number,
  py: number,
  dipoles: Dipole[],
  strength: number,
  width: number,
  height: number,
): [number, number] {
  let bx = 0;
  let by = 0;
  for (const d of dipoles) {
    const dx = px - d.x * width;
    const dy = py - d.y * height;
    const r2 = dx * dx + dy * dy;
    if (r2 < 1) continue;
    const r = Math.sqrt(r2);
    const r3 = r2 * r;
    // 2D dipole: moment along +y for north, -y for south
    // B = (μ/r³)*(3(m·r̂)r̂ - m)  — treat dipole moment as (0, d.strength)
    const mx = 0;
    const my = d.strength * strength;
    const rdotm = (dx * mx + dy * my) / r;
    bx += (3 * rdotm * dx / r - mx) / r3;
    by += (3 * rdotm * dy / r - my) / r3;
  }
  return [bx, by];
}

function colorFromScheme(scheme: string, t: number, strength: number): string {
  const s = Math.min(1, Math.max(0, strength));
  switch (scheme) {
    case 'aurora': {
      const h = 140 + t * 100;
      const l = 40 + s * 40;
      return `hsl(${h % 360},100%,${l}%)`;
    }
    case 'fire': {
      const h = 10 + t * 40;
      const l = 30 + s * 50;
      return `hsl(${h % 60},100%,${l}%)`;
    }
    case 'ice': {
      const h = 190 + t * 40;
      const l = 40 + s * 40;
      return `hsl(${h % 360},80%,${l}%)`;
    }
    default: // plasma
    {
      const h = (t * 300) % 360;
      const l = 30 + s * 50;
      return `hsl(${h},100%,${l}%)`;
    }
  }
}

export const magnetic: Algorithm = {
  meta: {
    id: 'magnetic',
    name: 'Magnetic Field Lines',
    description: 'Biot-Savart magnetic dipole field lines traced with RK4 integration',
    category: 'physics',
    tags: ['magnetic', 'field lines', 'physics', 'biot-savart'],
    animated: true,
    gpuHeavy: false,
    defaultParams: {
      numDipoles: 3,
      numLines: 200,
      lineLength: 400,
      dipoleStrength: 2,
      colorScheme: 'plasma',
    },
    paramSchema: [
      { key: 'numDipoles',     label: 'Num Dipoles',     type: 'int',    min: 1,    max: 8,    step: 1 },
      { key: 'numLines',       label: 'Num Lines',       type: 'int',    min: 50,   max: 400,  step: 10 },
      { key: 'lineLength',     label: 'Line Length',     type: 'int',    min: 100,  max: 1000, step: 50 },
      { key: 'dipoleStrength', label: 'Dipole Strength', type: 'float',  min: 0.5,  max: 5,    step: 0.1 },
      {
        key: 'colorScheme', label: 'Color Scheme', type: 'select',
        options: [
          { value: 'plasma', label: 'Plasma' },
          { value: 'aurora', label: 'Aurora' },
          { value: 'fire',   label: 'Fire'   },
          { value: 'ice',    label: 'Ice'    },
        ],
      },
    ],
  },

  init(ctx: RenderContext): MagneticState {
    const numDipoles = (ctx.params.numDipoles as number) ?? 3;
    const rand = seededRand(42);
    const dipoles: Dipole[] = [];

    for (let i = 0; i < numDipoles; i++) {
      const bx = 0.2 + rand() * 0.6;
      const by = 0.2 + rand() * 0.6;
      dipoles.push({
        x: bx,
        y: by,
        strength: i % 2 === 0 ? 1 : -1,
        baseX: bx,
        baseY: by,
        orbitR: 0.03 + rand() * 0.05,
        orbitSpeed: 0.2 + rand() * 0.4,
        orbitPhase: rand() * Math.PI * 2,
      });
    }

    return { dipoles, seed: 42 };
  },

  update(ctx: RenderContext, state: MagneticState): void {
    const t = ctx.time * 0.001;
    const numDipoles = (ctx.params.numDipoles as number) ?? 3;

    // Rebuild if count changed
    if (state.dipoles.length !== numDipoles) {
      const rand = seededRand(state.seed + numDipoles);
      state.dipoles = [];
      for (let i = 0; i < numDipoles; i++) {
        const bx = 0.2 + rand() * 0.6;
        const by = 0.2 + rand() * 0.6;
        state.dipoles.push({
          x: bx, y: by, strength: i % 2 === 0 ? 1 : -1,
          baseX: bx, baseY: by,
          orbitR: 0.03 + rand() * 0.05,
          orbitSpeed: 0.2 + rand() * 0.4,
          orbitPhase: rand() * Math.PI * 2,
        });
      }
    }

    // Animate dipoles
    for (const d of state.dipoles) {
      const phase = t * d.orbitSpeed + d.orbitPhase;
      d.x = d.baseX + Math.cos(phase) * d.orbitR;
      d.y = d.baseY + Math.sin(phase) * d.orbitR;
    }
  },

  render(ctx: RenderContext, state: MagneticState): void {
    const { ctx: c, width, height } = ctx;
    const numLines     = (ctx.params.numLines     as number) ?? 200;
    const lineLength   = (ctx.params.lineLength   as number) ?? 400;
    const strength     = (ctx.params.dipoleStrength as number) ?? 2;
    const colorScheme  = (ctx.params.colorScheme  as string) ?? 'plasma';

    // Dark background
    c.fillStyle = '#050510';
    c.fillRect(0, 0, width, height);

    const step = 2.5;
    const rand = seededRand(99 + state.dipoles.length);

    // Seed points around each dipole and on a radial grid
    const seeds: [number, number][] = [];
    for (const d of state.dipoles) {
      const px = d.x * width;
      const py = d.y * height;
      const linesPerDipole = Math.floor(numLines / state.dipoles.length);
      for (let i = 0; i < linesPerDipole; i++) {
        const angle = (i / linesPerDipole) * Math.PI * 2;
        const r = 12 + rand() * 6;
        seeds.push([px + Math.cos(angle) * r, py + Math.sin(angle) * r]);
      }
    }

    for (const [sx, sy] of seeds) {
      let x = sx;
      let y = sy;
      let prevStrength = 0;

      c.beginPath();
      c.moveTo(x, y);

      for (let step2 = 0; step2 < lineLength; step2++) {
        const [bx, by] = bField(x, y, state.dipoles, strength * 500, width, height);
        const bMag = Math.sqrt(bx * bx + by * by);
        if (bMag < 1e-10) break;

        // RK4
        const k1x = bx / bMag; const k1y = by / bMag;
        const [b2x, b2y] = bField(x + step * k1x * 0.5, y + step * k1y * 0.5, state.dipoles, strength * 500, width, height);
        const b2m = Math.sqrt(b2x * b2x + b2y * b2y) + 1e-12;
        const k2x = b2x / b2m; const k2y = b2y / b2m;
        const [b3x, b3y] = bField(x + step * k2x * 0.5, y + step * k2y * 0.5, state.dipoles, strength * 500, width, height);
        const b3m = Math.sqrt(b3x * b3x + b3y * b3y) + 1e-12;
        const k3x = b3x / b3m; const k3y = b3y / b3m;
        const [b4x, b4y] = bField(x + step * k3x, y + step * k3y, state.dipoles, strength * 500, width, height);
        const b4m = Math.sqrt(b4x * b4x + b4y * b4y) + 1e-12;
        const k4x = b4x / b4m; const k4y = b4y / b4m;

        x += step * (k1x + 2 * k2x + 2 * k3x + k4x) / 6;
        y += step * (k1y + 2 * k2y + 2 * k3y + k4y) / 6;

        if (x < 0 || x > width || y < 0 || y > height) break;

        const normStrength = Math.min(1, Math.log1p(bMag) / 10);
        const t = step2 / lineLength;

        if (Math.abs(normStrength - prevStrength) > 0.05 || step2 === 0) {
          c.strokeStyle = colorFromScheme(colorScheme, t, normStrength);
          c.lineWidth = 0.5 + normStrength;
          c.globalAlpha = 0.6 + normStrength * 0.4;
          c.stroke();
          c.beginPath();
          c.moveTo(x, y);
          prevStrength = normStrength;
        } else {
          c.lineTo(x, y);
        }
      }
      c.stroke();
    }

    // Draw dipole markers
    c.globalAlpha = 1;
    for (const d of state.dipoles) {
      const px = d.x * width;
      const py = d.y * height;
      const isNorth = d.strength > 0;

      c.beginPath();
      c.arc(px, py, 8, 0, Math.PI * 2);
      c.fillStyle = isNorth ? '#ff4444' : '#4444ff';
      c.fill();
      c.strokeStyle = '#ffffff';
      c.lineWidth = 1.5;
      c.stroke();

      c.fillStyle = '#ffffff';
      c.font = 'bold 10px monospace';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(isNorth ? 'N' : 'S', px, py);
    }
  },
};

export default magnetic;
