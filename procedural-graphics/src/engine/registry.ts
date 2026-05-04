// This registry is populated lazily to avoid circular imports.
// Each algorithm file exports a default `Algorithm` object.
// We import them all here and expose a lookup map.

import { Algorithm, AlgorithmId } from './types';

// ─── Lazy imports for code-splitting friendliness ────────────────────────────
// In a Next.js environment, static imports are fine here; the canvas is
// always client-side, so this module is only ever loaded in the browser bundle.

import fluidAlgo from './algorithms/fluid';
import magneticAlgo from './algorithms/magnetic';
import symmetryAlgo from './algorithms/symmetry';
import noiseAlgo from './algorithms/noise';
import mandelbrotAlgo from './algorithms/mandelbrot';
import voronoiAlgo from './algorithms/voronoi';
import reactionDiffusionAlgo from './algorithms/reaction_diffusion';
import lsystemAlgo from './algorithms/lsystem';
import attractorAlgo from './algorithms/attractor';
import cellularAlgo from './algorithms/cellular';
import wavesAlgo from './algorithms/waves';
import spirographAlgo from './algorithms/spirograph';
import dlaAlgo from './algorithms/dla';
import particlesAlgo from './algorithms/particles';
import fourierAlgo from './algorithms/fourier';
import lissajousAlgo from './algorithms/lissajous';
import boidsAlgo from './algorithms/boids';
import gravityAlgo from './algorithms/gravity';
import auroraAlgo from './algorithms/aurora';
import fractalFlameAlgo from './algorithms/fractal_flame';
import plasmaAlgo from './algorithms/plasma';
import crystalAlgo from './algorithms/crystal';

export const ALGORITHM_REGISTRY: Record<AlgorithmId, Algorithm> = {
  fluid: fluidAlgo,
  magnetic: magneticAlgo,
  symmetry: symmetryAlgo,
  noise: noiseAlgo,
  mandelbrot: mandelbrotAlgo,
  voronoi: voronoiAlgo,
  reaction_diffusion: reactionDiffusionAlgo,
  lsystem: lsystemAlgo,
  attractor: attractorAlgo,
  cellular: cellularAlgo,
  waves: wavesAlgo,
  spirograph: spirographAlgo,
  dla: dlaAlgo,
  particles: particlesAlgo,
  fourier: fourierAlgo,
  lissajous: lissajousAlgo,
  boids: boidsAlgo,
  gravity: gravityAlgo,
  aurora: auroraAlgo,
  fractal_flame: fractalFlameAlgo,
  plasma: plasmaAlgo,
  crystal: crystalAlgo,
  // `interference` maps to waves with multi-source preset
  interference: wavesAlgo,
};

export function getAlgorithmMeta(id: AlgorithmId) {
  return ALGORITHM_REGISTRY[id]?.meta ?? null;
}

export function getAllAlgorithms(): Algorithm[] {
  return Object.values(ALGORITHM_REGISTRY).filter(
    (a, i, arr) => arr.findIndex((b) => b.meta.id === a.meta.id) === i
  );
}
