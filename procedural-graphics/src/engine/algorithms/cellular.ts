import type { Algorithm, RenderContext, AlgorithmState } from '@/engine/types';

// ─── Cellular Automata: Life, Brian's Brain, Langton's Ant, Wireworld ────────

function hexToRgb(hex: string): [number, number, number] {
  const h = (hex || '#000000').replace('#', '');
  return [parseInt(h.slice(0, 2), 16) || 0, parseInt(h.slice(2, 4), 16) || 0, parseInt(h.slice(4, 6), 16) || 0];
}

// ── Conway's Game of Life ────────────────────────────────────────────────────
// States: 0=dead, 1=alive
// Rule: B3/S23

function lifeStep(grid: Uint8Array, next: Uint8Array, w: number, h: number): void {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let neighbors = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = (x + dx + w) % w;
          const ny = (y + dy + h) % h;
          neighbors += grid[ny * w + nx];
        }
      }
      const cur = grid[y * w + x];
      next[y * w + x] = cur === 1
        ? (neighbors === 2 || neighbors === 3 ? 1 : 0)
        : (neighbors === 3 ? 1 : 0);
    }
  }
}

// ── Brian's Brain ────────────────────────────────────────────────────────────
// States: 0=off, 1=firing(on), 2=dying
// Rule: off->on if exactly 2 on neighbors; on->dying; dying->off

function brainsStep(grid: Uint8Array, next: Uint8Array, w: number, h: number): void {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const cur = grid[y * w + x];
      if (cur === 1) {
        next[y * w + x] = 2; // on -> dying
      } else if (cur === 2) {
        next[y * w + x] = 0; // dying -> off
      } else {
        // off -> on if exactly 2 firing neighbors
        let onCount = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = (x + dx + w) % w;
            const ny = (y + dy + h) % h;
            if (grid[ny * w + nx] === 1) onCount++;
          }
        }
        next[y * w + x] = onCount === 2 ? 1 : 0;
      }
    }
  }
}

// ── Wireworld ────────────────────────────────────────────────────────────────
// States: 0=empty, 1=copper, 2=electron head, 3=electron tail
// Rules: empty->empty; head->tail; tail->copper; copper->head if 1 or 2 head neighbors

function wireworldStep(grid: Uint8Array, next: Uint8Array, w: number, h: number): void {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const cur = grid[y * w + x];
      if (cur === 0) { next[y * w + x] = 0; continue; }
      if (cur === 2) { next[y * w + x] = 3; continue; } // head -> tail
      if (cur === 3) { next[y * w + x] = 1; continue; } // tail -> copper
      // copper: count electron heads
      let heads = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = (x + dx + w) % w;
          const ny = (y + dy + h) % h;
          if (grid[ny * w + nx] === 2) heads++;
        }
      }
      next[y * w + x] = (heads === 1 || heads === 2) ? 2 : 1;
    }
  }
}

// ── Langton's Ant ────────────────────────────────────────────────────────────
interface Ant { x: number; y: number; dir: number; rule: string; }

const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // N E S W

function langtonStep(grid: Uint8Array, ants: Ant[], w: number, h: number): void {
  for (const ant of ants) {
    const idx = ant.y * w + ant.x;
    const state = grid[idx];
    const ruleLen = ant.rule.length;
    const turnChar = ant.rule[state % ruleLen];
    // R = turn right, L = turn left
    ant.dir = (ant.dir + (turnChar === 'R' ? 1 : -1) + 4) % 4;
    grid[idx] = (state + 1) % ruleLen;
    ant.x = (ant.x + DIRS[ant.dir][0] + w) % w;
    ant.y = (ant.y + DIRS[ant.dir][1] + h) % h;
  }
}

function initWireworld(grid: Uint8Array, w: number, h: number): void {
  // Build a simple wire circuit pattern in the center
  const cx = w >> 1; const cy = h >> 1;
  // Draw a rectangular wire loop
  const r = Math.min(w, h) >> 2;
  for (let x = cx - r; x <= cx + r; x++) {
    grid[cy - r > 0 ? (cy - r) * w + x : 0] = 1;
    grid[(cy + r) * w + x] = 1;
  }
  for (let y = cy - r; y <= cy + r; y++) {
    grid[y * w + (cx - r)] = 1;
    grid[y * w + (cx + r)] = 1;
  }
  // Place an electron head to start things going
  grid[(cy - r) * w + cx] = 2;
  grid[(cy - r) * w + cx + 1] = 3;
}

