'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { AlgorithmId, Params } from '@/engine/types';
import { ProceduralRenderer } from '@/engine/renderer';

interface CanvasRendererProps {
  algorithmId: AlgorithmId;
  params: Params;
  seed?: number;
  width?: number;
  height?: number;
  className?: string;
  onRendererReady?: (renderer: ProceduralRenderer) => void;
}

export function CanvasRenderer({
  algorithmId,
  params,
  seed = 42,
  width,
  height,
  className = '',
  onRendererReady,
}: CanvasRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<ProceduralRenderer | null>(null);
  const [fps, setFps] = useState(0);
  const fpsRef = useRef({ frames: 0, last: 0 });

  const initRenderer = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (rendererRef.current) {
      rendererRef.current.destroy();
      rendererRef.current = null;
    }

    try {
      const renderer = new ProceduralRenderer({
        canvas,
        algorithmId,
        params: { ...params, seed },
        seed,
        onFrame: (frame) => {
          const now = performance.now();
          fpsRef.current.frames++;
          if (now - fpsRef.current.last > 1000) {
            setFps(Math.round((fpsRef.current.frames * 1000) / (now - fpsRef.current.last)));
            fpsRef.current = { frames: 0, last: now };
          }
        },
      });
      renderer.start();
      rendererRef.current = renderer;
      onRendererReady?.(renderer);
    } catch (err) {
      console.error('Renderer error:', err);
    }
  }, [algorithmId, params, seed, onRendererReady]);

  // Initialize / reinitialize when algorithm changes
  useEffect(() => {
    initRenderer();
    return () => {
      rendererRef.current?.destroy();
      rendererRef.current = null;
    };
  }, [algorithmId, seed]); // reinit on algorithm/seed change

  // Hot-update params without restarting
  useEffect(() => {
    rendererRef.current?.updateParams(params);
  }, [params]);

  const canvasWidth = width ?? 1920;
  const canvasHeight = height ?? 1080;

  return (
    <div className={`relative ${className}`}>
      <canvas
        ref={canvasRef}
        width={canvasWidth}
        height={canvasHeight}
        className="w-full h-full object-cover"
      />
      {fps > 0 && (
        <div className="absolute top-2 right-2 px-2 py-0.5 rounded text-xs font-mono text-white/40 glass">
          {fps} fps
        </div>
      )}
    </div>
  );
}
