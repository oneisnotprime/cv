import type { Algorithm, RenderContext, AlgorithmState } from '@/engine/types';

// ─── Gray-Scott Reaction-Diffusion system ─────────────────────────────────────

interface RDPreset {
  Da: number; Db: number; f: number; k: number;
}

const PRESETS: Record<string, RDPreset> = {
  coral:   { Da: 0.2097, Db: 0.1050, f: 0.0420, k: 0.0594 },
  sponge:  { Da: 0.2097, Db: 0.1050, f: 0.0550, k: 0.0620 },
  zebra:   { Da: 0.1600, Db: 0.0800, f: 0.0350, k: 0.0600 },
  mitosis: { Da: 0.2800, Db: 0.1400, f: 0.0280, k: 0.0620 },
  maze:    { Da: 0.2097, Db: 0.1050, f: 0.0290, k: 0.0570 },
};

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

interface RDState {
  A: Float32Array;
  B: Float32Array;
  Anext: Float32Array;
  Bnext: Float32Array;
  gw: number;
  gh: number;
  initialized: boolean;
}

export const reaction_diffusion: Algorithm = {
  meta: {
    id: 'reaction_diffusion',
    name: 'Reaction Diffusion',
    description: 'Gray-Scott reaction-diffusion system with multiple preset patterns',
    category: 'organic',
    tags: ['gray-scott', 'reaction-diffusion', 'chemistry', 'turing'],
    animated: true,
    gpuHeavy: false,
    defaultParams: {
      preset:  'coral',
      Da:      0.2097,
      Db:      0.1050,
      feed:    0.0420,
      kill:    0.0594,
      colorA:  '#1a1a2e',
      colorB:  '#00ffcc',
      scale:   2,
    },
    paramSchema: [
      {
        key: 'preset', label: 'Preset', type: 'select',
        options: [
          { value: 'coral',   label: 'Coral'   },
          { value: 'sponge',  label: 'Sponge'  },
          { value: 'zebra',   label: 'Zebra'   },
          { value: 'mitosis', label: 'Mitosis' },
          { value: 'maze',    label: 'Maze'    },
        ],
      },
      { key: 'Da',     label: 'Da (diffusion A)', type: 'float', min: 0.16,  max: 0.25,  step: 0.001 },
      { key: 'Db',     label: 'Db (diffusion B)', type: 'float', min: 0.04,  max: 0.12,  step: 0.001 },
      { key: 'feed',   label: 'Feed Rate',        type: 'float', min: 0.01,  max: 0.08,  step: 0.001 },
      { key: 'kill',   label: 'Kill Rate',        type: 'float', min: 0.04,  max: 0.07,  step: 0.001 },
      { key: 'colorA', label: 'Color A',          type: 'color' },
      { key: 'colorB', label: 'Color B',          type: 'color' },
      { key: 'scale',  label: 'Scale',            type: 'int',   min: 1,     max: 4,     step: 1     },
    ],
  },

  init(ctx: RenderContext): RDState {
    const scale = (ctx.params.scale as number) ?? 2;
    const gw = Math.floor(ctx.width  / scale);
    const gh = Math.floor(ctx.height / scale);
    const size = gw * gh;

    const A     = new Float32Array(size);
    const B     = new Float32Array(size);
    const Anext = new Float32Array(size);
    const Bnext = new Float32Array(size);

    // Initialize: A=1 everywhere, B=0; seed B in center squares
    for (let i = 0; i < size; i++) A[i] = 1.0;

    // Multiple random seed patches
    for (let seed = 0; seed < 8; seed++) {
      const sx = Math.floor(gw * (0.2 + Math.random() * 0.6));
      const sy = Math.floor(gh * (0.2 + Math.random() * 0.6));
      const radius = 5 + Math.floor(Math.random() * 10);
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (dx * dx + dy * dy <= radius * radius) {
            const x = sx + dx; const y = sy + dy;
            if (x >= 0 && x < gw && y >= 0 && y < gh) {
              B[y * gw + x] = 1.0;
              A[y * gw + x] = 0.0;
            }
          }
        }
      }
    }

    return { A, B, Anext, Bnext, gw, gh, initialized: true };
  },

  update(ctx: RenderContext, state: RDState): void {
    const scale  = (ctx.params.scale  as number) ?? 2;
    const preset = (ctx.params.preset as string) ?? 'coral';

    // Reinit if scale changed
    const gw = Math.floor(ctx.width  / scale);
    const gh = Math.floor(ctx.height / scale);
    if (gw !== state.gw || gh !== state.gh) {
      const size = gw * gh;
      state.gw = gw; state.gh = gh;
      state.A     = new Float32Array(size);
      state.B     = new Float32Array(size);
      state.Anext = new Float32Array(size);
      state.Bnext = new Float32Array(size);
      for (let i = 0; i < size; i++) state.A[i] = 1.0;
      const cx = gw >> 1; const cy = gh >> 1;
      for (let dy = -8; dy <= 8; dy++) {
        for (let dx = -8; dx <= 8; dx++) {
          const x = cx + dx; const y = cy + dy;
          if (x >= 0 && x < gw && y >= 0 && y < gh) {
            state.B[y * gw + x] = 1.0;
            state.A[y * gw + x] = 0.0;
          }
        }
      }
      return;
    }

    // Use preset or manual params
    const presetValues = PRESETS[preset] || PRESETS.coral;
    const Da   = (ctx.params.Da   as number) ?? presetValues.Da;
    const Db   = (ctx.params.Db   as number) ?? presetValues.Db;
    const f    = (ctx.params.feed as number) ?? presetValues.f;
    const k    = (ctx.params.kill as number) ?? presetValues.k;

    const { A, B, Anext, Bnext } = state;
    const STEPS = 8; // sub-steps per frame for stability

    for (let step = 0; step < STEPS; step++) {
      for (let y = 0; y < gh; y++) {
        for (let x = 0; x < gw; x++) {
          const i = y * gw + x;
          const xm = x === 0    ? gw - 1 : x - 1;
          const xp = x === gw-1 ? 0      : x + 1;
          const ym = y === 0    ? gh - 1 : y - 1;
          const yp = y === gh-1 ? 0      : y + 1;

          const a = A[i];
          const b = B[i];
          const lapA = A[y * gw + xm] + A[y * gw + xp] + A[ym * gw + x] + A[yp * gw + x] - 4 * a;
          const lapB = B[y * gw + xm] + B[y * gw + xp] + B[ym * gw + x] + B[yp * gw + x] - 4 * b;

          const reaction = a * b * b;
          const dt = 1.0;
          Anext[i] = Math.max(0, Math.min(1, a + dt * (Da * lapA - reaction + f * (1 - a))));
          Bnext[i] = Math.max(0, Math.min(1, b + dt * (Db * lapB + reaction - (f + k) * b)));
        }
      }
      A.set(Anext);
      B.set(Bnext);
    }
  },

  render(ctx: RenderContext, state: RDState): void {
    const { ctx: c, width, height, pixelData, imageData } = ctx;
    const scale   = (ctx.params.scale   as number) ?? 2;
    const colorAH = (ctx.params.colorA  as string) ?? '#1a1a2e';
    const colorBH = (ctx.params.colorB  as string) ?? '#00ffcc';

    const [rA, gA, bA] = hexToRgb(colorAH);
    const [rB, gB, bB] = hexToRgb(colorBH);

    const { B, gw, gh } = state;

    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        const gx = Math.min(gw - 1, Math.floor(px / scale));
        const gy = Math.min(gh - 1, Math.floor(py / scale));
        const b = B[gy * gw + gx];

        const idx = (py * width + px) * 4;
        pixelData[idx]     = Math.round(rA + (rB - rA) * b);
        pixelData[idx + 1] = Math.round(gA + (gB - gA) * b);
        pixelData[idx + 2] = Math.round(bA + (bB - bA) * b);
        pixelData[idx + 3] = 255;
      }
    }

    c.putImageData(imageData, 0, 0);
  },
};

export default reaction_diffusion;
