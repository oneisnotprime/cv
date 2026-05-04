import type { Algorithm, RenderContext, AlgorithmState } from '@/engine/types';

// ─── Classic Plasma Effect ────────────────────────────────────────────────────

interface PlasmaState {
  offscreen: OffscreenCanvas | null;
  offCtx: OffscreenCanvasRenderingContext2D | null;
  imgData: ImageData | null;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  s /= 100; l /= 100;
  const c2 = (1 - Math.abs(2 * l - 1)) * s;
  const x = c2 * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c2 / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60)       { r = c2; g = x;  b = 0; }
  else if (h < 120) { r = x;  g = c2; b = 0; }
  else if (h < 180) { r = 0;  g = c2; b = x; }
  else if (h < 240) { r = 0;  g = x;  b = c2; }
  else if (h < 300) { r = x;  g = 0;  b = c2; }
  else              { r = c2; g = 0;  b = x; }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

function valueToColor(v: number, scheme: string): [number, number, number] {
  // v in ~[-1..1] per wave, normalized across numWaves
  const t = Math.max(0, Math.min(1, (v + 1) / 2));
  switch (scheme) {
    case 'fire': {
      if (t < 0.25) return [Math.round(t / 0.25 * 200), 0, 0];
      else if (t < 0.5) {
        const s = (t - 0.25) / 0.25;
        return [200 + Math.round(s * 55), Math.round(s * 150), 0];
      } else if (t < 0.75) {
        const s = (t - 0.5) / 0.25;
        return [255, 150 + Math.round(s * 105), Math.round(s * 50)];
      } else {
        const s = (t - 0.75) / 0.25;
        return [255, 255, 50 + Math.round(s * 205)];
      }
    }
    case 'ice':
      return hslToRgb(200 + t * 40, 80 + t * 20, 30 + t * 70);
    case 'psychedelic':
      return hslToRgb(t * 720, 100, 50);
    case 'pastel':
      return hslToRgb(t * 360, 60, 75);
    default: // rainbow
      return hslToRgb(t * 360, 90, 55);
  }
}

// Simple turbulence noise
function turbNoise(x: number, y: number, t: number): number {
  const ix = Math.floor(x); const iy = Math.floor(y);
  const fx = x - ix; const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx); const uy = fy * fy * (3 - 2 * fy);
  const h = (a: number, b: number) => {
    let s = Math.sin(a * 127.1 + b * 311.7 + t * 74.3) * 43758.5453;
    return s - Math.floor(s);
  };
  return h(ix, iy) + ux * (h(ix+1, iy) - h(ix, iy))
       + uy * (h(ix, iy+1) - h(ix, iy))
       + ux * uy * (h(ix, iy) - h(ix+1, iy) - h(ix, iy+1) + h(ix+1, iy+1));
}

export const plasma: Algorithm = {
  meta: {
    id: 'plasma',
    name: 'Plasma',
    description: 'Classic plasma effect with sine wave combinations and rich color palettes',
    category: 'pattern',
    tags: ['plasma', 'sine', 'psychedelic', 'ambient', 'worship'],
    animated: true,
    gpuHeavy: false,
    defaultParams: {
      scale: 50,
      speed: 1,
      colorScheme: 'rainbow',
      numWaves: 4,
      turbulence: 0,
      center: true,
    },
    paramSchema: [
      { key: 'scale',       label: 'Scale',         type: 'float', min: 10,  max: 200, step: 5 },
      { key: 'speed',       label: 'Speed',         type: 'float', min: 0.1, max: 5,   step: 0.1 },
      { key: 'colorScheme', label: 'Color Scheme',  type: 'select', options: [
        { value: 'rainbow',      label: 'Rainbow' },
        { value: 'fire',         label: 'Fire' },
        { value: 'ice',          label: 'Ice' },
        { value: 'psychedelic',  label: 'Psychedelic' },
        { value: 'pastel',       label: 'Pastel' },
      ]},
      { key: 'numWaves',    label: 'Num Waves',     type: 'int',   min: 2,   max: 8,   step: 1 },
      { key: 'turbulence',  label: 'Turbulence',    type: 'float', min: 0,   max: 2,   step: 0.05 },
      { key: 'center',      label: 'Center Wave',   type: 'bool' },
    ],
  },

  init(ctx: RenderContext): PlasmaState {
    let offscreen: OffscreenCanvas | null = null;
    let offCtx: OffscreenCanvasRenderingContext2D | null = null;
    let imgData: ImageData | null = null;
    try {
      offscreen = new OffscreenCanvas(ctx.width, ctx.height);
      offCtx = offscreen.getContext('2d') as OffscreenCanvasRenderingContext2D;
      imgData = offCtx.createImageData(ctx.width, ctx.height);
    } catch { /* fallback */ }
    return { offscreen, offCtx, imgData };
  },

  update(_ctx: RenderContext, _state: PlasmaState): void {
    // All computation happens in render
  },

  render(ctx: RenderContext, state: PlasmaState): void {
    const { ctx: c, width, height, time } = ctx;
    const scale = (ctx.params.scale as number) ?? 50;
    const speed = (ctx.params.speed as number) ?? 1;
    const colorScheme = (ctx.params.colorScheme as string) ?? 'rainbow';
    const numWaves = (ctx.params.numWaves as number) ?? 4;
    const turbulence = (ctx.params.turbulence as number) ?? 0;
    const centerWave = (ctx.params.center as boolean) ?? true;

    const t = time * 0.001 * speed;
    const cx = width / 2;
    const cy = height / 2;
    const S = scale;

    const imgData = state.imgData ?? ctx.imageData;
    const data = imgData.data;

    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        let nx = px / S;
        let ny = py / S;

        if (turbulence > 0) {
          const tn = turbulence * (turbNoise(nx * 0.5, ny * 0.5, t * 0.3) - 0.5) * 2;
          nx += tn;
          ny += tn * 0.7;
        }

        let v = 0;
        if (numWaves >= 1) v += Math.sin(nx + t);
        if (numWaves >= 2) v += Math.sin(ny + t * 0.7);
        if (numWaves >= 3) v += Math.sin((nx + ny) * 0.7 + t * 1.3);
        if (numWaves >= 4 && centerWave) {
          const dx = (px - cx) / S;
          const dy = (py - cy) / S;
          v += Math.sin(Math.sqrt(dx * dx + dy * dy) * 2 + t);
        } else if (numWaves >= 4) {
          v += Math.sin((nx - ny) * 0.8 + t * 1.1);
        }
        if (numWaves >= 5) v += Math.sin(nx * 1.5 - ny * 0.5 + t * 0.5);
        if (numWaves >= 6) v += Math.sin((nx - ny) * 0.8 + t * 1.1 + 1);
        if (numWaves >= 7) v += Math.cos(nx * ny * 0.1 + t * 0.3);
        if (numWaves >= 8) v += Math.sin(nx * 2 + Math.sin(t * 0.5 + ny));

        v /= numWaves; // normalize to ~[-1..1]

        const [r, g, b] = valueToColor(v, colorScheme);
        const idx = (py * width + px) * 4;
        data[idx]     = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = 255;
      }
    }

    if (state.offCtx && state.offscreen && state.imgData) {
      state.offCtx.putImageData(state.imgData, 0, 0);
      c.drawImage(state.offscreen, 0, 0);
    } else {
      c.putImageData(imgData, 0, 0);
    }
  },
};

export default plasma;
