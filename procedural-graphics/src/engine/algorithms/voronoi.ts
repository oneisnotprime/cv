import type { Algorithm, RenderContext, AlgorithmState } from '@/engine/types';

// ─── Animated Voronoi diagram ─────────────────────────────────────────────────

interface VoronoiPoint {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hue: number;
  orbitAngle: number;
  orbitR: number;
  orbitCX: number;
  orbitCY: number;
  orbitSpeed: number;
  flowBaseX: number;
  flowBaseY: number;
  wobblePhase: number;
}

interface VoronoiState {
  points: VoronoiPoint[];
  imgData: ImageData;
}

function seededRand(seed: number): () => number {
  let s = (seed ^ 0xdeadbeef) >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function distance(
  px: number, py: number,
  qx: number, qy: number,
  metric: string,
): number {
  const dx = Math.abs(px - qx);
  const dy = Math.abs(py - qy);
  switch (metric) {
    case 'manhattan':  return dx + dy;
    case 'chebyshev':  return Math.max(dx, dy);
    default:           return Math.sqrt(dx * dx + dy * dy);
  }
}

function hueToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60)       { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else              { r = c; g = 0; b = x; }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

function schemeColor(scheme: string, hue: number, id: number): [number, number, number] {
  switch (scheme) {
    case 'pastel':  return hueToRgb(hue, 0.5, 0.75);
    case 'mono':    return hueToRgb(220, 0.15, 0.3 + (id * 0.07) % 0.5);
    case 'sunset':  return hueToRgb((hue * 0.3 + 20) % 60, 0.9, 0.5);
    default:        return hueToRgb(hue, 1.0, 0.55);  // vivid
  }
}

export const voronoi: Algorithm = {
  meta: {
    id: 'voronoi',
    name: 'Voronoi Diagram',
    description: 'Animated Voronoi cells with moving seeds and smooth colored boundaries',
    category: 'geometric',
    tags: ['voronoi', 'geometry', 'cells', 'animation'],
    animated: true,
    gpuHeavy: true,
    defaultParams: {
      numPoints:   30,
      speed:       0.5,
      borderWidth: 1,
      colorScheme: 'vivid',
      metric:      'euclidean',
      animateMode: 'bounce',
    },
    paramSchema: [
      { key: 'numPoints',   label: 'Num Points',   type: 'int',   min: 5,    max: 100, step: 1   },
      { key: 'speed',       label: 'Speed',        type: 'float', min: 0.1,  max: 3,   step: 0.1 },
      { key: 'borderWidth', label: 'Border Width', type: 'float', min: 0,    max: 5,   step: 0.5 },
      {
        key: 'colorScheme', label: 'Color Scheme', type: 'select',
        options: [
          { value: 'pastel',  label: 'Pastel'  },
          { value: 'vivid',   label: 'Vivid'   },
          { value: 'mono',    label: 'Mono'    },
          { value: 'sunset',  label: 'Sunset'  },
        ],
      },
      {
        key: 'metric', label: 'Distance Metric', type: 'select',
        options: [
          { value: 'euclidean',  label: 'Euclidean'  },
          { value: 'manhattan',  label: 'Manhattan'  },
          { value: 'chebyshev',  label: 'Chebyshev'  },
        ],
      },
      {
        key: 'animateMode', label: 'Animation Mode', type: 'select',
        options: [
          { value: 'bounce', label: 'Bounce' },
          { value: 'orbit',  label: 'Orbit'  },
          { value: 'flow',   label: 'Flow'   },
        ],
      },
    ],
  },

  init(ctx: RenderContext): VoronoiState {
    const numPoints = (ctx.params.numPoints as number) ?? 30;
    const rand = seededRand(777);
    const points: VoronoiPoint[] = [];

    for (let i = 0; i < numPoints; i++) {
      const x = rand() * ctx.width;
      const y = rand() * ctx.height;
      points.push({
        x, y,
        vx: (rand() - 0.5) * 2,
        vy: (rand() - 0.5) * 2,
        hue: rand() * 360,
        orbitAngle: rand() * Math.PI * 2,
        orbitR: 30 + rand() * 100,
        orbitCX: rand() * ctx.width,
        orbitCY: rand() * ctx.height,
        orbitSpeed: (rand() - 0.5) * 0.5,
        flowBaseX: x,
        flowBaseY: y,
        wobblePhase: rand() * Math.PI * 2,
      });
    }

    return {
      points,
      imgData: ctx.imageData,
    };
  },

  update(ctx: RenderContext, state: VoronoiState): void {
    const speed       = (ctx.params.speed       as number) ?? 0.5;
    const animateMode = (ctx.params.animateMode as string) ?? 'bounce';
    const numPoints   = (ctx.params.numPoints   as number) ?? 30;
    const t = ctx.time * 0.001 * speed;

    // Adjust count
    const rand = seededRand((Date.now() / 100) | 0);
    while (state.points.length < numPoints) {
      const x = rand() * ctx.width;
      const y = rand() * ctx.height;
      state.points.push({
        x, y,
        vx: (rand() - 0.5) * 2,
        vy: (rand() - 0.5) * 2,
        hue: rand() * 360,
        orbitAngle: rand() * Math.PI * 2,
        orbitR: 30 + rand() * 100,
        orbitCX: rand() * ctx.width,
        orbitCY: rand() * ctx.height,
        orbitSpeed: (rand() - 0.5) * 0.5,
        flowBaseX: x,
        flowBaseY: y,
        wobblePhase: rand() * Math.PI * 2,
      });
    }
    while (state.points.length > numPoints) state.points.pop();

    for (const p of state.points) {
      switch (animateMode) {
        case 'orbit':
          p.orbitAngle += p.orbitSpeed * speed * 0.02;
          p.x = p.orbitCX + Math.cos(p.orbitAngle) * p.orbitR;
          p.y = p.orbitCY + Math.sin(p.orbitAngle) * p.orbitR;
          // Keep in bounds with wraparound of orbit center
          if (p.orbitCX > ctx.width  + p.orbitR) p.orbitCX -= ctx.width  + p.orbitR * 2;
          if (p.orbitCX < -p.orbitR)              p.orbitCX += ctx.width  + p.orbitR * 2;
          if (p.orbitCY > ctx.height + p.orbitR)  p.orbitCY -= ctx.height + p.orbitR * 2;
          if (p.orbitCY < -p.orbitR)              p.orbitCY += ctx.height + p.orbitR * 2;
          break;

        case 'flow': {
          // Lissajous-like organic flow
          const wobble = Math.sin(t * 1.3 + p.wobblePhase) * 15;
          p.x = p.flowBaseX + Math.sin(t * 0.7 + p.wobblePhase) * 60 + wobble;
          p.y = p.flowBaseY + Math.cos(t * 0.5 + p.wobblePhase * 1.3) * 60 + wobble;
          break;
        }

        default: // bounce
          p.x += p.vx * speed;
          p.y += p.vy * speed;
          if (p.x < 0) { p.x = 0; p.vx = Math.abs(p.vx); }
          if (p.x > ctx.width)  { p.x = ctx.width;  p.vx = -Math.abs(p.vx); }
          if (p.y < 0) { p.y = 0; p.vy = Math.abs(p.vy); }
          if (p.y > ctx.height) { p.y = ctx.height; p.vy = -Math.abs(p.vy); }
          // Organic wobble
          p.vx += (Math.random() - 0.5) * 0.05;
          p.vy += (Math.random() - 0.5) * 0.05;
          const spd = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
          if (spd > 2) { p.vx /= spd; p.vy /= spd; }
          break;
      }
    }
  },

  render(ctx: RenderContext, state: VoronoiState): void {
    const { ctx: c, width, height, pixelData, imageData } = ctx;
    const borderWidth = (ctx.params.borderWidth as number) ?? 1;
    const colorScheme = (ctx.params.colorScheme as string) ?? 'vivid';
    const metric      = (ctx.params.metric      as string) ?? 'euclidean';
    const border2 = borderWidth * borderWidth;

    const pts = state.points;
    const n = pts.length;

    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        let d1 = Infinity; let d2 = Infinity;
        let nearest = 0;

        for (let i = 0; i < n; i++) {
          const d = distance(px, py, pts[i].x, pts[i].y, metric);
          if (d < d1) { d2 = d1; d1 = d; nearest = i; }
          else if (d < d2) { d2 = d; }
        }

        const idx = (py * width + px) * 4;
        const diff = d2 - d1;

        if (borderWidth > 0 && diff < borderWidth) {
          // Border: interpolate towards black
          const t = diff / borderWidth;
          const [r, g, b] = schemeColor(colorScheme, pts[nearest].hue, nearest);
          pixelData[idx]     = Math.round(r * t);
          pixelData[idx + 1] = Math.round(g * t);
          pixelData[idx + 2] = Math.round(b * t);
          pixelData[idx + 3] = 255;
        } else {
          const [r, g, b] = schemeColor(colorScheme, pts[nearest].hue, nearest);
          // Subtle shading by distance
          const shade = Math.max(0.4, 1 - d1 / 300);
          pixelData[idx]     = Math.round(r * shade);
          pixelData[idx + 1] = Math.round(g * shade);
          pixelData[idx + 2] = Math.round(b * shade);
          pixelData[idx + 3] = 255;
        }
      }
    }

    c.putImageData(imageData, 0, 0);

    // Draw seed point markers
    c.globalAlpha = 0.6;
    for (const p of pts) {
      c.beginPath();
      c.arc(p.x, p.y, 3, 0, Math.PI * 2);
      c.fillStyle = '#ffffff';
      c.fill();
    }
    c.globalAlpha = 1;
  },
};

export default voronoi;
