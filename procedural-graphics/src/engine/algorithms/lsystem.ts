import type { Algorithm, RenderContext, AlgorithmState } from '@/engine/types';

// ─── L-System fractal plants with turtle graphics ────────────────────────────

interface LSystemPreset {
  axiom: string;
  rules: Record<string, string>;
  angle: number;
  defaultIter: number;
  scale: number;
  startX: number; // fraction of canvas width
  startY: number; // fraction of canvas height
  startAngle: number; // degrees; 0=right, -90=up
}

const PRESETS: Record<string, LSystemPreset> = {
  plant: {
    axiom: 'X',
    rules: { X: 'F+[[X]-X]-F[-FX]+X', F: 'FF' },
    angle: 25, defaultIter: 5, scale: 1,
    startX: 0.5, startY: 1.0, startAngle: -90,
  },
  dragon: {
    axiom: 'FX',
    rules: { X: 'X+YF+', Y: '-FX-Y' },
    angle: 90, defaultIter: 12, scale: 1,
    startX: 0.4, startY: 0.5, startAngle: 0,
  },
  sierpinski: {
    axiom: 'F-G-G',
    rules: { F: 'F-G+F+G-F', G: 'GG' },
    angle: 120, defaultIter: 6, scale: 1,
    startX: 0.1, startY: 0.9, startAngle: 0,
  },
  snowflake: {
    axiom: 'F++F++F',
    rules: { F: 'F-F++F-F' },
    angle: 60, defaultIter: 4, scale: 1,
    startX: 0.2, startY: 0.4, startAngle: 0,
  },
  bush: {
    axiom: 'Y',
    rules: { X: 'X[-FFF][+FFF]FX', Y: 'YFX[+Y][-Y]' },
    angle: 25, defaultIter: 5, scale: 1,
    startX: 0.5, startY: 1.0, startAngle: -90,
  },
  fern: {
    axiom: 'X',
    rules: { X: 'F+[[X]-X]-F[-FX]+X', F: 'FF' },
    angle: 22.5, defaultIter: 6, scale: 1,
    startX: 0.5, startY: 1.0, startAngle: -90,
  },
};

function rewrite(axiom: string, rules: Record<string, string>, iters: number): string {
  let s = axiom;
  for (let i = 0; i < iters; i++) {
    let next = '';
    for (const ch of s) next += rules[ch] ?? ch;
    s = next;
    if (s.length > 500000) break; // guard
  }
  return s;
}

function buildTurtle(
  str: string,
  startX: number,
  startY: number,
  startAngle: number,
  stepLen: number,
  angleDeg: number,
  width: number,
  height: number,
): Array<{ x1: number; y1: number; x2: number; y2: number; depth: number }> {
  const lines: Array<{ x1: number; y1: number; x2: number; y2: number; depth: number }> = [];
  let x = startX; let y = startY;
  let angle = startAngle * (Math.PI / 180);
  const stack: Array<[number, number, number]> = [];
  let depth = 0;

  for (const ch of str) {
    switch (ch) {
      case 'F':
      case 'G': {
        const nx = x + Math.cos(angle) * stepLen;
        const ny = y + Math.sin(angle) * stepLen;
        lines.push({ x1: x, y1: y, x2: nx, y2: ny, depth });
        x = nx; y = ny;
        break;
      }
      case 'f': { x += Math.cos(angle) * stepLen; y += Math.sin(angle) * stepLen; break; }
      case '+': { angle += angleDeg * (Math.PI / 180); break; }
      case '-': { angle -= angleDeg * (Math.PI / 180); break; }
      case '[': { stack.push([x, y, angle]); depth++; break; }
      case ']': {
        const state = stack.pop();
        if (state) [x, y, angle] = state;
        depth = Math.max(0, depth - 1);
        break;
      }
    }
  }

  return lines;
}

function fitLines(
  lines: Array<{ x1: number; y1: number; x2: number; y2: number; depth: number }>,
  canvasW: number,
  canvasH: number,
  margin: number,
): Array<{ x1: number; y1: number; x2: number; y2: number; depth: number }> {
  if (lines.length === 0) return lines;

  let minX = Infinity; let maxX = -Infinity;
  let minY = Infinity; let maxY = -Infinity;
  for (const l of lines) {
    minX = Math.min(minX, l.x1, l.x2);
    maxX = Math.max(maxX, l.x1, l.x2);
    minY = Math.min(minY, l.y1, l.y2);
    maxY = Math.max(maxY, l.y1, l.y2);
  }

  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const scale = Math.min((canvasW - margin * 2) / rangeX, (canvasH - margin * 2) / rangeY);
  const offX = (canvasW - rangeX * scale) / 2 - minX * scale;
  const offY = (canvasH - rangeY * scale) / 2 - minY * scale;

  return lines.map(l => ({
    x1: l.x1 * scale + offX,
    y1: l.y1 * scale + offY,
    x2: l.x2 * scale + offX,
    y2: l.y2 * scale + offY,
    depth: l.depth,
  }));
}

interface LSystemState {
  lines: Array<{ x1: number; y1: number; x2: number; y2: number; depth: number }>;
  drawnCount: number;
  maxDepth: number;
  lastPreset: string;
  lastIter: number;
  growthPhase: number;
}

