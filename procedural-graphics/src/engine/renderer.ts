'use client';

import { Algorithm, AlgorithmId, AlgorithmState, Params, RenderContext, ExportOptions } from './types';
import { ALGORITHM_REGISTRY } from './registry';

interface RendererOptions {
  canvas: HTMLCanvasElement;
  algorithmId: AlgorithmId;
  params: Params;
  seed?: number;
  onFrame?: (frame: number) => void;
}

export class ProceduralRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private algorithm: Algorithm;
  private state: AlgorithmState = null;
  private params: Params;
  private animFrameId: number | null = null;
  private frame = 0;
  private startTime = 0;
  private running = false;
  private onFrame?: (frame: number) => void;

  constructor(opts: RendererOptions) {
    this.canvas = opts.canvas;
    const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Cannot get 2D context');
    this.ctx = ctx;
    this.params = { ...opts.params };
    this.onFrame = opts.onFrame;

    const algo = ALGORITHM_REGISTRY[opts.algorithmId];
    if (!algo) throw new Error(`Unknown algorithm: ${opts.algorithmId}`);
    this.algorithm = algo;
  }

  private buildRenderContext(time: number): RenderContext {
    const { width, height } = this.canvas;
    const imageData = this.ctx.createImageData(width, height);
    return {
      canvas: this.canvas,
      ctx: this.ctx,
      width,
      height,
      time,
      frame: this.frame,
      params: this.params,
      imageData,
      pixelData: imageData.data,
    };
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.startTime = performance.now();
    this.frame = 0;

    const rctx = this.buildRenderContext(0);
    this.state = this.algorithm.init(rctx);

    const loop = (now: number) => {
      if (!this.running) return;
      const time = now - this.startTime;
      const rctx = this.buildRenderContext(time);
      this.algorithm.update(rctx, this.state);
      this.algorithm.render(rctx, this.state);
      this.frame++;
      this.onFrame?.(this.frame);
      this.animFrameId = requestAnimationFrame(loop);
    };
    this.animFrameId = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  restart(newAlgorithmId?: AlgorithmId, newParams?: Params) {
    this.stop();
    if (newAlgorithmId) {
      const algo = ALGORITHM_REGISTRY[newAlgorithmId];
      if (!algo) throw new Error(`Unknown algorithm: ${newAlgorithmId}`);
      if (this.algorithm.cleanup) this.algorithm.cleanup(this.state);
      this.algorithm = algo;
    }
    if (newParams) this.params = { ...newParams };
    this.start();
  }

  updateParams(params: Partial<Params>) {
    this.params = { ...this.params, ...params };
  }

  setAlgorithm(id: AlgorithmId, params?: Params) {
    this.restart(id, params ?? this.algorithm.meta.defaultParams);
  }

  renderSingleFrame(): void {
    const time = performance.now() - this.startTime;
    const rctx = this.buildRenderContext(time);
    if (!this.state) this.state = this.algorithm.init(rctx);
    this.algorithm.update(rctx, this.state);
    this.algorithm.render(rctx, this.state);
  }

  async exportPng(width: number, height: number): Promise<Blob> {
    const offscreen = document.createElement('canvas');
    offscreen.width = width;
    offscreen.height = height;
    const origCanvas = this.canvas;

    this.canvas = offscreen;
    const ctx = offscreen.getContext('2d', { willReadFrequently: true })!;
    this.ctx = ctx;
    this.renderSingleFrame();
    this.canvas = origCanvas;
    this.ctx = origCanvas.getContext('2d', { willReadFrequently: true })!;

    return new Promise((resolve) => {
      offscreen.toBlob((b) => resolve(b!), 'image/png');
    });
  }

  async exportWebM(opts: ExportOptions): Promise<Blob> {
    const { frames = 120, fps = 30, width, height } = opts;
    const offscreen = document.createElement('canvas');
    offscreen.width = width;
    offscreen.height = height;

    const stream = offscreen.captureStream(fps);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (e) => chunks.push(e.data);

    const origCanvas = this.canvas;
    this.canvas = offscreen;
    this.ctx = offscreen.getContext('2d', { willReadFrequently: true })!;

    recorder.start();
    for (let i = 0; i < frames; i++) {
      this.frame = i;
      this.renderSingleFrame();
      await new Promise((r) => setTimeout(r, 1000 / fps));
    }
    recorder.stop();

    this.canvas = origCanvas;
    this.ctx = origCanvas.getContext('2d', { willReadFrequently: true })!;

    return new Promise((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
    });
  }

  destroy() {
    this.stop();
    if (this.algorithm.cleanup) this.algorithm.cleanup(this.state);
  }
}

// ─── Color utilities shared by algorithms ────────────────────────────────────

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60)  { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else             { r = c; g = 0; b = x; }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function lerpColor(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

export function samplePalette(palette: string[], t: number): [number, number, number] {
  t = Math.max(0, Math.min(1, t));
  const n = palette.length;
  const idx = t * (n - 1);
  const lo = Math.floor(idx);
  const hi = Math.min(lo + 1, n - 1);
  const frac = idx - lo;
  return lerpColor(hexToRgb(palette[lo]), hexToRgb(palette[hi]), frac);
}

export const PALETTES: Record<string, string[]> = {
  fire:    ['#000000', '#1a0000', '#8b0000', '#ff4500', '#ff8c00', '#ffd700', '#ffffff'],
  ocean:   ['#000033', '#003366', '#006699', '#0099cc', '#33ccff', '#99eeff', '#ffffff'],
  aurora:  ['#000814', '#001f3f', '#0d4f3c', '#00916e', '#61d095', '#c8f5d1'],
  plasma:  ['#0d0221', '#261447', '#5c2d91', '#c4007b', '#ff0062', '#ff6b35', '#ffd700'],
  electric:['#000000', '#001133', '#0033cc', '#00aaff', '#66ffff', '#ffffff'],
  nebula:  ['#0a0014', '#240046', '#5a0073', '#bc00dd', '#0057ff', '#0ee6f1'],
  crystal: ['#001133', '#003388', '#0066dd', '#55aaff', '#aaddff', '#ffffff'],
  sunrise: ['#0d1b2a', '#1b2631', '#7b2d8b', '#e05c5c', '#f4a261', '#e9c46a'],
  forest:  ['#0a1628', '#1a3a2a', '#2d6a4f', '#52b788', '#95d5b2', '#d8f3dc'],
  worship: ['#0a0014', '#180038', '#4a0080', '#9900cc', '#cc44ff', '#ffffff', '#ffd700'],
};
