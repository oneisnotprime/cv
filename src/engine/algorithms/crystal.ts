import type { Algorithm, RenderContext, AlgorithmState } from '@/engine/types';

// ─── Crystal Growth / Snowflake (Reiter's Model) ──────────────────────────────

interface CrystalState {
  grid: Float32Array;       // vapor / ice density per hex cell
  frozenGrid: Uint8Array;   // whether cell is frozen
  ageGrid: Float32Array;    // when cell froze (normalized)
  size: number;
  cols: number;
  rows: number;
  done: boolean;
  needsRedraw: boolean;
  totalFrozen: number;
  maxFrozen: number;
}

// Axial hex grid neighbor offsets (for even rows)
const HEX_DIRS_EVEN = [[1,0],[0,1],[-1,1],[-1,0],[0,-1],[1,-1]];
const HEX_DIRS_ODD  = [[1,0],[1,1],[0,1],[-1,0],[0,-1],[1,-1]];

function hexNeighborIndices(q: number, r: number, cols: number, rows: number): number[] {
  const dirs = (r % 2 === 0) ? HEX_DIRS_EVEN : HEX_DIRS_ODD;
  const indices: number[] = [];
  for (const [dq, dr] of dirs) {
    const nq = q + dq;
    const nr = r + dr;
    if (nq >= 0 && nq < cols && nr >= 0 && nr < rows) {
      indices.push(nr * cols + nq);
    }
  }
  return indices;
}

function cellColor(
  v: number,
  frozen: boolean,
  age: number,
  scheme: string,
): [number, number, number] {
  if (!frozen && v < 0.02) return [0, 8, 24];
  const t = Math.min(1, frozen ? (0.5 + age * 0.5) : v);

  switch (scheme) {
    case 'fire': {
      if (t < 0.33) return [Math.round(t / 0.33 * 200), 0, 0];
      else if (t < 0.66) {
        const s = (t - 0.33) / 0.33;
        return [200 + Math.round(s * 55), Math.round(s * 180), 0];
      } else {
        const s = (t - 0.66) / 0.34;
        return [255, 180 + Math.round(s * 75), Math.round(s * 50)];
      }
    }
    case 'rainbow': {
      const h = t * 270;
      const hh = h / 60;
      const c2 = 1;
      const x = c2 * (1 - Math.abs(hh % 2 - 1));
      let rr = 0, gg = 0, bb = 0;
      if (hh < 1)      { rr = c2; gg = x; }
      else if (hh < 2) { rr = x;  gg = c2; }
      else if (hh < 3) { gg = c2; bb = x; }
      else if (hh < 4) { gg = x;  bb = c2; }
      else if (hh < 5) { rr = x;  bb = c2; }
      else             { rr = c2; bb = x; }
      return [Math.round(rr * 255), Math.round(gg * 255), Math.round(bb * 255)];
    }
    case 'mono': {
      const v2 = Math.round(t * 255);
      return [v2, v2, v2];
    }
    default: { // ice
      const rr = Math.round(t * t * 180);
      const gg = Math.round(t * 220);
      const bb = Math.round(120 + t * 135);
      return [rr, gg, bb];
    }
  }
}

