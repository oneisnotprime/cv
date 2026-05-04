import type { Algorithm, RenderContext, AlgorithmState } from '@/engine/types';

// ─── Kaleidoscope / radial symmetry with Perlin-noise driven source patterns ──

// Minimal 2D gradient noise (Value noise with smooth interpolation)
function fade(t: number): number { return t * t * t * (t * (t * 6 - 15) + 10); }
function lerp(a: number, b: number, t: number): number { return a + t * (b - a); }

const PERM: number[] = (() => {
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  return [...p, ...p];
})();

function grad2(hash: number, x: number, y: number): number {
  const h = hash & 7;
  const u = h < 4 ? x : y;
  const v = h < 4 ? y : x;
  return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
}

function noise2(x: number, y: number): number {
  const X = Math.floor(x) & 255;
  const Y = Math.floor(y) & 255;
  const xf = x - Math.floor(x);
  const yf = y - Math.floor(y);
  const u = fade(xf);
  const v = fade(yf);
  const aa = PERM[PERM[X] + Y];
  const ab = PERM[PERM[X] + Y + 1];
  const ba = PERM[PERM[X + 1] + Y];
  const bb = PERM[PERM[X + 1] + Y + 1];
  return lerp(
    lerp(grad2(aa, xf, yf), grad2(ba, xf - 1, yf), u),
    lerp(grad2(ab, xf, yf - 1), grad2(bb, xf - 1, yf - 1), u),
    v,
  );
}

function fbm(x: number, y: number, octaves: number): number {
  let val = 0; let amp = 0.5; let freq = 1;
  for (let i = 0; i < octaves; i++) {
    val += noise2(x * freq, y * freq) * amp;
    amp *= 0.5; freq *= 2;
  }
  return val;
}

interface SymmetryState {
  offscreen: OffscreenCanvas;
  offCtx: OffscreenCanvasRenderingContext2D;
  rotation: number;
}

function drawPattern(
  c: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  w: number, h: number,
  t: number,
  pattern: string,
  complexity: number,
  colorShift: number,
  speed: number,
): void {
  const cx = w / 2;
  const cy = h / 2;
  const maxR = Math.min(w, h) * 0.5;

  switch (pattern) {
    case 'spirals': {
      for (let i = 0; i < complexity * 3; i++) {
        const baseAngle = (i / (complexity * 3)) * Math.PI * 2 + t * speed * 0.5;
        const hue = (colorShift + i * 30 + t * 40) % 360;
        c.beginPath();
        for (let r = 0; r < maxR; r += 1.5) {
          const spiralAngle = baseAngle + r * 0.04 + noise2(r * 0.05, t * 0.3 + i) * 1.5;
          const x = cx + Math.cos(spiralAngle) * r;
          const y = cy + Math.sin(spiralAngle) * r;
          if (r === 0) c.moveTo(x, y); else c.lineTo(x, y);
        }
        c.strokeStyle = `hsl(${hue},100%,60%)`;
        c.lineWidth = 1.5;
        c.globalAlpha = 0.7;
        c.stroke();
      }
      break;
    }
    case 'dots': {
      for (let i = 0; i < complexity * 20; i++) {
        const angle = (i / (complexity * 20)) * Math.PI * 2;
        const r = maxR * (0.2 + 0.7 * ((Math.sin(t * speed + i * 0.7) + 1) * 0.5));
        const nx = fbm(Math.cos(angle) * 2 + t * 0.1, Math.sin(angle) * 2, 2) * 20;
        const ny = fbm(Math.sin(angle) * 2 + t * 0.1, Math.cos(angle) * 2, 2) * 20;
        const x = cx + Math.cos(angle) * r + nx;
        const y = cy + Math.sin(angle) * r + ny;
        const hue = (colorShift + i * (360 / (complexity * 20)) + t * 30) % 360;
        c.beginPath();
        c.arc(x, y, 2 + complexity, 0, Math.PI * 2);
        c.fillStyle = `hsl(${hue},100%,65%)`;
        c.globalAlpha = 0.8;
        c.fill();
      }
      break;
    }
    case 'lines': {
      for (let i = 0; i < complexity * 4; i++) {
        const angle1 = (i / (complexity * 4)) * Math.PI * 2 + t * speed * 0.2;
        const angle2 = angle1 + Math.PI * (0.3 + 0.4 * Math.sin(t * speed * 0.7 + i));
        const r1 = maxR * (0.1 + 0.9 * Math.abs(Math.sin(t * 0.5 + i * 0.8)));
        const r2 = maxR * (0.1 + 0.9 * Math.abs(Math.cos(t * 0.4 + i * 0.6)));
        const hue = (colorShift + i * 15 + t * 20) % 360;
        c.beginPath();
        c.moveTo(cx + Math.cos(angle1) * r1, cy + Math.sin(angle1) * r1);
        c.lineTo(cx + Math.cos(angle2) * r2, cy + Math.sin(angle2) * r2);
        c.strokeStyle = `hsl(${hue},90%,60%)`;
        c.lineWidth = 1 + Math.sin(t + i) * 0.5;
        c.globalAlpha = 0.6;
        c.stroke();
      }
      break;
    }
    default: // curves
    {
      for (let i = 0; i < complexity * 3; i++) {
        const hue = (colorShift + i * (360 / (complexity * 3)) + t * 30) % 360;
        c.beginPath();
        const startAngle = (i / (complexity * 3)) * Math.PI * 2;
        for (let s = 0; s <= 100; s++) {
          const frac = s / 100;
          const r = maxR * frac;
          const noiseVal = fbm(
            Math.cos(startAngle + frac * Math.PI) * 2 + t * 0.2,
            Math.sin(startAngle + frac * Math.PI) * 2 + i * 0.5,
            3,
          );
          const angle = startAngle + noiseVal * 4 + t * speed * 0.3;
          const x = cx + Math.cos(angle) * r;
          const y = cy + Math.sin(angle) * r;
          if (s === 0) c.moveTo(x, y); else c.lineTo(x, y);
        }
        c.strokeStyle = `hsl(${hue},100%,60%)`;
        c.lineWidth = 1.5;
        c.globalAlpha = 0.75;
        c.stroke();
      }
    }
  }
}