interface CellularState {
  grid: Uint8Array;
  nextGrid: Uint8Array;
  ants: Ant[];
  gw: number;
  gh: number;
  lastRule: string;
  lastCellSize: number;
  stepAccum: number;
}

function initGrid(rule: string, gw: number, gh: number, randomSeed: boolean): { grid: Uint8Array; ants: Ant[] } {
  const size = gw * gh;
  const grid = new Uint8Array(size);
  const ants: Ant[] = [];

  if (rule === 'langton') {
    // Start with mostly empty grid, add ants
    if (randomSeed) {
      for (let i = 0; i < size; i++) grid[i] = Math.random() < 0.1 ? 1 : 0;
    }
    // Multiple ants with different rules
    const antRules = ['RL', 'RLL', 'RRLL', 'RLLR'];
    const numAnts = 3;
    for (let a = 0; a < numAnts; a++) {
      ants.push({
        x: Math.floor(gw * (0.3 + a * 0.2)),
        y: Math.floor(gh * (0.3 + a * 0.15)),
        dir: a % 4,
        rule: antRules[a % antRules.length],
      });
    }
  } else if (rule === 'wireworld') {
    initWireworld(grid, gw, gh);
  } else {
    // Life and brains: random or seeded
    const density = rule === 'brains' ? 0.08 : 0.35;
    if (randomSeed) {
      for (let i = 0; i < size; i++) {
        grid[i] = Math.random() < density ? (rule === 'brains' ? (Math.random() < 0.5 ? 1 : 2) : 1) : 0;
      }
    } else {
      // Deterministic seed
      const cx = gw >> 1; const cy = gh >> 1;
      // Glider
      const glider = [[0,1],[1,2],[2,0],[2,1],[2,2]];
      for (const [dx, dy] of glider) {
        const x = (cx + dx) % gw; const y = (cy + dy) % gh;
        grid[y * gw + x] = 1;
      }
      // R-pentomino
      const rPento = [[1,0],[2,0],[0,1],[1,1],[1,2]];
      for (const [dx, dy] of rPento) {
        const x = (cx - 15 + dx) % gw; const y = (cy - 5 + dy) % gh;
        if (x >= 0 && y >= 0) grid[y * gw + x] = 1;
      }
    }
  }

  return { grid, ants };
}

