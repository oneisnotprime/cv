import type { Algorithm, RenderContext, AlgorithmState } from '@/engine/types';

// ─── Mandelbrot / Julia set with smooth coloring ──────────────────────────────

// Bernstein polynomial color interpolation over 5 control colors
interface RGB { r: number; g: number; b: number; }

const COLOR_SCHEMES: Record<string, RGB[]> = {
  psychedelic: [
    { r: 0, g: 0, b: 0 },
    { r: 255, g: 0, b: 128 },
    { r: 0, g: 255, b: 255 },
    { r: 255, g: 200, b: 0 },
    { r: 128, g: 0, b: 255 },
  ],
  fire: [
    { r: 0, g: 0, b: 0 },
    { r: 128, g: 0, b: 0 },
    { r: 255, g: 80, b: 0 },
    { r: 255, g: 200, b: 50 },
    { r: 255, g: 255, b: 220 },
  ],
  ice: [
    { r: 0, g: 0, b: 20 },
    { r: 0, g: 30, b: 100 },
    { r: 0, g: 120, b: 220 },
    { r: 100, g: 200, b: 255 },
    { r: 220, g: 240, b: 255 },
  ],
  grayscale: [
    { r: 0, g: 0, b: 0 },
    { r: 60, g: 60, b: 60 },
    { r: 130, g: 130, b: 130 },
    { r: 200, g: 200, b: 200 },
    { r: 255, g: 255, b: 255 },
  ],
  electric: [
    { r: 0, g: 0, b: 0 },
    { r: 20, g: 0, b: 80 },
    { r: 0, g: 50, b: 255 },
    { r: 0, g: 200, b: 255 },
    { r: 255, g: 255, b: 100 },
  ],
};

function smoothColor(iter: number, maxIter: number, zMag2: number): number {
  if (iter >= maxIter) return 0;
  // Smooth iteration count using log escape
  const smooth = iter + 1 - Math.log2(Math.log2(Math.max(1, Math.sqrt(zMag2))));
  return Math.max(0, smooth) / maxIter;
}

function interpolateColor(t: number, colors: RGB[]): RGB {
  const n = colors.length - 1;
  const scaled = ((t * n * 3) % (n)) ;
  const lo = Math.floor(scaled) % colors.length;
  const hi = (lo + 1) % colors.length;
  const f = scaled - Math.floor(scaled);
  const a = colors[lo];
  const b = colors[hi];
  return {
    r: a.r + (b.r - a.r) * f,
    g: a.g + (b.g - a.g) * f,
    b: a.b + (b.b - a.b) * f,
  };
}

function iterateMandelbrot(cx: number, cy: number, maxIter: number): [number, number] {
  let zx = 0; let zy = 0;
  for (let i = 0; i < maxIter; i++) {
    const zx2 = zx * zx; const zy2 = zy * zy;
    if (zx2 + zy2 > 4) return [i, zx2 + zy2];
    const newZx = zx2 - zy2 + cx;
    zy = 2 * zx * zy + cy;
    zx = newZx;
  }
  return [maxIter, zx * zx + zy * zy];
}

function iterateJulia(zx0: number, zy0: number, cx: number, cy: number, maxIter: number): [number, number] {
  let zx = zx0; let zy = zy0;
  for (let i = 0; i < maxIter; i++) {
    const zx2 = zx * zx; const zy2 = zy * zy;
    if (zx2 + zy2 > 4) return [i, zx2 + zy2];
    const newZx = zx2 - zy2 + cx;
    zy = 2 * zx * zy + cy;
    zx = newZx;
  }
  return [maxIter, zx * zx + zy * zy];
}

interface MandelbrotState {
  needsRedraw: boolean;
  lastParams: string;
  animTime: number;
  juliaAnimPhase: number;
}

