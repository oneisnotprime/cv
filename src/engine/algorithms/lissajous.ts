import type { Algorithm, RenderContext, AlgorithmState } from '@/engine/types';

// ─── Lissajous Curves & Harmonograph Simulation ───────────────────────────────

interface TracePoint {
  x: number;
  y: number;
  t: number;
}

interface LissajousState {
  traces: TracePoint[][];  // one per numTraces
  tAccum: number;
  decayFactor: number;
  maxPoints: number;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

function lissajousPoint(
  freqX: number, freqY: number,
  phaseOffset: number,
  t: number,
  decayStrength: number,
  A = 1, B = 1,
): [number, number] {
  const decay = decayStrength > 0 ? Math.exp(-decayStrength * t) : 1;
  const x = A * decay * Math.sin(freqX * t + phaseOffset);
  const y = B * decay * Math.sin(freqY * t);
  return [x, y];
}

// Harmonograph: sum of two damped oscillators per axis
function harmonographPoint(
  freqX: number, freqY: number,
  phaseOffset: number,
  t: number,
  decay: number,
): [number, number] {
  const d = Math.exp(-decay * t);
  const d2 = Math.exp(-decay * 0.7 * t);
  const x = d * Math.sin(freqX * t + phaseOffset) + d2 * 0.3 * Math.sin((freqX + 0.01) * t);
  const y = d * Math.sin(freqY * t) + d2 * 0.3 * Math.sin((freqY + 0.01) * t + Math.PI / 4);
  return [x, y];
}

export const lissajous: Algorithm = {
  meta: {
    id: 'lissajous',
    name: 'Lissajous Curves',
    description: 'Lissajous figures and harmonograph simulation with decaying oscillators',
    category: 'geometric',
    tags: ['lissajous', 'harmonograph', 'curves', 'oscillation', 'math'],
    animated: true,
    gpuHeavy: false,
    defaultParams: {
      freqX: 3,
      freqY: 2,
      phaseOffset: 1.571,
      numTraces: 1,
      decay: 0.9999,
      colorMode: 'spectrum',
      speed: 2,
      lineWidth: 1.5,
      rotateZ: false,
    },
    paramSchema: [
      { key: 'freqX',       label: 'Frequency X',    type: 'int',   min: 1,      max: 10,    step: 1 },
      { key: 'freqY',       label: 'Frequency Y',    type: 'int',   min: 1,      max: 10,    step: 1 },
      { key: 'phaseOffset', label: 'Phase Offset',   type: 'float', min: 0,      max: 6.28,  step: 0.01 },
      { key: 'numTraces',   label: 'Num Traces',     type: 'int',   min: 1,      max: 8,     step: 1 },
      { key: 'decay',       label: 'Decay',          type: 'float', min: 0.9999, max: 1,     step: 0.00001 },
      { key: 'colorMode',   label: 'Color Mode',     type: 'select', options: [
        { value: 'spectrum',  label: 'Spectrum' },
        { value: 'mono',      label: 'Mono' },
        { value: 'gradient',  label: 'Gradient' },
      ]},
      { key: 'speed',       label: 'Speed',          type: 'float', min: 0.5,    max: 10,    step: 0.1 },
      { key: 'lineWidth',   label: 'Line Width',     type: 'float', min: 0.5,    max: 5,     step: 0.1 },
      { key: 'rotateZ',     label: 'Rotate Z',       type: 'bool' },
    ],
  },

  init(ctx: RenderContext): LissajousState {
    const numTraces = (ctx.params.numTraces as number) ?? 1;
    const decay = (ctx.params.decay as number) ?? 0.9999;

    const maxPoints = 8000;
    const traces: TracePoint[][] = Array.from({ length: numTraces }, () => []);

    return { traces, tAccum: 0, decayFactor: 1 - decay, maxPoints };
  },

  update(ctx: RenderContext, state: LissajousState): void {
    const freqX = (ctx.params.freqX as number) ?? 3;
    const freqY = (ctx.params.freqY as number) ?? 2;
    const phaseOffset = (ctx.params.phaseOffset as number) ?? 1.571;
    const numTraces = (ctx.params.numTraces as number) ?? 1;
    const decay = (ctx.params.decay as number) ?? 0.9999;
    const speed = (ctx.params.speed as number) ?? 2;

    const decayStrength = 1 - decay;

    // Reset traces if numTraces changed
    if (state.traces.length !== numTraces) {
      state.traces = Array.from({ length: numTraces }, () => []);
      state.tAccum = 0;
    }

    const dt = 0.016 * speed * 0.5;
    const stepsPerFrame = Math.max(1, Math.floor(10 * speed));

    for (let step = 0; step < stepsPerFrame; step++) {
      state.tAccum += dt / stepsPerFrame;

      for (let ti = 0; ti < numTraces; ti++) {
        const tracePhase = phaseOffset + (ti / numTraces) * Math.PI;
        const [x, y] = harmonographPoint(
          freqX, freqY, tracePhase, state.tAccum, decayStrength * 0.01,
        );
        state.traces[ti].push({ x, y, t: state.tAccum });

        if (state.traces[ti].length > state.maxPoints) {
          state.traces[ti].shift();
        }
      }
    }

    // Reset when curve converges to origin (full decay)
    if (decayStrength > 0 && state.tAccum > (1 / (decayStrength * 0.01 + 0.0001)) * 5) {
      state.tAccum = 0;
      state.traces = Array.from({ length: numTraces }, () => []);
    }
  },

  render(ctx: RenderContext, state: LissajousState): void {
    const { ctx: c, width, height } = ctx;
    const colorMode = (ctx.params.colorMode as string) ?? 'spectrum';
    const lineWidth = (ctx.params.lineWidth as number) ?? 1.5;
    const rotateZ = (ctx.params.rotateZ as boolean) ?? false;
    const numTraces = (ctx.params.numTraces as number) ?? 1;

    c.fillStyle = '#050510';
    c.fillRect(0, 0, width, height);

    const cx = width / 2;
    const cy = height / 2;
    const scale = Math.min(width, height) * 0.44;

    c.save();
    c.translate(cx, cy);
    if (rotateZ) {
      const angle = ctx.time * 0.0002;
      c.rotate(angle);
    }
    c.scale(scale, scale);

    for (let ti = 0; ti < state.traces.length; ti++) {
      const trace = state.traces[ti];
      if (trace.length < 2) continue;

      const baseHue = (ti / numTraces) * 360;

      for (let i = 1; i < trace.length; i++) {
        const progress = i / trace.length;
        let strokeStyle: string;

        switch (colorMode) {
          case 'mono':
            strokeStyle = `rgba(180,200,255,${progress * 0.8})`;
            break;
          case 'gradient': {
            const [r, g, b] = hslToRgb(baseHue + progress * 60, 100, 50 + progress * 20);
            strokeStyle = `rgba(${r},${g},${b},${progress})`;
            break;
          }
          default: { // spectrum
            const hue = (progress * 360 + ti * (360 / numTraces)) % 360;
            strokeStyle = `hsla(${hue},100%,60%,${progress * 0.9})`;
          }
        }

        c.beginPath();
        c.moveTo(trace[i - 1].x, trace[i - 1].y);
        c.lineTo(trace[i].x, trace[i].y);
        c.strokeStyle = strokeStyle;
        c.lineWidth = lineWidth / scale;
        c.lineCap = 'round';
        c.stroke();
      }
    }

    c.restore();
  },
};

export default lissajous;
