import { ColorPalette } from './types';

export const PRESET_PALETTES: ColorPalette[] = [
  {
    id: 'worship_gold',
    name: 'Worship Gold',
    colors: ['#0a0014', '#180038', '#4a0080', '#9900cc', '#cc44ff', '#ffffff', '#ffd700'],
    mood: ['worship', 'sacred', 'spiritual', 'divine'],
  },
  {
    id: 'aurora_borealis',
    name: 'Aurora Borealis',
    colors: ['#000814', '#001f3f', '#0d4f3c', '#00916e', '#61d095', '#c8f5d1'],
    mood: ['aurora', 'northern lights', 'arctic', 'ethereal'],
  },
  {
    id: 'cosmic_fire',
    name: 'Cosmic Fire',
    colors: ['#000000', '#1a0000', '#8b0000', '#ff4500', '#ff8c00', '#ffd700'],
    mood: ['fire', 'energy', 'power', 'dynamic'],
  },
  {
    id: 'deep_ocean',
    name: 'Deep Ocean',
    colors: ['#000033', '#003366', '#006699', '#0099cc', '#33ccff', '#99eeff'],
    mood: ['ocean', 'calm', 'depth', 'flow'],
  },
  {
    id: 'electric_plasma',
    name: 'Electric Plasma',
    colors: ['#0d0221', '#261447', '#5c2d91', '#c4007b', '#ff0062', '#ff6b35', '#ffd700'],
    mood: ['electric', 'plasma', 'energy', 'vibrant'],
  },
  {
    id: 'nebula_dream',
    name: 'Nebula Dream',
    colors: ['#0a0014', '#240046', '#5a0073', '#bc00dd', '#0057ff', '#0ee6f1'],
    mood: ['space', 'nebula', 'cosmic', 'mystical'],
  },
  {
    id: 'ice_crystal',
    name: 'Ice Crystal',
    colors: ['#001133', '#003388', '#0066dd', '#55aaff', '#aaddff', '#ffffff'],
    mood: ['ice', 'crystal', 'winter', 'pure'],
  },
  {
    id: 'golden_sunrise',
    name: 'Golden Sunrise',
    colors: ['#0d1b2a', '#7b2d8b', '#e05c5c', '#f4a261', '#e9c46a', '#ffffff'],
    mood: ['sunrise', 'warm', 'hope', 'morning'],
  },
  {
    id: 'forest_life',
    name: 'Forest Life',
    colors: ['#0a1628', '#1a3a2a', '#2d6a4f', '#52b788', '#95d5b2', '#d8f3dc'],
    mood: ['nature', 'organic', 'growth', 'life'],
  },
  {
    id: 'stained_glass',
    name: 'Stained Glass',
    colors: ['#1a0033', '#330066', '#cc0044', '#ff6600', '#ffcc00', '#0044cc', '#00aacc'],
    mood: ['church', 'sacred', 'colorful', 'radiant'],
  },
  {
    id: 'void_electric',
    name: 'Void Electric',
    colors: ['#000000', '#001133', '#0033cc', '#00aaff', '#66ffff', '#ffffff'],
    mood: ['electric', 'digital', 'tech', 'cyber'],
  },
  {
    id: 'rose_gold',
    name: 'Rose Gold',
    colors: ['#1a0010', '#5c1a3a', '#b5446e', '#f7b2d5', '#fde2e4', '#fad2e1'],
    mood: ['romantic', 'soft', 'elegant', 'warm'],
  },
  {
    id: 'monochrome_night',
    name: 'Monochrome Night',
    colors: ['#000000', '#111111', '#333333', '#666666', '#999999', '#ffffff'],
    mood: ['minimal', 'dark', 'clean', 'focus'],
  },
  {
    id: 'tropical_sunset',
    name: 'Tropical Sunset',
    colors: ['#003049', '#d62828', '#f77f00', '#fcbf49', '#eae2b7'],
    mood: ['sunset', 'warm', 'tropical', 'vibrant'],
  },
  {
    id: 'holy_spirit',
    name: 'Holy Spirit',
    colors: ['#000819', '#001a4d', '#003399', '#0055ff', '#ffffff', '#fffde7', '#ffd700'],
    mood: ['spiritual', 'worship', 'divine', 'holy'],
  },
];

export function getPaletteByMood(mood: string): ColorPalette {
  const lower = mood.toLowerCase();
  const match = PRESET_PALETTES.find((p) =>
    p.mood.some((m) => lower.includes(m))
  );
  return match ?? PRESET_PALETTES[0];
}

export function randomPalette(): ColorPalette {
  return PRESET_PALETTES[Math.floor(Math.random() * PRESET_PALETTES.length)];
}