export const mandelbrot: Algorithm = {
  meta: {
    id: 'mandelbrot',
    name: 'Mandelbrot / Julia Set',
    description: 'Smooth Mandelbrot and Julia set renderer with Bernstein color interpolation',
    category: 'fractal',
    tags: ['mandelbrot', 'julia', 'fractal', 'complex numbers'],
    animated: true,
    gpuHeavy: true,
    defaultParams: {
      mode: 'mandelbrot',
      juliaC_re: -0.7,
      juliaC_im: 0.27,
      maxIter: 256,
      colorScheme: 'psychedelic',
      zoom: 1,
      centerX: 0,
      centerY: 0,
    },
    paramSchema: [
      {
        key: 'mode', label: 'Mode', type: 'select',
        options: [{ value: 'mandelbrot', label: 'Mandelbrot' }, { value: 'julia', label: 'Julia' }],
      },
      { key: 'juliaC_re',   label: 'Julia C (real)', type: 'float', min: -2,   max: 2,    step: 0.01  },
      { key: 'juliaC_im',   label: 'Julia C (imag)', type: 'float', min: -2,   max: 2,    step: 0.01  },
      { key: 'maxIter',     label: 'Max Iterations', type: 'int',   min: 64,   max: 1024, step: 16    },
      {
        key: 'colorScheme', label: 'Color Scheme', type: 'select',
        options: [
          { value: 'psychedelic', label: 'Psychedelic' },
          { value: 'fire',        label: 'Fire'        },
          { value: 'ice',         label: 'Ice'         },
          { value: 'grayscale',   label: 'Grayscale'   },
          { value: 'electric',    label: 'Electric'    },
        ],
      },
      { key: 'zoom',    label: 'Zoom',     type: 'float', min: 0.5, max: 100, step: 0.5 },
      { key: 'centerX', label: 'Center X', type: 'float', min: -2,  max: 2,   step: 0.01 },
      { key: 'centerY', label: 'Center Y', type: 'float', min: -2,  max: 2,   step: 0.01 },
    ],
  },

  init(_ctx: RenderContext): MandelbrotState {
    return { needsRedraw: true, lastParams: '', animTime: 0, juliaAnimPhase: 0 };
  },

  update(ctx: RenderContext, state: MandelbrotState): void {
    state.animTime += 0.008;
    state.juliaAnimPhase = state.animTime;
    const paramKey = JSON.stringify(ctx.params) + ctx.width + ctx.height;
    if (paramKey !== state.lastParams) {
      state.needsRedraw = true;
      state.lastParams = paramKey;
    }
  },

  render(ctx: RenderContext, state: MandelbrotState): void {
    const { ctx: c, width, height, pixelData, imageData } = ctx;
    const mode        = (ctx.params.mode        as string) ?? 'mandelbrot';
    const maxIter     = (ctx.params.maxIter     as number) ?? 256;
    const colorScheme = (ctx.params.colorScheme as string) ?? 'psychedelic';
    const zoom        = (ctx.params.zoom        as number) ?? 1;
    const centerX     = (ctx.params.centerX     as number) ?? 0;
    const centerY     = (ctx.params.centerY     as number) ?? 0;

    // Animated Julia parameters
    let juliaRe = (ctx.params.juliaC_re as number) ?? -0.7;
    let juliaIm = (ctx.params.juliaC_im as number) ?? 0.27;

    if (mode === 'julia') {
      // Animate Julia c in a small lemniscate
      juliaRe += Math.sin(state.juliaAnimPhase * 0.4) * 0.02;
      juliaIm += Math.cos(state.juliaAnimPhase * 0.3) * 0.015;
    }

    const colors = COLOR_SCHEMES[colorScheme] || COLOR_SCHEMES.psychedelic;
    const aspect = width / height;
    const scaleX = (3.5 / zoom) * aspect;
    const scaleY = 2.5 / zoom;

    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        const mx = centerX + (px / width - 0.5) * scaleX;
        const my = centerY + (py / height - 0.5) * scaleY;

        let iter: number, zMag2: number;
        if (mode === 'julia') {
          [iter, zMag2] = iterateJulia(mx, my, juliaRe, juliaIm, maxIter);
        } else {
          [iter, zMag2] = iterateMandelbrot(mx - 0.5, my, maxIter);
        }

        const i = (py * width + px) * 4;
        if (iter >= maxIter) {
          pixelData[i] = 0; pixelData[i + 1] = 0; pixelData[i + 2] = 0; pixelData[i + 3] = 255;
        } else {
          const t = smoothColor(iter, maxIter, zMag2);
          const col = interpolateColor(t, colors);
          pixelData[i]     = Math.round(col.r);
          pixelData[i + 1] = Math.round(col.g);
          pixelData[i + 2] = Math.round(col.b);
          pixelData[i + 3] = 255;
        }
      }
    }

    c.putImageData(imageData, 0, 0);
    state.needsRedraw = false;
  },
};

export default mandelbrot;
