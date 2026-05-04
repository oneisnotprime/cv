import type { Algorithm, RenderContext, AlgorithmState } from '@/engine/types';

// ─── Aurora Borealis Simulation ───────────────────────────────────────────────

interface Star {
  x: number;
  y: number;
  size: number;
  twinklePhase: number;
  twinkleSpeed: number;
}

interface AuroraState {
  stars: Star[];
  noiseSeeds: Float32Array;
  timeOffset: number;
}

// Simple value noise
function valueNoise(x: number, y: number, t: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);

  const h = (a: number, b: number, c: number) => {
    let s = Math.sin(a * 127.1 + b * 311.7 + c * 74.3 + seed) * 43758.5453;
    return s - Math.floor(s);
  };

  const a = h(ix,     iy,     t);
  const bv = h(ix + 1, iy,     t);
  const cv = h(ix,     iy + 1, t);
  const d = h(ix + 1, iy + 1, t);
  return a + ux * (bv - a) + uy * (cv - a) + ux * uy * (a - bv - cv + d);
}

function fbm(x: number, y: number, t: number, seed: number, octaves = 3): number {
  let val = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    val += amp * valueNoise(x * freq, y * freq, t, seed + i * 17.3);
    amp *= 0.5;
    freq *= 2;
  }
  return val;
}

// Color palettes for aurora bands
const PALETTES: Record<string, [string, string, string][]> = {
  arctic: [
    ['#00ff87', '#00e5a0', '#00c8b4'],
    ['#00d4ff', '#00a8ff', '#0077ff'],
    ['#88ff88', '#00ff66', '#00dd44'],
    ['#aaffee', '#00ffcc', '#00ddaa'],
  ],
  tropical: [
    ['#ff00ff', '#cc00ff', '#8800ff'],
    ['#ff44cc', '#ee00aa', '#cc0088'],
    ['#ff88ff', '#ff44ee', '#ee00dd'],
    ['#aa00ff', '#8800cc', '#6600aa'],
  ],
  solar: [
    ['#ffaa00', '#ff6600', '#ff3300'],
    ['#ffdd00', '#ffaa00', '#ff7700'],
    ['#ffffff', '#ffffaa', '#ffdd66'],
    ['#ff4400', '#ff2200', '#dd1100'],
  ],
  nebula: [
    ['#4400ff', '#2200cc', '#0000aa'],
    ['#8833ff', '#6600ee', '#4400cc'],
    ['#aaaaff', '#8888ff', '#6666ff'],
    ['#2244ff', '#1133dd', '#0022bb'],
  ],
};

