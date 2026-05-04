import type { Algorithm, RenderContext, AlgorithmState } from '@/engine/types';

// ─── Spirograph / Hypotrochoid / Epitrochoid ──────────────────────────────────

interface CurvePoint {
  x: number;
  y: number;
}

interface SpirographState {
  trails: CurvePoint[][];  // one trail per curve
  tOffset: number[];       // per-curve t offset
  animT: number;           // accumulated animation t
  prevD: number;
  prevR: number;
}

function hypotrochoid(R: number, r: number, d: number, t: number): [number, number] {
  const x = (R - r) * Math.cos(t) + d * Math.cos(((R - r) / r) * t);
  const y = (R - r) * Math.sin(t) - d * Math.sin(((R - r) / r) * t);
  return [x, y];
}

function epitrochoid(R: number, r: number, d: number, t: number): [number, number] {
  const x = (R + r) * Math.cos(t) - d * Math.cos(((R + r) / r) * t);
  const y = (R + r) * Math.sin(t) - d * Math.sin(((R + r) / r) * t);
  return [x, y];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

// Compute the period of a hypotrochoid (lcm of the ratio)
function computePeriod(R: number, r: number): number {
  function gcd(a: number, b: number): number {
    a = Math.round(Math.abs(a)); b = Math.round(Math.abs(b));
    while (b) { const t = b; b = a % b; a = t; }
    return a;
  }
  // approximate integer ratio
  const scale = 100;
  const ri = Math.round(R * scale);
  const rj = Math.round(r * scale);
  const g = gcd(ri, rj);
  return (rj / g) * Math.PI * 2;
}

export const spirograph: Algorithm = {
  meta: {
    id: 'spirograph',
    name: 'Spirograph',
    description: 'Hypotrochoid and epitrochoid curves with beautiful color gradients',
    category: 'geometric',
    tags: ['spirograph', 'hypotrochoid', 'curves', 'geometric', 'animated'],
    animated: true,
    gpuHeavy: false,
    defaultParams: {
      R: 100,
      r: 35,
      d: 80,
      numCurves: 3,
      strokeWidth: 1.5,
      colorMode: 'rainbow',
      speed: 1,
      animate: true,
      drawMethod: 'stroke',
    },
    paramSchema: [
      { key: 'R',           label: 'Outer Radius (R)',  type: 'float', min: 50,  max: 200, step: 1 },
      { key: 'r',           label: 'Inner Radius (r)',  type: 'float', min: 10,  max: 100, step: 1 },
      { key: 'd',           label: 'Pen Distance (d)',  type: 'float', min: 10,  max: 150, step: 1 },
      { key: 'numCurves',   label: 'Num Curves',        type: 'int',   min: 1,   max: 8,   step: 1 },
      { key: 'strokeWidth', label: 'Stroke Width',      type: 'float', min: 0.5, max: 4,   step: 0.1 },
      { key: 'colorMode',   label: 'Color Mode',        type: 'select', options: [
        { value: 'rainbow',  label: 'Rainbow' },
        { value: 'gradient', label: 'Gradient' },
        { value: 'mono',     label: 'Monochrome' },
      ]},
      { key: 'speed',       label: 'Speed',             type: 'float', min: 0.5, max: 5,   step: 0.1 },
      { key: 'animate',     label: 'Animate',           type: 'bool' },
      { key: 'drawMethod',  label: 'Draw Method',       type: 'select', options: [
        { value: 'stroke', label: 'Stroke' },
        { value: 'fill',   label: 'Fill' },
        { value: 'dots',   label: 'Dots' },
      ]},
    ],
  },

  init(ctx: RenderContext): SpirographState {
    const numCurves = (ctx.params.numCurves as number) ?? 3;
    const trails: CurvePoint[][] = Array.from({ length: numCurves }, () => []);
    const tOffset = Array.from({ length: numCurves }, (_, i) => (i / numCurves) * Math.PI * 2);
    return {
      trails,
      tOffset,
      animT: 0,
      prevD: (ctx.params.d as number) ?? 80,
      prevR: (ctx.params.r as number) ?? 35,
    };
  },

  update(ctx: RenderContext, state: SpirographState): void {
    const animate = (ctx.params.animate as boolean) ?? true;
    const speed = (ctx.params.speed as number) ?? 1;
    const numCurves = (ctx.params.numCurves as number) ?? 3;
    const R = (ctx.params.R as number) ?? 100;
    const r = (ctx.params.r as number) ?? 35;
    const d = (ctx.params.d as number) ?? 80;

    // Reset trails if curves count or key params changed
    if (state.trails.length !== numCurves ||
        Math.abs(state.prevD - d) > 0.5 ||
        Math.abs(state.prevR - r) > 0.5) {
      state.trails = Array.from({ length: numCurves }, () => []);
      state.tOffset = Array.from({ length: numCurves }, (_, i) => (i / numCurves) * Math.PI * 2);
      state.animT = 0;
      state.prevD = d;
      state.prevR = r;
    }

    if (!animate) return;

    const dt = 0.016 * speed * 0.5;
    state.animT += dt;

    const period = computePeriod(R, r);
    const stepsPerFrame = Math.max(1, Math.floor(20 * speed));

    for (let s = 0; s < stepsPerFrame; s++) {
      const tt = state.animT + s * (dt / stepsPerFrame);
      for (let c = 0; c < numCurves; c++) {
        const [x, y] = hypotrochoid(R, r, d, tt + state.tOffset[c]);
        state.trails[c].push({ x, y });
        // Keep only one full period worth of points
        const maxPoints = Math.ceil((period / dt) * 1.05);
        if (state.trails[c].length > maxPoints) {
          state.trails[c].shift();
        }
      }
    }
  },

  render(ctx: RenderContext, state: SpirographState): void {
    const { ctx: c, width, height } = ctx;
    const R = (ctx.params.R as number) ?? 100;
    const r = (ctx.params.r as number) ?? 35;
    const d = (ctx.params.d as number) ?? 80;
    const numCurves = (ctx.params.numCurves as number) ?? 3;
    const strokeWidth = (ctx.params.strokeWidth as number) ?? 1.5;
    const colorMode = (ctx.params.colorMode as string) ?? 'rainbow';
    const animate = (ctx.params.animate as boolean) ?? true;
    const drawMethod = (ctx.params.drawMethod as string) ?? 'stroke';

    c.fillStyle = '#0a0a0a';
    c.fillRect(0, 0, width, height);

    const cx = width / 2;
    const cy = height / 2;
    const scale = Math.min(width, height) / (2 * (R + Math.abs(d) + 10));

    c.save();
    c.translate(cx, cy);
    c.scale(scale, scale);

    if (!animate) {
      // Draw complete curves statically
      const period = computePeriod(R, r);
      const steps = 2000;
      for (let ci = 0; ci < numCurves; ci++) {
        const phaseOff = (ci / numCurves) * Math.PI * 2;
        if (drawMethod === 'dots') {
          for (let s = 0; s <= steps; s++) {
            const t = (s / steps) * period;
            const [x, y] = hypotrochoid(R, r, d, t + phaseOff);
            const progress = s / steps;
            let color: string;
            if (colorMode === 'rainbow') {
              color = `hsl(${(progress * 360 + ci * (360 / numCurves)) % 360},100%,60%)`;
            } else if (colorMode === 'mono') {
              color = `rgba(255,255,255,${0.4 + progress * 0.6})`;
            } else {
              const [rr, gg, bb] = hslToRgb((ci / numCurves) * 300 + progress * 60, 100, 60);
              color = `rgb(${rr},${gg},${bb})`;
            }
            c.beginPath();
            c.arc(x, y, strokeWidth, 0, Math.PI * 2);
            c.fillStyle = color;
            c.fill();
          }
        } else {
          c.beginPath();
          for (let s = 0; s <= steps; s++) {
            const t = (s / steps) * period;
            const [x, y] = hypotrochoid(R, r, d, t + phaseOff);
            if (s === 0) c.moveTo(x, y); else c.lineTo(x, y);
          }
          c.closePath();
          if (drawMethod === 'fill') {
            if (colorMode === 'rainbow') {
              c.fillStyle = `hsla(${(ci / numCurves) * 360},80%,60%,0.3)`;
            } else {
              c.fillStyle = `rgba(200,200,255,0.2)`;
            }
            c.fill();
          }
          const grad = c.createLinearGradient(-R - d, 0, R + d, 0);
          if (colorMode === 'rainbow') {
            grad.addColorStop(0, `hsl(${ci * 60},100%,60%)`);
            grad.addColorStop(0.5, `hsl(${ci * 60 + 120},100%,60%)`);
            grad.addColorStop(1, `hsl(${ci * 60 + 240},100%,60%)`);
          } else if (colorMode === 'mono') {
            grad.addColorStop(0, 'rgba(255,255,255,0.8)');
            grad.addColorStop(1, 'rgba(255,255,255,0.8)');
          } else {
            const hue = (ci / numCurves) * 300;
            grad.addColorStop(0, `hsl(${hue},100%,70%)`);
            grad.addColorStop(1, `hsl(${(hue + 60) % 360},100%,70%)`);
          }
          c.strokeStyle = grad;
          c.lineWidth = strokeWidth;
          c.stroke();
        }
      }
    } else {
      // Draw animated trails
      for (let ci = 0; ci < state.trails.length; ci++) {
        const trail = state.trails[ci];
        if (trail.length < 2) continue;
        const baseHue = (ci / numCurves) * 300;

        if (drawMethod === 'dots') {
          for (let s = 0; s < trail.length; s++) {
            const progress = s / trail.length;
            let color: string;
            if (colorMode === 'rainbow') {
              color = `hsla(${(progress * 360 + ci * (360 / numCurves)) % 360},100%,60%,${progress})`;
            } else if (colorMode === 'mono') {
              color = `rgba(255,255,255,${progress * 0.8})`;
            } else {
              color = `hsla(${baseHue + progress * 60},100%,60%,${progress})`;
            }
            c.beginPath();
            c.arc(trail[s].x, trail[s].y, strokeWidth, 0, Math.PI * 2);
            c.fillStyle = color;
            c.fill();
          }
        } else {
          // Segment-by-segment with gradient color
          for (let s = 1; s < trail.length; s++) {
            const progress = s / trail.length;
            const alpha = Math.pow(progress, 0.5);
            let color: string;
            if (colorMode === 'rainbow') {
              color = `hsla(${(progress * 360 + ci * (360 / numCurves)) % 360},100%,60%,${alpha})`;
            } else if (colorMode === 'mono') {
              color = `rgba(255,255,255,${alpha * 0.9})`;
            } else {
              color = `hsla(${baseHue + progress * 60},100%,60%,${alpha})`;
            }
            c.beginPath();
            c.moveTo(trail[s - 1].x, trail[s - 1].y);
            c.lineTo(trail[s].x, trail[s].y);
            c.strokeStyle = color;
            c.lineWidth = strokeWidth;
            c.lineCap = 'round';
            c.stroke();
          }
        }
      }
    }

    c.restore();
  },
};

export default spirograph;
