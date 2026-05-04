import Anthropic from '@anthropic-ai/sdk';
import { AlgorithmId, Params, PromptResponse } from './types';

const systemPrompt = `You are an expert procedural graphics parameter generator for a creative graphics platform. Given a natural language description, return JSON that maps it to an algorithm and parameters.

Available algorithms:
- fluid: flowing water, liquid, ink-in-water, lava, organic flow
- magnetic: electric fields, force lines, energy, magnetism, aurora electricity
- symmetry: kaleidoscope, mandala, sacred geometry, church window, crystal symmetry
- noise: flow fields, particles, wind, aurora, starfield, organic movement
- mandelbrot: fractals, infinite detail, psychedelic zoom, mathematical art
- voronoi: cells, stained glass, mosaic, organic cells, bubble patterns
- reaction_diffusion: coral, organism, zebrafish pattern, Turing, organic texture
- lsystem: trees, plants, ferns, fractals, botanical, nature growth
- attractor: strange attractor, chaos, Lorenz, butterfly effect, orbital paths
- cellular: pixel art, Game of Life, emergence, digital life, pattern growth
- waves: ripples, interference, sound visualization, water waves, moiré
- spirograph: geometric art, rose curves, hypnotic patterns, sacred geometry
- dla: coral, lightning, crystals, fractal branching, river delta
- particles: fireworks, sparks, star field, magic particles, fairy dust
- fourier: epicycles, orbits, drawing machine, harmonic motion
- lissajous: oscilloscope art, harmonic patterns, Lissajous curves
- boids: murmuration, flocking, birds, school of fish, swarm intelligence
- gravity: planetary orbits, cosmic dance, celestial mechanics, n-body
- aurora: northern lights, southern lights, aurora borealis, sky phenomena
- fractal_flame: flame fractals, fire art, abstract flame, chaotic beauty
- plasma: psychedelic, trippy, colorful waves, hypnotic background
- crystal: snowflake, ice crystal, frozen patterns, crystal growth
- interference: diffraction, holographic, light patterns, wave optics

Color palettes: fire, ocean, aurora, plasma, electric, nebula, crystal, sunrise, forest, worship

Respond ONLY with valid JSON in this exact format:
{
  "algorithmId": "<algorithm id>",
  "params": { <parameter key-value pairs appropriate for the algorithm> },
  "palette": ["#hex1", "#hex2", "#hex3", "#hex4", "#hex5"],
  "explanation": "<one sentence explaining the choice>"
}`;

export async function parsePromptToParams(
  prompt: string,
  apiKey?: string
): Promise<PromptResponse> {
  const key = apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not set');

  const client = new Anthropic({ apiKey: key });

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: `Generate procedural graphics for: "${prompt}"` }],
  });

  const text = message.content[0].type === 'text' ? message.content[0].text : '';

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in response');
    const parsed = JSON.parse(jsonMatch[0]) as PromptResponse;
    return parsed;
  } catch {
    return buildFallback(prompt);
  }
}

function buildFallback(prompt: string): PromptResponse {
  const lower = prompt.toLowerCase();

  let algorithmId: AlgorithmId = 'plasma';
  let palette = ['#0d0221', '#5c2d91', '#c4007b', '#ff0062', '#ffd700'];

  if (lower.includes('water') || lower.includes('flow') || lower.includes('liquid')) {
    algorithmId = 'fluid';
    palette = ['#000033', '#003366', '#006699', '#0099cc', '#33ccff'];
  } else if (lower.includes('aurora') || lower.includes('northern light')) {
    algorithmId = 'aurora';
    palette = ['#000814', '#001f3f', '#0d4f3c', '#00916e', '#c8f5d1'];
  } else if (lower.includes('worship') || lower.includes('church') || lower.includes('sacred')) {
    algorithmId = 'symmetry';
    palette = ['#0a0014', '#4a0080', '#9900cc', '#cc44ff', '#ffd700'];
  } else if (lower.includes('fractal') || lower.includes('mandelbrot')) {
    algorithmId = 'mandelbrot';
    palette = ['#0d0221', '#261447', '#5c2d91', '#c4007b', '#ffd700'];
  } else if (lower.includes('particle') || lower.includes('spark') || lower.includes('star')) {
    algorithmId = 'particles';
    palette = ['#000011', '#001133', '#0033cc', '#66ffff', '#ffffff'];
  } else if (lower.includes('crystal') || lower.includes('snowflake') || lower.includes('ice')) {
    algorithmId = 'crystal';
    palette = ['#001133', '#003388', '#0066dd', '#55aaff', '#ffffff'];
  } else if (lower.includes('boid') || lower.includes('flock') || lower.includes('bird') || lower.includes('swarm')) {
    algorithmId = 'boids';
    palette = ['#000011', '#001133', '#2244aa', '#55aaff', '#ffffff'];
  }

  return {
    algorithmId,
    params: {},
    palette,
    explanation: `Generated ${algorithmId} pattern based on "${prompt}"`,
  };
}

export function buildKeywordParams(algorithmId: AlgorithmId, prompt: string): Partial<Params> {
  const lower = prompt.toLowerCase();
  const extra: Partial<Params> = {};

  if (lower.includes('fast') || lower.includes('dynamic') || lower.includes('energetic')) {
    extra.speed = 3;
  } else if (lower.includes('slow') || lower.includes('calm') || lower.includes('peaceful')) {
    extra.speed = 0.3;
  }

  if (lower.includes('colorful') || lower.includes('rainbow') || lower.includes('vivid')) {
    extra.colorMode = 'spectrum';
    extra.colorScheme = 'rainbow';
  } else if (lower.includes('dark') || lower.includes('minimal') || lower.includes('black')) {
    extra.colorMode = 'monochrome';
    extra.colorScheme = 'mono';
  }

  if (lower.includes('complex') || lower.includes('detailed') || lower.includes('intricate')) {
    if (algorithmId === 'symmetry') extra.folds = 12;
    if (algorithmId === 'mandelbrot') extra.maxIter = 512;
    if (algorithmId === 'noise') extra.octaves = 5;
  }

  return extra;
}