export const aurora: Algorithm = {
  meta: {
    id: 'aurora',
    name: 'Aurora Borealis',
    description: 'Animated aurora bands with noise-driven morphing, glow, and optional starfield',
    category: 'organic',
    tags: ['aurora', 'borealis', 'northern lights', 'ambient', 'worship'],
    animated: true,
    gpuHeavy: false,
    defaultParams: {
      numBands: 6,
      speed: 0.5,
      intensity: 0.7,
      colorScheme: 'arctic',
      height: 0.6,
      turbulence: 0.5,
      glow: true,
      starfield: true,
    },
    paramSchema: [
      { key: 'numBands',    label: 'Num Bands',     type: 'int',   min: 3,   max: 12,  step: 1 },
      { key: 'speed',       label: 'Speed',         type: 'float', min: 0.1, max: 3,   step: 0.05 },
      { key: 'intensity',   label: 'Intensity',     type: 'float', min: 0.3, max: 1,   step: 0.05 },
      { key: 'colorScheme', label: 'Color Scheme',  type: 'select', options: [
        { value: 'arctic',   label: 'Arctic' },
        { value: 'tropical', label: 'Tropical' },
        { value: 'solar',    label: 'Solar' },
        { value: 'nebula',   label: 'Nebula' },
      ]},
      { key: 'height',      label: 'Height',        type: 'float', min: 0.3, max: 0.9, step: 0.05 },
      { key: 'turbulence',  label: 'Turbulence',    type: 'float', min: 0.1, max: 2,   step: 0.1 },
      { key: 'glow',        label: 'Glow',          type: 'bool' },
      { key: 'starfield',   label: 'Starfield',     type: 'bool' },
    ],
  },

  init(ctx: RenderContext): AuroraState {
    const stars: Star[] = Array.from({ length: 200 }, () => ({
      x: Math.random() * ctx.width,
      y: Math.random() * ctx.height * 0.6,
      size: 0.5 + Math.random() * 1.5,
      twinklePhase: Math.random() * Math.PI * 2,
      twinkleSpeed: 0.5 + Math.random() * 2,
    }));

    const noiseSeeds = new Float32Array(12);
    for (let i = 0; i < 12; i++) noiseSeeds[i] = Math.random() * 1000;

    return { stars, noiseSeeds, timeOffset: 0 };
  },

  update(_ctx: RenderContext, state: AuroraState): void {
    state.timeOffset += 0.016;
  },

  render(ctx: RenderContext, state: AuroraState): void {
    const { ctx: c, width, height } = ctx;
    const numBands = (ctx.params.numBands as number) ?? 6;
    const speed = (ctx.params.speed as number) ?? 0.5;
    const intensity = (ctx.params.intensity as number) ?? 0.7;
    const colorScheme = (ctx.params.colorScheme as string) ?? 'arctic';
    const auroraHeight = (ctx.params.height as number) ?? 0.6;
    const turbulence = (ctx.params.turbulence as number) ?? 0.5;
    const glow = (ctx.params.glow as boolean) ?? true;
    const starfield = (ctx.params.starfield as boolean) ?? true;

    const t = state.timeOffset * speed;

    // Deep space background
    const bgGrad = c.createLinearGradient(0, 0, 0, height);
    bgGrad.addColorStop(0, '#000310');
    bgGrad.addColorStop(0.6, '#000820');
    bgGrad.addColorStop(1, '#001030');
    c.fillStyle = bgGrad;
    c.fillRect(0, 0, width, height);

    // Stars
    if (starfield) {
      for (const star of state.stars) {
        const twinkle = 0.4 + 0.6 * Math.abs(Math.sin(t * star.twinkleSpeed + star.twinklePhase));
        c.beginPath();
        c.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        c.fillStyle = `rgba(255,255,255,${twinkle * 0.9})`;
        c.fill();
      }
    }

    const palette = PALETTES[colorScheme] ?? PALETTES.arctic;

    // Draw glow gradient at bottom of aurora zone
    if (glow) {
      const glowY = height * (1 - auroraHeight);
      const horizGrad = c.createRadialGradient(
        width / 2, glowY, 0,
        width / 2, glowY, width * 0.6,
      );
      const baseColor = palette[0][0];
      horizGrad.addColorStop(0, baseColor + '33');
      horizGrad.addColorStop(0.5, baseColor + '11');
      horizGrad.addColorStop(1, 'transparent');
      c.fillStyle = horizGrad;
      c.fillRect(0, 0, width, height);
    }

    // Draw aurora bands
    for (let bi = 0; bi < numBands; bi++) {
      const bandFrac = bi / numBands;
      const seed = state.noiseSeeds[bi % state.noiseSeeds.length];
      const colPalette = palette[bi % palette.length];

      // Base y position for this band
      const baseY = height * (1 - auroraHeight) + bandFrac * height * auroraHeight * 0.8;
      const bandWidth = height * 0.04 + height * 0.06 * intensity;

      // Phase offset per band
      const phaseShift = bi * 0.7 + t * 0.3;

      const numPoints = 64;
      c.beginPath();

      // Top edge of band
      for (let xi = 0; xi <= numPoints; xi++) {
        const xFrac = xi / numPoints;
        const xPos = xFrac * width;

        const noiseVal = fbm(xFrac * 3 + phaseShift, t * 0.4, t * 0.1, seed);
        const wave = Math.sin(xFrac * Math.PI * 4 + t * 1.5 + bi * 0.8) * 0.3;
        const displacement = (noiseVal * 2 - 1) * turbulence * height * 0.08 + wave * height * 0.03;
        const y = baseY + displacement;

        if (xi === 0) c.moveTo(xPos, y - bandWidth);
        else c.lineTo(xPos, y - bandWidth);
      }

      // Bottom edge of band (reverse)
      for (let xi = numPoints; xi >= 0; xi--) {
        const xFrac = xi / numPoints;
        const xPos = xFrac * width;

        const noiseVal = fbm(xFrac * 3 + phaseShift + 10, t * 0.4 + 5, t * 0.1, seed + 7);
        const wave = Math.sin(xFrac * Math.PI * 4 + t * 1.5 + bi * 0.8 + 0.3) * 0.3;
        const displacement = (noiseVal * 2 - 1) * turbulence * height * 0.06 + wave * height * 0.02;
        const y = baseY + displacement;

        c.lineTo(xPos, y + bandWidth);
      }
      c.closePath();

      // Gradient fill: color fading at edges
      const gradY = baseY - bandWidth;
      const grad = c.createLinearGradient(0, gradY, 0, gradY + bandWidth * 2);
      const alpha = intensity * (0.3 + 0.4 * Math.sin(t + bi));
      grad.addColorStop(0,   colPalette[0] + '00');
      grad.addColorStop(0.3, colPalette[1] + Math.round(alpha * 200).toString(16).padStart(2, '0'));
      grad.addColorStop(0.7, colPalette[2] + Math.round(alpha * 160).toString(16).padStart(2, '0'));
      grad.addColorStop(1,   colPalette[0] + '00');

      c.fillStyle = grad;
      c.globalCompositeOperation = 'screen';
      c.fill();
    }

    c.globalCompositeOperation = 'source-over';

    // Horizon glow
    const horizY = height * (1 - auroraHeight * 0.3);
    const hGrad = c.createLinearGradient(0, horizY, 0, height);
    hGrad.addColorStop(0, 'rgba(0,20,40,0)');
    hGrad.addColorStop(1, 'rgba(0,10,30,0.9)');
    c.fillStyle = hGrad;
    c.fillRect(0, 0, width, height);
  },
};

export default aurora;
