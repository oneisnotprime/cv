import type { Algorithm, RenderContext, AlgorithmState } from '@/engine/types';

// ─── Wave Interference Patterns ──────────────────────────────────────────────

interface Source {
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  phase: number;
  orbitRadius: number;
  orbitSpeed: number;
  orbitAngle: number;
}

interface WavesState {
  sources: Source[];
  offscreen: OffscreenCanvas | null;
  offCtx: OffscreenCanvasRenderingContext2D | null;
  imgData: ImageData | null;
  lastParamHash: string;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

function amplitudeToColor(
  amp: number, // -1 to 1 normalized
  scheme: string,
): [number, number, number] {
  const t = (amp + 1) / 2; // 0..1
  switch (scheme) {
    case 'monochrome': {
      const v = Math.round(t * 255);
      return [v, v, v];
    }
    case 'fire': {
      // black -> red -> orange -> yellow -> white
      if (t < 0.25) {
        const s = t / 0.25;
        return [Math.round(s * 200), 0, 0];
      } else if (t < 0.5) {
        const s = (t - 0.25) / 0.25;
        return [200 + Math.round(s * 55), Math.round(s * 100), 0];
      } else if (t < 0.75) {
        const s = (t - 0.5) / 0.25;
        return [255, 100 + Math.round(s * 155), Math.round(s * 50)];
      } else {
        const s = (t - 0.75) / 0.25;
        return [255, 255, 50 + Math.round(s * 205)];
      }
    }
    case 'ocean': {
      // deep blue -> cyan -> white foam
      if (t < 0.5) {
        const s = t / 0.5;
        return [0, Math.round(s * 150), Math.round(50 + s * 150)];
      } else {
        const s = (t - 0.5) / 0.5;
        return [Math.round(s * 255), 150 + Math.round(s * 105), 200 + Math.round(s * 55)];
      }
    }
    case 'rainbow':
    default: {
      return hslToRgb(t * 300, 100, 50);
    }
  }
}

function initSources(n: number, width: number, height: number): Source[] {
  const sources: Source[] = [];
  const cx = width / 2;
  const cy = height / 2;
  const minDim = Math.min(width, height);
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2;
    const r = minDim * 0.25;
    const bx = cx + Math.cos(angle) * r;
    const by = cy + Math.sin(angle) * r;
    sources.push({
      x: bx, y: by,
      baseX: bx, baseY: by,
      phase: (i / n) * Math.PI * 2,
      orbitRadius: minDim * 0.06,
      orbitSpeed: 0.3 + i * 0.07,
      orbitAngle: angle,
    });
  }
  return sources;
}

