# Procedural — AI Generative Art Platform

Generate stunning procedural graphics using 22 mathematical algorithms, driven by natural language AI prompts. Built for worship teams, YouTubers, and motion designers.

## Features

- **22 unique algorithms** — Navier-Stokes fluid, aurora borealis, Mandelbrot fractals, reaction-diffusion, boids flocking, magnetic fields, and 16 more
- **AI prompt generation** — describe what you want; Claude maps it to the perfect algorithm + parameters
- **Real-time rendering** — live parameter tweaking at 60fps
- **Export** — PNG (1080p/4K) and WebM video
- **Marketplace** — tiered pricing with worship broadcast licenses

## Quick Start

```bash
cd procedural-graphics
npm install
cp .env.example .env.local
# Set ANTHROPIC_API_KEY in .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Algorithms

| Algorithm | Style | Best For |
|---|---|---|
| Fluid Dynamics | Navier-Stokes | Flowing backgrounds, ink effects |
| Aurora Borealis | Layered bands + noise | Worship, ambient |
| Mandelbrot/Julia | Fractal iteration | Psychedelic art, zooms |
| Reaction-Diffusion | Gray-Scott | Organic textures, coral |
| Strange Attractor | Lorenz/Clifford ODE | Abstract, chaos art |
| Boids Flocking | Reynolds rules | Murmuration, swarm art |
| N-Body Gravity | Gravitational simulation | Planetary, cosmic |
| Fractal Flame | IFS chaos game | Fire, abstract flames |
| Kaleidoscope | Rotational symmetry | Sacred geometry, mandala |
| Flow Field | Perlin noise particles | Wind, organic motion |
| Crystal Growth | Reiter snowflake | Ice, snowflakes |
| DLA | Diffusion-limited aggregation | Lightning, coral, rivers |
| Voronoi | Cell diagrams | Stained glass, mosaic |
| Particles | Physics-based | Sparks, magic, fireworks |
| Plasma | Sine interference | Psychedelic, ambient |
| Spirograph | Hypotrochoid | Geometric, rose curves |
| Fourier Epicycles | Series animation | Mathematical art |
| Lissajous | Harmonic curves | Oscilloscope art |
| L-System | Turtle grammar | Plants, trees, fractals |
| Cellular Automata | Conway/Brian's Brain | Digital life, emergence |
| Wave Interference | Point source waves | Ripples, moiré |
| Magnetic Fields | Biot-Savart field lines | Energy, electromagnetic |

## Tech Stack

- **Next.js 14** — App Router, TypeScript
- **Tailwind CSS** — Dark theme UI
- **Zustand** — State management with localStorage persistence
- **Claude API** — AI prompt interpretation
- **Stripe** — Payment processing
- **Canvas 2D** — All rendering (no WebGL dependency)

## Project Structure

```
src/
├── app/              Pages + API routes
├── components/       UI components
├── engine/
│   ├── algorithms/   22 algorithm implementations
│   ├── registry.ts   Algorithm lookup map
│   ├── renderer.ts   ProceduralRenderer class
│   ├── prompt-parser.ts  Claude API integration
│   └── types.ts      Shared TypeScript types
├── lib/
│   ├── store.ts      Zustand state store
│   └── utils.ts      Utilities + pricing tiers
└── styles/           Global CSS
```

## License

MIT — personal use. Commercial/worship licenses available via the marketplace.