export const lsystem: Algorithm = {
  meta: {
    id: 'lsystem',
    name: 'L-System Fractals',
    description: 'String-rewriting L-systems rendered with turtle graphics and depth coloring',
    category: 'fractal',
    tags: ['l-system', 'fractal', 'turtle', 'plant'],
    animated: true,
    gpuHeavy: false,
    defaultParams: {
      preset:       'plant',
      iterations:   5,
      angle:        25,
      length:       8,
      width:        1.5,
      colorMode:    'gradient',
      animateGrowth: false,
    },
    paramSchema: [
      {
        key: 'preset', label: 'Preset', type: 'select',
        options: [
          { value: 'plant',      label: 'Plant'      },
          { value: 'dragon',     label: 'Dragon'     },
          { value: 'sierpinski', label: 'Sierpinski' },
          { value: 'snowflake',  label: 'Snowflake'  },
          { value: 'bush',       label: 'Bush'       },
          { value: 'fern',       label: 'Fern'       },
        ],
      },
      { key: 'iterations',    label: 'Iterations',     type: 'int',   min: 1,   max: 8,  step: 1   },
      { key: 'angle',         label: 'Angle',          type: 'float', min: 15,  max: 90, step: 0.5 },
      { key: 'length',        label: 'Segment Length', type: 'float', min: 2,   max: 20, step: 0.5 },
      { key: 'width',         label: 'Line Width',     type: 'float', min: 0.5, max: 3,  step: 0.1 },
      {
        key: 'colorMode', label: 'Color Mode', type: 'select',
        options: [
          { value: 'gradient',    label: 'Gradient'    },
          { value: 'depth',       label: 'Depth'       },
          { value: 'monochrome',  label: 'Monochrome'  },
        ],
      },
      { key: 'animateGrowth', label: 'Animate Growth', type: 'bool' },
    ],
  },

  init(ctx: RenderContext): LSystemState {
    const preset    = (ctx.params.preset     as string) ?? 'plant';
    const iters     = (ctx.params.iterations as number) ?? 5;
    const angle     = (ctx.params.angle      as number) ?? 25;
    const length    = (ctx.params.length     as number) ?? 8;
    const p = PRESETS[preset] || PRESETS.plant;

    const str = rewrite(p.axiom, p.rules, iters);
    const raw = buildTurtle(
      str,
      p.startX * ctx.width,
      p.startY * ctx.height,
      p.startAngle,
      length,
      angle,
      ctx.width,
      ctx.height,
    );
    const lines = fitLines(raw, ctx.width, ctx.height, 20);
    const maxDepth = lines.reduce((m, l) => Math.max(m, l.depth), 0) || 1;

    return {
      lines,
      drawnCount: 0,
      maxDepth,
      lastPreset: preset,
      lastIter: iters,
      growthPhase: 0,
    };
  },

  update(ctx: RenderContext, state: LSystemState): void {
    const preset    = (ctx.params.preset     as string)  ?? 'plant';
    const iters     = (ctx.params.iterations as number)  ?? 5;
    const angle     = (ctx.params.angle      as number)  ?? 25;
    const length    = (ctx.params.length     as number)  ?? 8;
    const animGrow  = (ctx.params.animateGrowth as boolean) ?? false;

    // Rebuild if params changed
    if (preset !== state.lastPreset || iters !== state.lastIter) {
      const p = PRESETS[preset] || PRESETS.plant;
      const str = rewrite(p.axiom, p.rules, iters);
      const raw = buildTurtle(
        str,
        p.startX * ctx.width,
        p.startY * ctx.height,
        p.startAngle,
        length,
        angle,
        ctx.width,
        ctx.height,
      );
      state.lines = fitLines(raw, ctx.width, ctx.height, 20);
      state.maxDepth = state.lines.reduce((m, l) => Math.max(m, l.depth), 0) || 1;
      state.lastPreset = preset;
      state.lastIter = iters;
      state.drawnCount = 0;
      state.growthPhase = 0;
    }

    if (animGrow) {
      state.growthPhase += 0.005;
      state.drawnCount = Math.floor(Math.abs(Math.sin(state.growthPhase)) * state.lines.length);
    } else {
      state.drawnCount = state.lines.length;
    }
  },

  render(ctx: RenderContext, state: LSystemState): void {
    const { ctx: c, width, height } = ctx;
    const lineWidth = (ctx.params.width     as number) ?? 1.5;
    const colorMode = (ctx.params.colorMode as string) ?? 'gradient';

    c.fillStyle = '#0a0a14';
    c.fillRect(0, 0, width, height);

    const total = state.lines.length;
    const drawTo = state.drawnCount;

    for (let i = 0; i < drawTo; i++) {
      const l = state.lines[i];
      const frac = i / Math.max(1, total - 1);

      let strokeStyle: string;
      switch (colorMode) {
        case 'depth': {
          const hue = (l.depth / state.maxDepth) * 120;
          strokeStyle = `hsl(${hue + 60},80%,55%)`;
          break;
        }
        case 'monochrome':
          strokeStyle = `hsl(120,30%,${40 + frac * 40}%)`;
          break;
        default: { // gradient
          const hue = (frac * 180 + 80) % 360;
          const light = 35 + frac * 35;
          strokeStyle = `hsl(${hue},85%,${light}%)`;
          break;
        }
      }

      c.beginPath();
      c.moveTo(l.x1, l.y1);
      c.lineTo(l.x2, l.y2);
      c.strokeStyle = strokeStyle;
      c.lineWidth = Math.max(0.3, lineWidth * (1 - l.depth / (state.maxDepth * 1.5 + 1)));
      c.globalAlpha = 0.85;
      c.stroke();
    }

    c.globalAlpha = 1;
  },
};

export default lsystem;
