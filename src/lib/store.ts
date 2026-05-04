'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { AlgorithmId, GeneratorState, Params, SavedGeneration } from '@/engine/types';
import { PRESET_PALETTES } from '@/engine/palettes';

interface GeneratorStore extends GeneratorState {
  setAlgorithm: (id: AlgorithmId) => void;
  setParams: (params: Partial<Params>) => void;
  setPalette: (palette: string[]) => void;
  setSeed: (seed: number) => void;
  randomizeSeed: () => void;
  setAnimating: (v: boolean) => void;
  setGenerating: (v: boolean) => void;
  setPromptText: (text: string) => void;
  setPromptLoading: (v: boolean) => void;
  setActiveTab: (tab: GeneratorState['activeTab']) => void;
  saveGeneration: (gen: Omit<SavedGeneration, 'id' | 'createdAt'>) => void;
  deleteSaved: (id: string) => void;
  applyPromptResult: (algorithmId: AlgorithmId, params: Params, palette: string[]) => void;
}

export const useGeneratorStore = create<GeneratorStore>()(
  persist(
    (set) => ({
      activeAlgorithm: 'aurora',
      params: {},
      palette: PRESET_PALETTES[0].colors,
      seed: Math.floor(Math.random() * 99999),
      isAnimating: true,
      isGenerating: false,
      promptText: '',
      promptLoading: false,
      savedGenerations: [],
      activeTab: 'prompt',

      setAlgorithm: (id) => set({ activeAlgorithm: id, params: {} }),
      setParams: (p) => set((s) => ({ params: { ...s.params, ...p } })),
      setPalette: (palette) => set({ palette }),
      setSeed: (seed) => set({ seed }),
      randomizeSeed: () => set({ seed: Math.floor(Math.random() * 99999) }),
      setAnimating: (v) => set({ isAnimating: v }),
      setGenerating: (v) => set({ isGenerating: v }),
      setPromptText: (text) => set({ promptText: text }),
      setPromptLoading: (v) => set({ promptLoading: v }),
      setActiveTab: (tab) => set({ activeTab: tab }),

      saveGeneration: (gen) =>
        set((s) => ({
          savedGenerations: [
            {
              ...gen,
              id: crypto.randomUUID(),
              createdAt: Date.now(),
            },
            ...s.savedGenerations.slice(0, 49),
          ],
        })),

      deleteSaved: (id) =>
        set((s) => ({ savedGenerations: s.savedGenerations.filter((g) => g.id !== id) })),

      applyPromptResult: (algorithmId, params, palette) =>
        set({ activeAlgorithm: algorithmId, params, palette, activeTab: 'params' }),
    }),
    {
      name: 'procedural-generator',
      partialize: (s) => ({
        savedGenerations: s.savedGenerations,
        activeAlgorithm: s.activeAlgorithm,
        palette: s.palette,
        seed: s.seed,
      }),
    }
  )
);