export const crystal: Algorithm = {
  meta: {
    id: 'crystal',
    name: 'Crystal Growth',
    description: "Snowflake crystal growth using Reiter's cellular automaton with 6-fold symmetry",
    category: 'pattern',
    tags: ['crystal', 'snowflake', 'ice', 'growth', 'cellular automaton'],
    animated: true,
    gpuHeavy: false,
    defaultParams: {
      alpha: 1.0,
      beta: 0.4,
      gamma: 0.001,
      colorScheme: 'ice',
      symmetric6: true,
      animate: true,
      glowEffect: true,
      background: '#000818',
    },
    paramSchema: [
      { key: 'alpha',       label: 'Alpha (α)',      type: 'float', min: 0.3,    max: 2,     step: 0.05 },
      { key: 'beta',        label: 'Beta (β)',        type: 'float', min: 0.3,    max: 1,     step: 0.05 },
      { key: 'gamma',       label: 'Gamma (γ)',       type: 'float', min: 0.0001, max: 0.01,  step: 0.0005 },
      { key: 'colorScheme', label: 'Color Scheme',   type: 'select', options: [
        { value: 'ice',     label: 'Ice' },
        { value: 'fire',    label: 'Fire' },
        { value: 'rainbow', label: 'Rainbow' },
        { value: 'mono',    label: 'Mono' },
      ]},
      { key: 'symmetric6',  label: '6-fold Symmetry', type: 'bool' },
      { key: 'animate',     label: 'Animate',         type: 'bool' },
      { key: 'glowEffect',  label: 'Glow Effect',     type: 'bool' },
      { key: 'background',  label: 'Background',      type: 'color' },
    ],
  },

  init(ctx: RenderContext): CrystalState {
    const cellSize = 3;
    const hw = cellSize * 1.5;
    const hh = cellSize * Math.sqrt(3);
    const cols = Math.floor(ctx.width / hw) + 2;
    const rows = Math.floor(ctx.height / (hh * 0.5)) + 2;
    const n = cols * rows;

    const gamma = (ctx.params.gamma as number) ?? 0.001;
    const grid = new Float32Array(n).fill(gamma);
    const frozenGrid = new Uint8Array(n);
    const ageGrid = new Float32Array(n);

    // Seed center cell
    const cq = Math.floor(cols / 2);
    const cr = Math.floor(rows / 2);
    const ci = cr * cols + cq;
    grid[ci] = 1.0;
    frozenGrid[ci] = 1;
    ageGrid[ci] = 0;

    const maxFrozen = n;

    return {
      grid, frozenGrid, ageGrid,
      size: cellSize,
      cols, rows,
      done: false,
      needsRedraw: true,
      totalFrozen: 1,
      maxFrozen,
    };
  },

  update(ctx: RenderContext, state: CrystalState): void {
    const animate = (ctx.params.animate as boolean) ?? true;
    if (!animate || state.done) return;

    const { grid, frozenGrid, ageGrid, cols, rows } = state;
    const alpha = (ctx.params.alpha as number) ?? 1.0;
    const beta = (ctx.params.beta as number) ?? 0.4;
    const gamma = (ctx.params.gamma as number) ?? 0.001;
    const symmetric6 = (ctx.params.symmetric6 as boolean) ?? true;
    const n = cols * rows;

    const newGrid = new Float32Array(n);
    let anyFrozen = false;
    const ageNorm = state.totalFrozen / Math.max(1, state.maxFrozen);

    // Steps per frame for reasonable speed
    const stepsPerFrame = 1;
    for (let step = 0; step < stepsPerFrame; step++) {
      for (let r = 0; r < rows; r++) {
        for (let q = 0; q < cols; q++) {
          const i = r * cols + q;

          if (frozenGrid[i]) {
            newGrid[i] = grid[i];
            continue;
          }

          const neighbors = hexNeighborIndices(q, r, cols, rows);
          const receptive = neighbors.some(ni => frozenGrid[ni]);

          if (receptive) {
            let neighborVapor = 0;
            for (const ni of neighbors) {
              if (!frozenGrid[ni]) neighborVapor += grid[ni];
            }
            const newVal = grid[i] + (alpha / 2) * (neighborVapor / neighbors.length - grid[i]) + gamma;
            newGrid[i] = newVal;
            if (newVal >= 1.0) {
              frozenGrid[i] = 1;
              ageGrid[i] = ageNorm;
              state.totalFrozen++;
              anyFrozen = true;

              // 6-fold symmetry: mirror frozen cell across center
              if (symmetric6) {
                const cq = Math.floor(cols / 2);
                const cr = Math.floor(rows / 2);
                const dq = q - cq;
                const dr = r - cr;
                for (let k = 1; k < 6; k++) {
                  const angle = (k / 6) * Math.PI * 2;
                  const mq = Math.round(cq + dq * Math.cos(angle) - dr * Math.sin(angle));
                  const mr = Math.round(cr + dq * Math.sin(angle) + dr * Math.cos(angle));
                  if (mq >= 0 && mq < cols && mr >= 0 && mr < rows) {
                    const mi = mr * cols + mq;
                    if (!frozenGrid[mi]) {
                      frozenGrid[mi] = 1;
                      grid[mi] = 1.0;
                      ageGrid[mi] = ageNorm;
                      state.totalFrozen++;
                    }
                  }
                }
              }
            }
          } else {
            let neighborSum = 0;
            for (const ni of neighbors) {
              neighborSum += grid[ni];
            }
            newGrid[i] = grid[i] + (beta / 2) * (neighborSum / Math.max(1, neighbors.length) - grid[i]);
          }
        }
      }

      for (let i = 0; i < n; i++) {
        if (!frozenGrid[i]) grid[i] = newGrid[i];
      }
    }

    if (anyFrozen) state.needsRedraw = true;

    // Check if crystal reached edges
    const midRow = Math.floor(rows / 2);
    if (frozenGrid[midRow * cols] || frozenGrid[midRow * cols + cols - 1]) {
      state.done = true;
    }
  },

  render(ctx: RenderContext, state: CrystalState): void {
    const { ctx: c, width, height } = ctx;
    const scheme = (ctx.params.colorScheme as string) ?? 'ice';
    const glow = (ctx.params.glowEffect as boolean) ?? true;
    const background = (ctx.params.background as string) ?? '#000818';

    if (!state.needsRedraw) return;
    state.needsRedraw = false;

    c.fillStyle = background;
    c.fillRect(0, 0, width, height);

    const { grid, frozenGrid, ageGrid, cols, rows, size } = state;
    const hw = size * 1.5;
    const hh = size * Math.sqrt(3);

    // Center the hex grid
    const totalW = cols * hw;
    const totalH = rows * hh * 0.5;
    const offX = (width - totalW) / 2;
    const offY = (height - totalH) / 2;

    for (let r = 0; r < rows; r++) {
      for (let q = 0; q < cols; q++) {
        const i = r * cols + q;
        const frozen = Boolean(frozenGrid[i]);
        const v = frozen ? 1 : grid[i];
        if (!frozen && v < 0.015) continue;

        const px = offX + q * hw + (r % 2) * (hw / 2);
        const py = offY + r * hh * 0.5;
        const age = ageGrid[i];

        const [rr, gg, bb] = cellColor(v, frozen, age, scheme);

        c.beginPath();
        for (let k = 0; k < 6; k++) {
          const angle = (Math.PI / 3) * k - Math.PI / 6;
          const kx = px + size * Math.cos(angle);
          const ky = py + size * Math.sin(angle);
          if (k === 0) c.moveTo(kx, ky);
          else c.lineTo(kx, ky);
        }
        c.closePath();
        c.fillStyle = `rgb(${rr},${gg},${bb})`;
        c.fill();

        if (glow && frozen && v > 0.5) {
          const gr = c.createRadialGradient(px, py, 0, px, py, size * 1.5);
          gr.addColorStop(0, `rgba(${Math.min(255, rr + 100)},${Math.min(255, gg + 100)},${Math.min(255, bb + 60)},0.3)`);
          gr.addColorStop(1, 'rgba(0,0,0,0)');
          c.fillStyle = gr;
          c.fill();
        }
      }
    }

    // Restart when done
    if (state.done) {
      const gamma2 = (ctx.params.gamma as number) ?? 0.001;
      state.grid.fill(gamma2);
      state.frozenGrid.fill(0);
      state.ageGrid.fill(0);
      const cq = Math.floor(cols / 2);
      const cr = Math.floor(rows / 2);
      const ci = cr * cols + cq;
      state.grid[ci] = 1.0;
      state.frozenGrid[ci] = 1;
      state.totalFrozen = 1;
      state.done = false;
      state.needsRedraw = true;
    }
  },
};

export default crystal;
