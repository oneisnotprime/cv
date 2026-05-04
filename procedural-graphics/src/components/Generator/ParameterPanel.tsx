'use client';

import { SlidersHorizontal, RefreshCw, Palette, ToggleLeft, ToggleRight } from 'lucide-react';
import { useGeneratorStore } from '@/lib/store';
import { PRESET_PALETTES } from '@/engine/palettes';
import { ALGORITHM_REGISTRY } from '@/engine/registry';
import { ParamSchema, ParamValue } from '@/engine/types';
import { cn } from '@/lib/utils';

export function ParameterPanel() {
  const { params, setParams, palette, setPalette, seed, randomizeSeed, activeAlgorithm } = useGeneratorStore();

  const algo = ALGORITHM_REGISTRY[activeAlgorithm];
  const schema: ParamSchema[] = algo?.meta.paramSchema ?? [];
  const defaults = algo?.meta.defaultParams ?? {};

  // Resolve value: store param → algo default → fallback
  function val(key: string, fallback: ParamValue): ParamValue {
    return params[key] !== undefined ? params[key] : (defaults[key] !== undefined ? defaults[key] : fallback);
  }

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
        <input
          type="number"
          value={seed}
          onChange={(e) => useGeneratorStore.getState().setSeed(Number(e.target.value))}
          className="input-base text-sm font-mono"
        />
      </div>

      {/* Algorithm-specific params from schema */}
      {schema.length === 0 && (
        <p className="text-xs text-white/25 italic">No parameters for this algorithm.</p>
      )}

      {schema.map((p) => {
        if (p.type === 'float' || p.type === 'int') {
          const v = Number(val(p.key, p.min ?? 0));
          const decimals = p.type === 'float' ? (p.step && p.step < 0.1 ? 3 : 2) : 0;
          return (
            <div key={p.key}>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-white/50">{p.label}</label>
                <span className="text-xs font-mono text-white/40">{v.toFixed(decimals)}</span>
              </div>
              <input
                type="range"
                min={p.min}
                max={p.max}
                step={p.step}
                value={v}
                onChange={(e) =>
                  setParams({ [p.key]: p.type === 'int' ? parseInt(e.target.value) : parseFloat(e.target.value) })
                }
                className="w-full accent-brand-500 cursor-pointer"
              />
            </div>
          );
        }

        if (p.type === 'bool') {
          const v = Boolean(val(p.key, false));
          return (
            <div key={p.key} className="flex items-center justify-between">
              <label className="text-xs text-white/50">{p.label}</label>
              <button
                onClick={() => setParams({ [p.key]: !v })}
                className={cn(
                  'transition-colors',
                  v ? 'text-brand-400' : 'text-white/20 hover:text-white/40'
                )}
                aria-label={p.label}
              >
                {v ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
              </button>
            </div>
          );
        }

        if (p.type === 'select' && p.options) {
          const v = String(val(p.key, p.options[0]?.value ?? ''));
          return (
            <div key={p.key}>
              <label className="text-xs text-white/50 mb-2 block">{p.label}</label>
              <div className="grid grid-cols-2 gap-1">
                {p.options.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setParams({ [p.key]: opt.value })}
                    className={cn(
                      'px-2 py-1.5 rounded-lg border text-xs font-medium transition-all',
                      v === opt.value
                        ? 'border-brand-500/50 bg-brand-500/15 text-brand-300'
                        : 'border-white/10 text-white/40 hover:text-white/70 hover:border-white/20 bg-white/3'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          );
        }

        if (p.type === 'color') {
          const v = String(val(p.key, '#000000'));
          return (
            <div key={p.key} className="flex items-center justify-between">
              <label className="text-xs text-white/50">{p.label}</label>
              <input
                type="color"
                value={v}
                onChange={(e) => setParams({ [p.key]: e.target.value })}
                className="w-8 h-8 rounded-lg cursor-pointer border border-white/10 bg-transparent"
              />
            </div>
          );
        }

        return null;
      })}

      {/* Color Palette */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Palette className="w-3.5 h-3.5 text-brand-400" />
          <label className="text-xs text-white/50">Color Palette</label>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {PRESET_PALETTES.map((preset) => (
            <button
              key={preset.id}
              onClick={() => setPalette(preset.colors)}
              className={cn(
                'group flex flex-col gap-1.5 p-2 rounded-xl border transition-all duration-200',
                JSON.stringify(palette) === JSON.stringify(preset.colors)
                  ? 'border-brand-500/60 bg-brand-500/10'
                  : 'border-transparent hover:border-white/20 bg-white/3 hover:bg-white/5'
              )}
              title={preset.name}
            >
              <div className="flex gap-0.5 w-full">
                {preset.colors.slice(0, 5).map((c, i) => (
                  <div key={i} className="flex-1 h-3 rounded-sm" style={{ backgroundColor: c }} />
                ))}
              </div>
              <span className="text-[10px] text-white/40 group-hover:text-white/60 leading-tight truncate">
                {preset.name}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