export const waves: Algorithm = {
  meta: {
    id: 'waves',
    name: 'Wave Interference',
    description: 'Interference patterns from multiple point wave sources with HSL coloring',
    category: 'pattern',
    tags: ['waves', 'interference', 'moiré', 'physics', 'animated'],
    animated: true,
    gpuHeavy: false,
    defaultParams: {
      numSources: 4,
      frequency: 0.05,
      amplitude: 1,
      speed: 1,
      colorScheme: 'rainbow',
      sourceMotion: 'circular',
      phaseShift: 0,
    },
    paramSchema: [
      { key: 'numSources',   label: 'Num Sources',   type: 'int',    min: 2,    max: 12,   step: 1 },
      { key: 'frequency',    label: 'Frequency',     type: 'float',  min: 0.01, max: 0.2,  step: 0.005 },
      { key: 'amplitude',    label: 'Amplitude',     type: 'float',  min: 0.5,  max: 3,    step: 0.1 },
      { key: 'speed',        label: 'Speed',         type: 'float',  min: 0.5,  max: 5,    step: 0.1 },
      { key: 'colorScheme',  label: 'Color Scheme',  type: 'select', options: [
        { value: 'rainbow',     label: 'Rainbow' },
        { value: 'monochrome',  label: 'Monochrome' },
        { value: 'fire',        label: 'Fire' },
        { value: 'ocean',       label: 'Ocean' },
      ]},
      { key: 'sourceMotion', label: 'Source Motion', type: 'select', options: [
        { value: 'static',   label: 'Static' },
        { value: 'circular', label: 'Circular' },
        { value: 'random',   label: 'Random' },
      ]},
      { key: 'phaseShift',   label: 'Phase Shift',   type: 'float', min: 0, max: 6.28, step: 0.01 },
    ],
  },

  init(ctx: RenderContext): WavesState {
    const numSources = (ctx.params.numSources as number) ?? 4;
    const sources = initSources(numSources, ctx.width, ctx.height);

    let offscreen: OffscreenCanvas | null = null;
    let offCtx: OffscreenCanvasRenderingContext2D | null = null;
    let imgData: ImageData | null = null;
    try {
      offscreen = new OffscreenCanvas(ctx.width, ctx.height);
      offCtx = offscreen.getContext('2d') as OffscreenCanvasRenderingContext2D;
      imgData = offCtx.createImageData(ctx.width, ctx.height);
    } catch { /* fallback */ }

    return { sources, offscreen, offCtx, imgData, lastParamHash: '' };
  },

  update(ctx: RenderContext, state: WavesState): void {
    const numSources = (ctx.params.numSources as number) ?? 4;
    const speed = (ctx.params.speed as number) ?? 1;
    const sourceMotion = (ctx.params.sourceMotion as string) ?? 'circular';
    const t = ctx.time * 0.001 * speed;

    // Rebuild sources if count changed
    if (state.sources.length !== numSources) {
      state.sources = initSources(numSources, ctx.width, ctx.height);
    }

    for (let i = 0; i < state.sources.length; i++) {
      const src = state.sources[i];
      if (sourceMotion === 'circular') {
        const angle = src.orbitAngle + t * src.orbitSpeed;
        src.x = src.baseX + Math.cos(angle) * src.orbitRadius;
        src.y = src.baseY + Math.sin(angle) * src.orbitRadius;
      } else if (sourceMotion === 'random') {
        const angle = src.orbitAngle + t * src.orbitSpeed * 0.5;
        const angle2 = src.orbitAngle * 1.618 + t * src.orbitSpeed * 0.3;
        src.x = src.baseX + Math.cos(angle) * src.orbitRadius + Math.sin(angle2) * src.orbitRadius * 0.5;
        src.y = src.baseY + Math.sin(angle) * src.orbitRadius + Math.cos(angle2) * src.orbitRadius * 0.5;
      }
      // static: no movement
    }
  },

  render(ctx: RenderContext, state: WavesState): void {
    const { ctx: c, width, height, time } = ctx;
    const frequency = (ctx.params.frequency as number) ?? 0.05;
    const amplitude = (ctx.params.amplitude as number) ?? 1;
    const speed = (ctx.params.speed as number) ?? 1;
    const colorScheme = (ctx.params.colorScheme as string) ?? 'rainbow';
    const phaseShift = (ctx.params.phaseShift as number) ?? 0;
    const t = time * 0.001 * speed;

    const imgData = state.imgData ?? ctx.imageData;
    const data = imgData.data;
    const maxAmp = state.sources.length * amplitude;

    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        let sum = 0;
        for (let s = 0; s < state.sources.length; s++) {
          const src = state.sources[s];
          const dx = px - src.x;
          const dy = py - src.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          sum += amplitude * Math.sin(dist * frequency * Math.PI * 2 - t * Math.PI * 2 + src.phase + phaseShift);
        }
        const normalized = sum / maxAmp; // -1..1
        const [r, g, b] = amplitudeToColor(normalized, colorScheme);
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

    // Draw source positions as subtle dots
    c.save();
    for (const src of state.sources) {
      c.beginPath();
      c.arc(src.x, src.y, 4, 0, Math.PI * 2);
      c.fillStyle = 'rgba(255,255,255,0.6)';
      c.fill();
    }
    c.restore();
  },
};

export default waves;
