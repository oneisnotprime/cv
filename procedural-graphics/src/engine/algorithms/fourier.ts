import type { Algorithm, RenderContext, AlgorithmState } from '@/engine/types';

// ─── Fourier Series Epicycle Animation ───────────────────────────────────────

interface Complex { re: number; im: number; }
interface Epicycle { freq: number; amp: number; phase: number; }

interface FourierState {
  epicycles: Epicycle[];
  drawnPath: { x: number; y: number }[];
  pathPoints: { x: number; y: number }[];
  animT: number;
  preset: string;
}

// ─── Path Presets ─────────────────────────────────────────────────────────────

function circlePath(n: number): { x: number; y: number }[] {
  return Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2;
    return { x: Math.cos(t), y: Math.sin(t) };
  });
}

function squarePath(n: number): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  const side = Math.floor(n / 4);
  for (let i = 0; i < side; i++) { pts.push({ x: -1 + (2 * i) / side, y: -1 }); }
  for (let i = 0; i < side; i++) { pts.push({ x: 1, y: -1 + (2 * i) / side }); }
  for (let i = 0; i < side; i++) { pts.push({ x: 1 - (2 * i) / side, y: 1 }); }
  for (let i = 0; i < side; i++) { pts.push({ x: -1, y: 1 - (2 * i) / side }); }
  return pts;
}

function starPath(n: number): { x: number; y: number }[] {
  return Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2;
    const r = 0.5 + 0.5 * Math.abs(Math.cos(5 * t));
    return { x: r * Math.cos(t), y: r * Math.sin(t) };
  });
}

function heartPath(n: number): { x: number; y: number }[] {
  return Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2;
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
    return { x: x / 17, y: y / 17 };
  });
}

function infinityPath(n: number): { x: number; y: number }[] {
  return Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2;
    const denom = 1 + Math.sin(t) * Math.sin(t);
    return {
      x: Math.cos(t) / denom,
      y: (Math.sin(t) * Math.cos(t)) / denom,
    };
  });
}

function trefoilPath(n: number): { x: number; y: number }[] {
  return Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2;
    const r = Math.cos(3 * t);
    return { x: r * Math.cos(t), y: r * Math.sin(t) };
  });
}

function getPathPoints(preset: string, n: number): { x: number; y: number }[] {
  switch (preset) {
    case 'circle':   return circlePath(n);
    case 'square':   return squarePath(n);
    case 'star':     return starPath(n);
    case 'heart':    return heartPath(n);
    case 'infinity': return infinityPath(n);
    case 'trefoil':  return trefoilPath(n);
    default:         return heartPath(n);
  }
}

// ─── DFT ─────────────────────────────────────────────────────────────────────

function dft(points: { x: number; y: number }[]): Epicycle[] {
  const N = points.length;
  const result: Epicycle[] = [];
  for (let k = 0; k < N; k++) {
    let re = 0, im = 0;
    for (let n = 0; n < N; n++) {
      const phi = (2 * Math.PI * k * n) / N;
      re += points[n].x * Math.cos(phi) + points[n].y * Math.sin(phi);
      im += -points[n].x * Math.sin(phi) + points[n].y * Math.cos(phi);
    }
    re /= N; im /= N;
    result.push({
      freq: k,
      amp: Math.sqrt(re * re + im * im),
      phase: Math.atan2(im, re),
    });
  }
  // Sort by amplitude descending for best visual approximation
  result.sort((a, b) => b.amp - a.amp);
  return result;
}

