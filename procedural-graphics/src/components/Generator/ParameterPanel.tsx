'use client';

import { SlidersHorizontal, RefreshCw, Palette } from 'lucide-react';
import { useGeneratorStore } from '@/lib/store';
import { PRESET_PALETTES } from '@/engine/palettes';
import { cn } from '@/lib/utils';

export function ParameterPanel() {
  const { params, setParams, palette, setPalette, seed, randomizeSeed } = useGeneratorStore();

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <SlidersHorizontal className="w-4 h-4 text-brand-400" />
        <h3 className="text-sm font-semibold text-white/80">Parameters</h3>
      </div>

      {/* Seed */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs text-white/50">Seed</label>
          <button
            onClick={randomizeSeed}
            className="flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300 transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            Randomize
          </button>
        </div>
        <div className="flex gap-2">
          <input
            type="number"
            value={seed}
            onChange={(e) => useGeneratorStore.getState().setSeed(Number(e.target.value))}
            className="input-base text-sm font-mono"
          />
        </div>
      </div>

      {/* Speed */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs text-white/50">Speed</label>
          <span className="text-xs font-mono text-white/40">{params.speed ?? 1}</span>
        </div>
        <input
          type="range"
          min={0.1}
          max={5}
          step={0.1}
          value={Number(params.speed ?? 1)}
          onChange={(e) => setParams({ speed: parseFloat(e.target.value) })}
          className="w-full accent-brand-500"
        />
      </div>

      {/* Complexity / detail param */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs text-white/50">Complexity</label>
          <span className="text-xs font-mono text-white/40">{params.complexity ?? 4}</span>
        </div>
        <input
          type="range"
          min={1}
          max={8}
          step={1}
          value={Number(params.complexity ?? 4)}
          onChange={(e) => setParams({ complexity: parseInt(e.target.value) })}
          className="w-full accent-brand-500"
        />
      </div>

      {/* Intensity */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs text-white/50">Intensity</label>
          <span className="text-xs font-mono text-white/40">{params.intensity ?? 0.7}</span>
        </div>
        <input
          type="range"
          min={0.1}
          max={1}
          step={0.05}
          value={Number(params.intensity ?? 0.7)}
          onChange={(e) => setParams({ intensity: parseFloat(e.target.value) })}
          className="w-full accent-brand-500"
        />
      </div>

      {/* Color Palette */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Palette className="w-3.5 h-3.5 text-brand-400" />
          <label className="text-xs text-white/50">Color Palette</label>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {PRESET_PALETTES.map((p) => (
            <button
              key={p.id}
              onClick={() => setPalette(p.colors)}
              className={cn(
                'group relative flex flex-col gap-1.5 p-2 rounded-xl border transition-all duration-200',
                JSON.stringify(palette) === JSON.stringify(p.colors)
                  ? 'border-brand-500/60 bg-brand-500/10'
                  : 'border-transparent hover:border-white/20 bg-white/3 hover:bg-white/5'
              )}
              title={p.name}
            >
              <div className="flex gap-0.5 w-full">
                {p.colors.slice(0, 5).map((c, i) => (
                  <div
                    key={i}
                    className="flex-1 h-3 rounded-sm"
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <span className="text-[10px] text-white/40 group-hover:text-white/60 leading-tight truncate">
                {p.name}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
