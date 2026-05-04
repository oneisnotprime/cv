'use client';

import { AlgorithmId, AlgorithmMeta } from '@/engine/types';
import { useGeneratorStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { Zap } from 'lucide-react';

const ALGORITHM_GROUPS: { label: string; algorithms: { id: AlgorithmId; name: string; emoji: string }[] }[] = [
  {
    label: 'Fluid & Physics',
    algorithms: [
      { id: 'fluid', name: 'Fluid Dynamics', emoji: '🌊' },
      { id: 'particles', name: 'Particles', emoji: '✨' },
      { id: 'gravity', name: 'N-Body Gravity', emoji: '🪐' },
      { id: 'boids', name: 'Boids Flock', emoji: '🐦' },
      { id: 'magnetic', name: 'Magnetic Fields', emoji: '🧲' },
    ],
  },
  {
    label: 'Fractal & Math',
    algorithms: [
      { id: 'mandelbrot', name: 'Mandelbrot/Julia', emoji: '🔭' },
      { id: 'fractal_flame', name: 'Fractal Flame', emoji: '🔥' },
      { id: 'attractor', name: 'Strange Attractor', emoji: '🌀' },
      { id: 'lsystem', name: 'L-System', emoji: '🌿' },
      { id: 'dla', name: 'DLA Crystal', emoji: '❄️' },
      { id: 'crystal', name: 'Crystal Growth', emoji: '💎' },
    ],
  },
  {
    label: 'Patterns & Organic',
    algorithms: [
      { id: 'reaction_diffusion', name: 'Reaction-Diffusion', emoji: '🧬' },
      { id: 'voronoi', name: 'Voronoi Cells', emoji: '🪟' },
      { id: 'cellular', name: 'Cellular Automata', emoji: '🎮' },
      { id: 'noise', name: 'Flow Field', emoji: '🌬️' },
      { id: 'plasma', name: 'Plasma', emoji: '🌈' },
    ],
  },
  {
    label: 'Geometric & Wave',
    algorithms: [
      { id: 'symmetry', name: 'Kaleidoscope', emoji: '🪆' },
      { id: 'spirograph', name: 'Spirograph', emoji: '🎠' },
      { id: 'waves', name: 'Wave Interference', emoji: '〰️' },
      { id: 'fourier', name: 'Fourier Epicycles', emoji: '⚙️' },
      { id: 'lissajous', name: 'Lissajous', emoji: '📡' },
      { id: 'interference', name: 'Interference', emoji: '💫' },
    ],
  },
  {
    label: 'Atmospheric',
    algorithms: [
      { id: 'aurora', name: 'Aurora Borealis', emoji: '🌌' },
    ],
  },
];

export function AlgorithmSelector() {
  const { activeAlgorithm, setAlgorithm } = useGeneratorStore();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Zap className="w-4 h-4 text-brand-400" />
        <h3 className="text-sm font-semibold text-white/80">Algorithm</h3>
      </div>

      <div className="space-y-3">
        {ALGORITHM_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="text-xs text-white/30 font-medium uppercase tracking-wider mb-1.5 px-1">
              {group.label}
            </p>
            <div className="grid grid-cols-2 gap-1">
              {group.algorithms.map(({ id, name, emoji }) => (
                <button
                  key={id}
                  onClick={() => setAlgorithm(id)}
                  className={cn(
                    'flex items-center gap-2 px-2.5 py-2 rounded-xl text-left text-xs font-medium transition-all duration-200',
                    activeAlgorithm === id
                      ? 'bg-brand-500/25 text-brand-200 border border-brand-500/40 shadow shadow-brand-500/10'
                      : 'text-white/50 hover:text-white/80 hover:bg-white/5 border border-transparent'
                  )}
                >
                  <span className="text-base leading-none">{emoji}</span>
                  <span className="leading-tight">{name}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