export const fourier: Algorithm = {
  meta: {
    id: 'fourier',
    name: 'Fourier Epicycles',
    description: 'Fourier series decomposition animating spinning epicycles to trace complex paths',
    category: 'geometric',
    tags: ['fourier', 'epicycles', 'math', 'animation', 'waves'],
    animated: true,
    gpuHeavy: false,
    defaultParams: {
      pathPreset: 'heart',
      numCircles: 32,
      showEpicycles: true,
      showPath: true,
      speed: 0.5,
      strokeColor: '#00d4ff',
      backgroundColor: '#0a0a1a',
    },
    paramSchema: [
      { key: 'pathPreset',    label: 'Path Preset',    type: 'select', options: [
        { value: 'circle',   label: 'Circle' },
        { value: 'square',   label: 'Square' },
        { value: 'star',     label: 'Star' },
        { value: 'heart',    label: 'Heart' },
        { value: 'infinity', label: 'Infinity' },
        { value: 'trefoil',  label: 'Trefoil' },
      ]},
      { key: 'numCircles',    label: 'Num Circles',    type: 'int',   min: 3,   max: 64,  step: 1 },
      { key: 'showEpicycles', label: 'Show Epicycles', type: 'bool' },
      { key: 'showPath',      label: 'Show Path',      type: 'bool' },
      { key: 'speed',         label: 'Speed',          type: 'float', min: 0.1, max: 3,   step: 0.05 },
      { key: 'strokeColor',   label: 'Stroke Color',   type: 'color' },
      { key: 'backgroundColor', label: 'Background',   type: 'color' },
    ],
  },

  init(ctx: RenderContext): FourierState {
    const preset = (ctx.params.pathPreset as string) ?? 'heart';
    const numCircles = (ctx.params.numCircles as number) ?? 32;
    const pathResolution = Math.max(numCircles * 4, 256);
    const pathPoints = getPathPoints(preset, pathResolution);
    const epicycles = dft(pathPoints).slice(0, numCircles);

    return {
      epicycles,
      drawnPath: [],
      pathPoints,
      animT: 0,
      preset,
    };
  },

  update(ctx: RenderContext, state: FourierState): void {
    const preset = (ctx.params.pathPreset as string) ?? 'heart';
    const numCircles = (ctx.params.numCircles as number) ?? 32;
    const speed = (ctx.params.speed as number) ?? 0.5;

    // Recompute if preset changed
    if (state.preset !== preset || state.epicycles.length !== numCircles) {
      const pathResolution = Math.max(numCircles * 4, 256);
      state.pathPoints = getPathPoints(preset, pathResolution);
      state.epicycles = dft(state.pathPoints).slice(0, numCircles);
      state.drawnPath = [];
      state.animT = 0;
      state.preset = preset;
      return;
    }

    state.animT += (Math.PI * 2 * speed) / 60;
    if (state.animT >= Math.PI * 2) {
      state.animT -= Math.PI * 2;
      state.drawnPath = [];
    }

    // Compute current tip position
    let x = 0, y = 0;
    const N = state.pathPoints.length;
    for (const ep of state.epicycles) {
      const angle = ep.freq * state.animT + ep.phase;
      x += ep.amp * Math.cos(angle);
      y += ep.amp * Math.sin(angle);
    }
    state.drawnPath.push({ x, y });
  },

  render(ctx: RenderContext, state: FourierState): void {
    const { ctx: c, width, height } = ctx;
    const showEpicycles = (ctx.params.showEpicycles as boolean) ?? true;
    const showPath = (ctx.params.showPath as boolean) ?? true;
    const strokeColor = (ctx.params.strokeColor as string) ?? '#00d4ff';
    const backgroundColor = (ctx.params.backgroundColor as string) ?? '#0a0a1a';

    c.fillStyle = backgroundColor;
    c.fillRect(0, 0, width, height);

    const cx = width / 2;
    const cy = height / 2;
    const scale = Math.min(width, height) * 0.38;

    c.save();
    c.translate(cx, cy);
    c.scale(scale, scale);

    // Draw epicycles
    if (showEpicycles) {
      let x = 0, y = 0;
      for (const ep of state.epicycles) {
        const px = x, py = y;
        const angle = ep.freq * state.animT + ep.phase;
        x += ep.amp * Math.cos(angle);
        y += ep.amp * Math.sin(angle);

        // Circle
        c.beginPath();
        c.arc(px, py, ep.amp, 0, Math.PI * 2);
        c.strokeStyle = 'rgba(255,255,255,0.12)';
        c.lineWidth = 1 / scale;
        c.stroke();

        // Radius line
        c.beginPath();
        c.moveTo(px, py);
        c.lineTo(x, y);
        c.strokeStyle = 'rgba(255,255,255,0.3)';
        c.lineWidth = 1 / scale;
        c.stroke();
      }
    }

    // Draw accumulated path
    if (showPath && state.drawnPath.length > 1) {
      c.beginPath();
      for (let i = 0; i < state.drawnPath.length; i++) {
        const pt = state.drawnPath[i];
        if (i === 0) c.moveTo(pt.x, pt.y);
        else c.lineTo(pt.x, pt.y);
      }
      c.strokeStyle = strokeColor;
      c.lineWidth = 2 / scale;
      c.lineCap = 'round';
      c.lineJoin = 'round';
      c.stroke();
    }

    // Draw tip dot
    if (state.drawnPath.length > 0) {
      const tip = state.drawnPath[state.drawnPath.length - 1];
      c.beginPath();
      c.arc(tip.x, tip.y, 3 / scale, 0, Math.PI * 2);
      c.fillStyle = strokeColor;
      c.fill();
    }

    c.restore();
  },
};

export default fourier;
