// ─── Core algorithm registry ─────────────────────────────────────────────────

export type AlgorithmId =
  | 'fluid'
  | 'magnetic'
  | 'symmetry'
  | 'noise'
  | 'mandelbrot'
  | 'voronoi'
  | 'reaction_diffusion'
  | 'lsystem'
  | 'attractor'
  | 'cellular'
  | 'waves'
  | 'spirograph'
  | 'dla'
  | 'particles'
  | 'fourier'
  | 'lissajous'
  | 'boids'
  | 'gravity'
  | 'aurora'
  | 'fractal_flame'
  | 'plasma'
  | 'interference'
  | 'crystal';

export type AlgorithmCategory =
  | 'fluid'
  | 'physics'
  | 'fractal'
  | 'pattern'
  | 'organic'
  | 'geometric';

export interface AlgorithmMeta {
  id: AlgorithmId;
  name: string;
  description: string;
  category: AlgorithmCategory;
  tags: string[];
  animated: boolean;
  gpuHeavy: boolean;
  defaultParams: Record<string, ParamValue>;
  paramSchema: ParamSchema[];
}

// ─── Parameter system ─────────────────────────────────────────────────────────

export type ParamValue = number | boolean | string | number[];

export interface ParamSchema {
  key: string;
  label: string;
  type: 'float' | 'int' | 'bool' | 'color' | 'select' | 'color_array';
  min?: number;
  max?: number;
  step?: number;
  options?: { value: string; label: string }[];
  description?: string;
}

export type Params = Record<string, ParamValue>;

// ─── Render context ───────────────────────────────────────────────────────────

export interface RenderContext {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  time: number;
  frame: number;
  params: Params;
  imageData: ImageData;
  pixelData: Uint8ClampedArray;
}

export type DrawFn = (ctx: RenderContext) => void;
export type InitFn = (ctx: RenderContext) => AlgorithmState;
export type UpdateFn = (ctx: RenderContext, state: AlgorithmState) => void;
export type RenderFn = (ctx: RenderContext, state: AlgorithmState) => void;
export type CleanupFn = (state: AlgorithmState) => void;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AlgorithmState = any;

export interface Algorithm {
  meta: AlgorithmMeta;
  init: InitFn;
  update: UpdateFn;
  render: RenderFn;
  cleanup?: CleanupFn;
}

// ─── Color system ─────────────────────────────────────────────────────────────

export interface ColorPalette {
  id: string;
  name: string;
  colors: string[];
  mood: string[];
}

export type ColorMode = 'palette' | 'hsl_cycle' | 'monochrome' | 'complementary';

// ─── Generation request/response ──────────────────────────────────────────────

export interface GenerateRequest {
  algorithmId: AlgorithmId;
  params: Params;
  width: number;
  height: number;
  seed?: number;
}

export interface PromptRequest {
  prompt: string;
  style?: string;
}

export interface PromptResponse {
  algorithmId: AlgorithmId;
  params: Params;
  palette: string[];
  explanation: string;
}

// ─── Marketplace types ────────────────────────────────────────────────────────

export type LicenseType = 'personal' | 'commercial' | 'worship' | 'broadcast';

export interface Product {
  id: string;
  title: string;
  description: string;
  algorithmId: AlgorithmId;
  params: Params;
  palette: string[];
  previewUrl: string;
  price: number;
  license: LicenseType;
  tags: string[];
  createdAt: string;
  downloads: number;
  animated: boolean;
}

export interface PricingTier {
  id: string;
  name: string;
  price: number;
  interval: 'month' | 'year';
  features: string[];
  stripeId: string;
  popular?: boolean;
}

// ─── Saved generation ────────────────────────────────────────────────────────

export interface SavedGeneration {
  id: string;
  algorithmId: AlgorithmId;
  params: Params;
  palette: string[];
  seed: number;
  promptText?: string;
  thumbnailDataUrl: string;
  createdAt: number;
}

// ─── Export types ─────────────────────────────────────────────────────────────

export type ExportFormat = 'png' | 'svg' | 'webm' | 'gif';

export interface ExportOptions {
  format: ExportFormat;
  width: number;
  height: number;
  quality?: number;
  frames?: number;
  fps?: number;
}

// ─── UI store types ───────────────────────────────────────────────────────────

export interface GeneratorState {
  activeAlgorithm: AlgorithmId;
  params: Params;
  palette: string[];
  seed: number;
  isAnimating: boolean;
  isGenerating: boolean;
  promptText: string;
  promptLoading: boolean;
  savedGenerations: SavedGeneration[];
  activeTab: 'prompt' | 'algorithm' | 'params' | 'export';
}
