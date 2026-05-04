'use client';

import { useRef, useState, useCallback } from 'react';
import { CanvasRenderer } from '@/components/Canvas/CanvasRenderer';
import { PromptInput } from '@/components/Generator/PromptInput';
import { AlgorithmSelector } from '@/components/Generator/AlgorithmSelector';
import { ParameterPanel } from '@/components/Generator/ParameterPanel';
import { ExportPanel } from '@/components/Generator/ExportPanel';
import { useGeneratorStore } from '@/lib/store';
import { ProceduralRenderer } from '@/engine/renderer';
import { Play, Pause, RefreshCw, ChevronLeft, ChevronRight, Wand2, Cpu, Sliders, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Metadata } from 'next';

const TABS = [
  { id: 'prompt' as const, label: 'Prompt', icon: Wand2 },
  { id: 'algorithm' as const, label: 'Algorithm', icon: Cpu },
  { id: 'params' as const, label: 'Params', icon: Sliders },
  { id: 'export' as const, label: 'Export', icon: Download },
];

export default function GeneratePage() {
  const rendererRef = useRef<ProceduralRenderer | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const {
    activeAlgorithm,
    params,
    seed,
    isAnimating,
    setAnimating,
    randomizeSeed,
    activeTab,
    setActiveTab,
  } = useGeneratorStore();

  const handleRendererReady = useCallback((renderer: ProceduralRenderer) => {
    rendererRef.current = renderer;
    // Grab canvas ref from the renderer
    const canvas = renderer['canvas'] as HTMLCanvasElement;
    (canvasRef as React.MutableRefObject<HTMLCanvasElement | null>).current = canvas;
  }, []);

  const toggleAnimation = () => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    if (isAnimating) {
      renderer.stop();
    } else {
      renderer.start();
    }
    setAnimating(!isAnimating);
  };

  const handleRestart = () => {
    rendererRef.current?.restart();
    randomizeSeed();
  };

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden bg-surface-950">
      {/* Canvas area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-white/5 bg-surface-900/50">
          <div className="flex items-center gap-1">
            <button
              onClick={toggleAnimation}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium glass hover:bg-white/10 transition-colors"
            >
              {isAnimating ? (
                <><Pause className="w-3.5 h-3.5" /> Pause</>
              ) : (
                <><Play className="w-3.5 h-3.5" /> Play</>
              )}
            </button>
            <button
              onClick={handleRestart}
              className="p-1.5 rounded-lg glass hover:bg-white/10 transition-colors"
              title="New seed"
            >
              <RefreshCw className="w-3.5 h-3.5 text-white/60" />
            </button>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs text-white/30 font-mono truncate capitalize">
                {activeAlgorithm.replace('_', ' ')} · seed {seed}
              </span>
            </div>
          </div>

          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 rounded-lg glass hover:bg-white/10 transition-colors"
            title={sidebarOpen ? 'Hide panel' : 'Show panel'}
          >
            {sidebarOpen ? (
              <ChevronRight className="w-4 h-4 text-white/60" />
            ) : (
              <ChevronLeft className="w-4 h-4 text-white/60" />
            )}
          </button>
        </div>

        {/* Canvas */}
        <div className="flex-1 relative canvas-checkerboard">
          <CanvasRenderer
            algorithmId={activeAlgorithm}
            params={params}
            seed={seed}
            className="absolute inset-0"
            onRendererReady={handleRendererReady}
          />
        </div>
      </div>

      {/* Sidebar */}
      <div
        className={cn(
          'flex-shrink-0 border-l border-white/5 bg-surface-900 flex flex-col transition-all duration-300 overflow-hidden',
          sidebarOpen ? 'w-80' : 'w-0'
        )}
      >
        {sidebarOpen && (
          <>
            {/* Tab bar */}
            <div className="flex border-b border-white/5">
              {TABS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={cn(
                    'flex-1 flex flex-col items-center gap-1 py-3 text-[10px] font-medium transition-colors',
                    activeTab === id
                      ? 'text-brand-300 border-b-2 border-brand-500'
                      : 'text-white/30 hover:text-white/60'
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto p-4">
              {activeTab === 'prompt' && <PromptInput />}
              {activeTab === 'algorithm' && <AlgorithmSelector />}
              {activeTab === 'params' && <ParameterPanel />}
              {activeTab === 'export' && (
                <ExportPanel
                  rendererRef={rendererRef}
                  canvasRef={canvasRef as React.RefObject<HTMLCanvasElement>}
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
