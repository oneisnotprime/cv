# Procedural Graphics Platform — CLAUDE.md

## Overview
Full-stack Next.js 14 platform for AI-driven procedural graphics generation and selling.
Target users: worship teams, YouTubers, motion designers.

## Architecture

```
src/
  app/             Next.js App Router pages + API routes
  components/      React UI components
  engine/          Algorithm engine (browser-only)
  lib/             Shared utilities + Zustand store
  styles/          Tailwind globals
```

## Algorithm Engine (`src/engine/`)

- `types.ts` — All TypeScript types (AlgorithmId, Params, RenderContext, etc.)
- `registry.ts` — Imports all 22 algorithms, exports `ALGORITHM_REGISTRY`
- `renderer.ts` — `ProceduralRenderer` class: start/stop/update/export
- `prompt-parser.ts` — Claude API integration: natural language → params
- `palettes.ts` — 15 color palettes with mood tags
- `seeded-random.ts` — Mulberry32 PRNG + Perlin noise

## Algorithms (22 total)

| ID | Name | Category |
|---|---|---|
| fluid | Navier-Stokes Fluid | fluid |
| magnetic | Magnetic Fields | physics |
| symmetry | Kaleidoscope | pattern |
| noise | Flow Field | pattern |
| mandelbrot | Mandelbrot/Julia | fractal |
| voronoi | Voronoi Cells | geometric |
| reaction_diffusion | Gray-Scott | organic |
| lsystem | L-System Plants | organic |
| attractor | Strange Attractor | fractal |
| cellular | Cellular Automata | pattern |
| waves | Wave Interference | physics |
| spirograph | Spirograph | geometric |
| dla | DLA Crystal | fractal |
| particles | Particle System | physics |
| fourier | Fourier Epicycles | geometric |
| lissajous | Lissajous Curves | geometric |
| boids | Boid Flocking | physics |
| gravity | N-Body Gravity | physics |
| aurora | Aurora Borealis | pattern |
| fractal_flame | Fractal Flame | fractal |
| plasma | Plasma Effect | pattern |
| crystal | Crystal Growth | pattern |

## Adding a New Algorithm

1. Create `src/engine/algorithms/<id>.ts`
2. Export an `Algorithm` object with `meta`, `init`, `update`, `render`
3. Add the ID to `AlgorithmId` union in `types.ts`
4. Import and register in `registry.ts`
5. Add to `ALGORITHM_GROUPS` in `components/Generator/AlgorithmSelector.tsx`

## API Routes

- `POST /api/prompt` — Claude parses prompt → `{ algorithmId, params, palette, explanation }`
- `POST /api/checkout` — Stripe checkout session creation
- `POST /api/webhooks` — Stripe webhook handler

## State Management

Global state via Zustand (`src/lib/store.ts`):
- `activeAlgorithm`, `params`, `palette`, `seed`
- `savedGenerations` — persisted to localStorage
- `applyPromptResult(algorithmId, params, palette)` — apply AI response

## Environment Variables

See `.env.example`:
- `ANTHROPIC_API_KEY` — required for AI prompt features
- `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` — required for payments
- `NEXTAUTH_SECRET`, `NEXTAUTH_URL` — required for auth
- `NEXT_PUBLIC_APP_URL` — for Stripe redirect URLs

## Development

```bash
npm install
cp .env.example .env.local
# Fill in ANTHROPIC_API_KEY at minimum
npm run dev
```

## Key Design Decisions

- **Canvas 2D only** — no WebGL dependency. All algorithms render to `CanvasRenderingContext2D`.
  Some use `OffscreenCanvas` internally for double-buffering.
- **No external math libraries** — all algorithms are self-contained with native JS math.
- **Seed-based** — all algorithms accept a `seed` param via Mulberry32 PRNG for reproducibility.
- **`interference` alias** — maps to the `waves` algorithm in registry (same renderer, different presets).