export const cellular: Algorithm = {
  meta: {
    id: 'cellular',
    name: 'Cellular Automata',
    description: 'Conway Life, Brian\'s Brain, Langton\'s Ant, and Wireworld cellular automata',
    category: 'pattern',
    tags: ['cellular', 'automata', 'life', 'langton'],
    animated: true,
    gpuHeavy: false,
    defaultParams: {
      rule:        'life',
      cellSize:    6,
      speed:       3,
      colorAlive:  '#00ff88',
      colorDead:   '#0a0a1a',
      colorTrail:  '#003322',
      randomSeed:  true,
    },
    paramSchema: [
      {
        key: 'rule', label: 'Rule', type: 'select',
        options: [
          { value: 'life',      label: 'Game of Life'  },
          { value: 'brains',    label: 'Brian\'s Brain' },
          { value: 'langton',   label: 'Langton\'s Ant' },
          { value: 'wireworld', label: 'Wireworld'      },
        ],
      },
      { key: 'cellSize',   label: 'Cell Size',    type: 'int',   min: 2,  max: 12, step: 1 },
      { key: 'speed',      label: 'Steps/Frame',  type: 'int',   min: 1,  max: 10, step: 1 },
      { key: 'colorAlive', label: 'Color Alive',  type: 'color' },
      { key: 'colorDead',  label: 'Color Dead',   type: 'color' },
      { key: 'colorTrail', label: 'Color Trail',  type: 'color' },
      { key: 'randomSeed', label: 'Random Seed',  type: 'bool'  },
    ],
  },

  init(ctx: RenderContext): CellularState {
    const cellSize  = (ctx.params.cellSize  as number)  ?? 6;
    const rule      = (ctx.params.rule      as string)  ?? 'life';
    const randSeed  = (ctx.params.randomSeed as boolean) ?? true;
    const gw = Math.floor(ctx.width  / cellSize);
    const gh = Math.floor(ctx.height / cellSize);

    const { grid, ants } = initGrid(rule, gw, gh, randSeed);

    return {
      grid,
      nextGrid: new Uint8Array(gw * gh),
      ants,
      gw, gh,
      lastRule: rule,
      lastCellSize: cellSize,
      stepAccum: 0,
    };
  },

  update(ctx: RenderContext, state: CellularState): void {
    const cellSize = (ctx.params.cellSize   as number)  ?? 6;
    const rule     = (ctx.params.rule       as string)  ?? 'life';
    const speed    = (ctx.params.speed      as number)  ?? 3;
    const randSeed = (ctx.params.randomSeed as boolean) ?? true;

    // Reinit on param change
    if (rule !== state.lastRule || cellSize !== state.lastCellSize) {
      const gw = Math.floor(ctx.width  / cellSize);
      const gh = Math.floor(ctx.height / cellSize);
      const { grid, ants } = initGrid(rule, gw, gh, randSeed);
      state.grid      = grid;
      state.nextGrid  = new Uint8Array(gw * gh);
      state.ants      = ants;
      state.gw        = gw;
      state.gh        = gh;
      state.lastRule  = rule;
      state.lastCellSize = cellSize;
    }

    const { gw, gh } = state;
    const steps = speed;

    for (let s = 0; s < steps; s++) {
      switch (rule) {
        case 'life':
          lifeStep(state.grid, state.nextGrid, gw, gh);
          [state.grid, state.nextGrid] = [state.nextGrid, state.grid];
          break;
        case 'brains':
          brainsStep(state.grid, state.nextGrid, gw, gh);
          [state.grid, state.nextGrid] = [state.nextGrid, state.grid];
          break;
        case 'wireworld':
          wireworldStep(state.grid, state.nextGrid, gw, gh);
          [state.grid, state.nextGrid] = [state.nextGrid, state.grid];
          break;
        case 'langton':
          langtonStep(state.grid, state.ants, gw, gh);
          break;
      }
    }
  },

  render(ctx: RenderContext, state: CellularState): void {
    const { ctx: c, width, height } = ctx;
    const cellSize   = (ctx.params.cellSize   as number) ?? 6;
    const rule       = (ctx.params.rule       as string) ?? 'life';
    const colorAlive = (ctx.params.colorAlive as string) ?? '#00ff88';
    const colorDead  = (ctx.params.colorDead  as string) ?? '#0a0a1a';
    const colorTrail = (ctx.params.colorTrail as string) ?? '#003322';

    const [rA, gA, bA] = hexToRgb(colorAlive);
    const [rD, gD, bD] = hexToRgb(colorDead);
    const [rT, gT, bT] = hexToRgb(colorTrail);

    // Wireworld colors
    const wwColors: Record<number, string> = {
      0: colorDead,
      1: '#ff8800', // copper
      2: colorAlive, // electron head
      3: colorTrail, // electron tail
    };

    c.fillStyle = colorDead;
    c.fillRect(0, 0, width, height);

    const { gw, gh, grid } = state;

    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const cell = grid[y * gw + x];
        if (cell === 0 && rule !== 'wireworld') continue;

        const px = x * cellSize;
        const py = y * cellSize;

        if (rule === 'wireworld') {
          if (cell === 0) continue;
          c.fillStyle = wwColors[cell] || colorDead;
        } else if (rule === 'brains') {
          if (cell === 1) c.fillStyle = colorAlive;
          else if (cell === 2) c.fillStyle = colorTrail;
          else continue;
        } else if (rule === 'langton') {
          // Color by state count mod
          const t = cell / 4;
          const r = Math.round(rD + (rA - rD) * t);
          const g2 = Math.round(gD + (gA - gD) * t);
          const b2 = Math.round(bD + (bA - bD) * t);
          c.fillStyle = `rgb(${r},${g2},${b2})`;
        } else {
          c.fillStyle = colorAlive;
        }

        c.fillRect(px, py, cellSize, cellSize);
      }
    }

    // Draw ant positions for langton
    if (rule === 'langton') {
      for (const ant of state.ants) {
        c.fillStyle = '#ffffff';
        c.fillRect(ant.x * cellSize, ant.y * cellSize, cellSize, cellSize);
      }
    }
  },
};

export default cellular;
