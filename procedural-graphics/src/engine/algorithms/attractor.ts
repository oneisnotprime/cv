import type { Algorithm, RenderContext, AlgorithmState } from '@/engine/types';

// ─── Strange attractors with additive blending point cloud ───────────────────

// ── ODE definitions ──────────────────────────────────────────────────────────

function lorenz(x: number, y: number, z: number, sigma: number, rho: number, beta: number): [number, number, number] {
  return [
    sigma * (y - x),
    x * (rho - z) - y,
    x * y - beta * z,
  ];
}

function rossler(x: number, y: number, z: number, a: number, b: number, c: number): [number, number, number] {
  return [-(y + z), x + a * y, b + z * (x - c)];
}

function thomas(x: number, y: number, z: number, b: number): [number, number, number] {
  return [Math.sin(y) - b * x, Math.sin(z) - b * y, Math.sin(x) - b * z];
}

// 2D attractors (z unused)
function clifford(x: number, y: number, a: number, b: number, c: number, d: number): [number, number] {
  return [
    Math.sin(a * y) + c * Math.cos(a * x),
    Math.sin(b * x) + d * Math.cos(b * y),
  ];
}

function dejong(x: number, y: number, a: number, b: number, c: number, d: number): [number, number] {
  return [Math.sin(a * y) - Math.cos(b * x), Math.sin(c * x) - Math.cos(d * y)];
}

// ── RK4 for 3D ODE ────────────────────────────────────────────────────────────

type Deriv3 = (x: number, y: number, z: number) => [number, number, number];

function rk4_3d(x: number, y: number, z: number, dt: number, f: Deriv3): [number, number, number] {
  const [k1x, k1y, k1z] = f(x, y, z);
  const [k2x, k2y, k2z] = f(x + dt * k1x / 2, y + dt * k1y / 2, z + dt * k1z / 2);
  const [k3x, k3y, k3z] = f(x + dt * k2x / 2, y + dt * k2y / 2, z + dt * k2z / 2);
  const [k4x, k4y, k4z] = f(x + dt * k3x,     y + dt * k3y,     z + dt * k3z);
  return [
    x + dt * (k1x + 2 * k2x + 2 * k3x + k4x) / 6,
    y + dt * (k1y + 2 * k2y + 2 * k3y + k4y) / 6,
    z + dt * (k1z + 2 * k2z + 2 * k3z + k4z) / 6,
  ];
}

interface AttractorPoint { x: number; y: number; z: number; age: number; speed: number; }

interface AttractorState {
  points: AttractorPoint[];
  accumBuffer: Float32Array;
  rotAngle: number;
  lastType: string;
}

const ACCUMULATION_DECAY = 0.992;

function colorFromMode(mode: string, age: number, speed: number, posVal: number): [number, number, number] {
  switch (mode) {
    case 'age': {
      const hue = (age * 2) % 360;
      const l = 0.3 + (1 - age / 500) * 0.5;
      return hslToRgb(hue / 360, 1, Math.max(0.1, Math.min(0.9, l)));
    }
    case 'speed': {
      const s = Math.min(1, speed * 0.5);
      return hslToRgb(0.6 - s * 0.5, 1, 0.3 + s * 0.5);
    }
    default: { // position
      const hue = ((posVal + 1) * 0.5 * 240) % 360;
      return hslToRgb(hue / 360, 0.9, 0.55);
    }
  }
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h * 6) % 2 - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 1/6)      { r = c; g = x; }
  else if (h < 2/6) { r = x; g = c; }
  else if (h < 3/6) { g = c; b = x; }
  else if (h < 4/6) { g = x; b = c; }
  else if (h < 5/6) { r = x; b = c; }
  else               { r = c; b = x; }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

function seedPoints(type: string, count: number): AttractorPoint[] {
  const pts: AttractorPoint[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const r = 0.01 + (i % 7) * 0.001;
    if (type === 'lorenz' || type === 'rossler' || type === 'thomas') {
      pts.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r, z: r * 5, age: 0, speed: 0 });
    } else {
      pts.push({ x: (Math.random() * 2 - 1) * 2, y: (Math.random() * 2 - 1) * 2, z: 0, age: 0, speed: 0 });
    }
  }
  return pts;
}