export const symmetry: Algorithm = {
  meta: {
    id: 'symmetry',
    name: 'Kaleidoscope Symmetry',
    description: 'N-fold rotational symmetry with Perlin-noise driven source patterns',
    category: 'pattern',
    tags: ['kaleidoscope', 'symmetry', 'perlin', 'geometry'],
    animated: true,
    gpuHeavy: false,
    defaultParams: {
      folds: 6,
      mirror: true,
      speed: 1,
      complexity: 4,
      colorShift: 0,
      pattern: 'curves',
    },
    paramSchema: [
      { key: 'folds',      label: 'Folds',       type: 'int',    min: 2,   max: 24,  step: 1   },
      { key: 'mirror',     label: 'Mirror',       type: 'bool'                                  },
      { key: 'speed',      label: 'Speed',        type: 'float',  min: 0.1, max: 3,   step: 0.1 },
      { key: 'complexity', label: 'Complexity',   type: 'int',    min: 1,   max: 8,   step: 1   },
      { key: 'colorShift', label: 'Color Shift',  type: 'float',  min: 0,   max: 360, step: 1   },
      {
        key: 'pattern', label: 'Pattern', type: 'select',
        options: [
          { value: 'curves',  label: 'Curves'  },
          { value: 'spirals', label: 'Spirals' },
          { value: 'dots',    label: 'Dots'    },
          { value: 'lines',   label: 'Lines'   },
        ],
      },
    ],
  },

  init(ctx: RenderContext): SymmetryState {
    const offscreen = new OffscreenCanvas(ctx.width, ctx.height);
    const offCtx = offscreen.getContext('2d') as OffscreenCanvasRenderingContext2D;
    return { offscreen, offCtx, rotation: 0 };
  },

  update(ctx: RenderContext, state: SymmetryState): void {
    const speed = (ctx.params.speed as number) ?? 1;
    state.rotation += speed * 0.003;
    // resize offscreen if canvas changed
    if (state.offscreen.width !== ctx.width || state.offscreen.height !== ctx.height) {
      state.offscreen.width = ctx.width;
      state.offscreen.height = ctx.height;
    }
  },

  render(ctx: RenderContext, state: SymmetryState): void {
    const { ctx: c, width, height } = ctx;
    const folds      = (ctx.params.folds      as number)  ?? 6;
    const mirror     = (ctx.params.mirror     as boolean) ?? true;
    const speed      = (ctx.params.speed      as number)  ?? 1;
    const complexity = (ctx.params.complexity as number)  ?? 4;
    const colorShift = (ctx.params.colorShift as number)  ?? 0;
    const pattern    = (ctx.params.pattern    as string)  ?? 'curves';
    const t = ctx.time * 0.001;

    const oc = state.offCtx;
    oc.clearRect(0, 0, width, height);
    oc.fillStyle = '#000000';
    oc.fillRect(0, 0, width, height);

    // Draw source into one wedge on offscreen
    drawPattern(oc, width, height, t, pattern, complexity, colorShift, speed);

    // Compose onto main canvas with N-fold symmetry
    c.fillStyle = '#000000';
    c.fillRect(0, 0, width, height);

    const cx = width / 2;
    const cy = height / 2;
    const sliceAngle = (Math.PI * 2) / folds;

    c.save();
    c.translate(cx, cy);

    for (let i = 0; i < folds; i++) {
      c.save();
      c.rotate(i * sliceAngle + state.rotation);
      // Clip to wedge
      c.beginPath();
      c.moveTo(0, 0);
      const bigR = Math.sqrt(width * width + height * height);
      c.arc(0, 0, bigR, -sliceAngle / 2, sliceAngle / 2);
      c.closePath();
      c.clip();
      c.drawImage(state.offscreen, -cx, -cy);
      c.restore();

      if (mirror) {
        c.save();
        c.rotate(i * sliceAngle + state.rotation);
        c.scale(1, -1);
        c.beginPath();
        c.moveTo(0, 0);
        const bigR2 = Math.sqrt(width * width + height * height);
        c.arc(0, 0, bigR2, -sliceAngle / 2, sliceAngle / 2);
        c.closePath();
        c.clip();
        c.drawImage(state.offscreen, -cx, -cy);
        c.restore();
      }
    }

    c.restore();
  },
};

export default symmetry;