export const attractor: Algorithm = {
  meta: {
    id: 'attractor',
    name: 'Strange Attractors',
    description: 'Lorenz, Clifford, De Jong, Rössler, and Thomas attractors with additive blending',
    category: 'physics',
    tags: ['attractor', 'lorenz', 'chaos', 'fractal'],
    animated: true,
    gpuHeavy: false,
    defaultParams: {
      type:           'clifford',
      speed:          2,
      pointsPerFrame: 1000,
      colorMode:      'position',
      sigma:          10,
      rho:            28,
      beta:           2.667,
      a:              -1.4,
      b:              1.6,
      c:              1.0,
      d:              0.7,
    },
    paramSchema: [
      {
        key: 'type', label: 'Attractor Type', type: 'select',
        options: [
          { value: 'lorenz',   label: 'Lorenz'   },
          { value: 'clifford', label: 'Clifford' },
          { value: 'dejong',   label: 'De Jong'  },
          { value: 'rossler',  label: 'Rössler'  },
          { value: 'thomas',   label: 'Thomas'   },
        ],
      },
      { key: 'speed',          label: 'Speed',           type: 'float', min: 0.5, max: 5,    step: 0.1  },
      { key: 'pointsPerFrame', label: 'Points Per Frame', type: 'int',  min: 100, max: 5000, step: 100  },
      {
        key: 'colorMode', label: 'Color Mode', type: 'select',
        options: [
          { value: 'age',      label: 'Age'      },
          { value: 'speed',    label: 'Speed'    },
          { value: 'position', label: 'Position' },
        ],
      },
      { key: 'sigma', label: 'σ (Lorenz)',      type: 'float', min: 1,   max: 20,  step: 0.1  },
      { key: 'rho',   label: 'ρ (Lorenz)',      type: 'float', min: 1,   max: 50,  step: 0.5  },
      { key: 'beta',  label: 'β (Lorenz)',      type: 'float', min: 0.1, max: 5,   step: 0.05 },
      { key: 'a',     label: 'a (Clifford/DJ)', type: 'float', min: -3,  max: 3,   step: 0.05 },
      { key: 'b',     label: 'b (Clifford/DJ)', type: 'float', min: -3,  max: 3,   step: 0.05 },
      { key: 'c',     label: 'c',               type: 'float', min: -3,  max: 3,   step: 0.05 },
      { key: 'd',     label: 'd',               type: 'float', min: -3,  max: 3,   step: 0.05 },
    ],
  },

  init(ctx: RenderContext): AttractorState {
    const type = (ctx.params.type as string) ?? 'clifford';
    const ppf  = (ctx.params.pointsPerFrame as number) ?? 1000;
    return {
      points: seedPoints(type, ppf),
      accumBuffer: new Float32Array(ctx.width * ctx.height * 3),
      rotAngle: 0,
      lastType: type,
    };
  },

  update(ctx: RenderContext, state: AttractorState): void {
    const type  = (ctx.params.type  as string) ?? 'clifford';
    const speed = (ctx.params.speed as number) ?? 2;
    const ppf   = (ctx.params.pointsPerFrame as number) ?? 1000;

    if (type !== state.lastType) {
      state.points = seedPoints(type, ppf);
      state.lastType = type;
      state.accumBuffer.fill(0);
    }

    // Resize accum buffer if canvas changed
    if (state.accumBuffer.length !== ctx.width * ctx.height * 3) {
      state.accumBuffer = new Float32Array(ctx.width * ctx.height * 3);
    }

    state.rotAngle += 0.003 * speed;

    // Decay accumulation buffer
    for (let i = 0; i < state.accumBuffer.length; i++) state.accumBuffer[i] *= ACCUMULATION_DECAY;

    const sigma = (ctx.params.sigma as number) ?? 10;
    const rho   = (ctx.params.rho   as number) ?? 28;
    const beta  = (ctx.params.beta  as number) ?? 8/3;
    const a     = (ctx.params.a     as number) ?? -1.4;
    const b     = (ctx.params.b     as number) ?? 1.6;
    const c     = (ctx.params.c     as number) ?? 1.0;
    const d     = (ctx.params.d     as number) ?? 0.7;

    const { width, height } = ctx;
    const colorMode = (ctx.params.colorMode as string) ?? 'position';

    // Scale factors to map to canvas
    const scaleMap: Record<string, [number, number, number, number]> = {
      lorenz:   [width / 80,  height / 80,  0,        0       ],
      rossler:  [width / 30,  height / 30,  0,        0       ],
      thomas:   [width / 8,   height / 8,   0,        0       ],
      clifford: [width / 4,   height / 4,   0,        0       ],
      dejong:   [width / 4,   height / 4,   0,        0       ],
    };
    const [sx, sy] = scaleMap[type] || [width / 4, height / 4, 0, 0];
    const dt = 0.005 * speed;

    // Ensure enough points
    while (state.points.length < ppf) {
      const extra = seedPoints(type, 1);
      state.points.push(...extra);
    }
    while (state.points.length > ppf) state.points.pop();

    for (const pt of state.points) {
      let nx = pt.x; let ny = pt.y; let nz = pt.z;
      let dx = 0; let dy = 0;

      switch (type) {
        case 'lorenz': {
          [nx, ny, nz] = rk4_3d(pt.x, pt.y, pt.z, dt, (x, y, z) => lorenz(x, y, z, sigma, rho, beta));
          dx = nx - pt.x; dy = ny - pt.y;
          break;
        }
        case 'rossler': {
          [nx, ny, nz] = rk4_3d(pt.x, pt.y, pt.z, dt, (x, y, z) => rossler(x, y, z, 0.2, 0.2, 5.7));
          dx = nx - pt.x; dy = ny - pt.y;
          break;
        }
        case 'thomas': {
          [nx, ny, nz] = rk4_3d(pt.x, pt.y, pt.z, dt, (x, y, z) => thomas(x, y, z, 0.19));
          dx = nx - pt.x; dy = ny - pt.y;
          break;
        }
        case 'clifford': {
          [nx, ny] = clifford(pt.x, pt.y, a, b, c, d);
          dx = nx - pt.x; dy = ny - pt.y;
          nz = 0;
          break;
        }
        case 'dejong': {
          [nx, ny] = dejong(pt.x, pt.y, a, b, c, d);
          dx = nx - pt.x; dy = ny - pt.y;
          nz = 0;
          break;
        }
      }

      pt.x = nx; pt.y = ny; pt.z = nz;
      pt.age++;
      pt.speed = Math.sqrt(dx * dx + dy * dy);

      // Project 3D with slow rotation for 3D attractors
      let projX: number; let projY: number;
      if (type === 'lorenz' || type === 'rossler' || type === 'thomas') {
        const cosA = Math.cos(state.rotAngle);
        const sinA = Math.sin(state.rotAngle);
        projX = pt.x * cosA - pt.z * sinA;
        projY = pt.y;
      } else {
        projX = pt.x;
        projY = pt.y;
      }

      const px = Math.round(width / 2 + projX * sx);
      const py = Math.round(height / 2 + projY * sy);

      if (px >= 0 && px < width && py >= 0 && py < height) {
        const bi = (py * width + px) * 3;
        const posVal = (type === 'lorenz') ? pt.z / 50 : pt.x / 3;
        const [r, g, b2] = colorFromMode(colorMode, pt.age, pt.speed, posVal);
        state.accumBuffer[bi]     += r * 0.15;
        state.accumBuffer[bi + 1] += g * 0.15;
        state.accumBuffer[bi + 2] += b2 * 0.15;
      }
    }
  },

  render(ctx: RenderContext, state: AttractorState): void {
    const { ctx: c, width, height, pixelData, imageData } = ctx;

    for (let i = 0; i < width * height; i++) {
      const bi = i * 3;
      pixelData[i * 4]     = Math.min(255, Math.round(state.accumBuffer[bi]));
      pixelData[i * 4 + 1] = Math.min(255, Math.round(state.accumBuffer[bi + 1]));
      pixelData[i * 4 + 2] = Math.min(255, Math.round(state.accumBuffer[bi + 2]));
      pixelData[i * 4 + 3] = 255;
    }

    c.putImageData(imageData, 0, 0);
  },
};

export default attractor;
