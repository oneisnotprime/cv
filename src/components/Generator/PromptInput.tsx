'use client';

import { useState, useRef } from 'react';
import { Sparkles, Send, Loader2, Wand2 } from 'lucide-react';
import { useGeneratorStore } from '@/lib/store';
import { PromptResponse } from '@/engine/types';

const EXAMPLE_PROMPTS = [
  'Flowing aurora borealis for a worship service',
  'Cosmic nebula with gold and purple for YouTube channel art',
  'Organic coral reef patterns in electric blue',
  'Sacred geometry mandala with stained glass colors',
  'Dark fluid simulation like ink in water',
  'Bioluminescent particle waves in deep ocean',
  'Fractal fire ritual for praise and worship',
  'Crystal ice snowflake geometric pattern',
  'Magnetic field lines of a cosmic star',
  'Neon particle vortex for gaming content',
];

export function PromptInput() {
  const [input, setInput] = useState('');
  const { setPromptLoading, promptLoading, applyPromptResult, setPromptText } = useGeneratorStore();
  const [lastResult, setLastResult] = useState<PromptResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = async (prompt?: string) => {
    const text = prompt ?? input.trim();
    if (!text || promptLoading) return;

    setPromptLoading(true);
    setError(null);
    setPromptText(text);

    try {
      const res = await fetch('/api/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: text }),
      });
      if (!res.ok) throw new Error(`Server error: ${res.statusText}`);
      const data = (await res.json()) as PromptResponse;
      setLastResult(data);
      applyPromptResult(data.algorithmId, data.params, data.palette);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to interpret prompt');
    } finally {
      setPromptLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Wand2 className="w-4 h-4 text-brand-400" />
        <h3 className="text-sm font-semibold text-white/80">AI Prompt Generation</h3>
      </div>

      {/* Textarea */}
      <div className="relative">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe the visual you want… e.g. 'flowing aurora for worship'"
          rows={3}
          className="input-base resize-none pr-12 text-sm leading-relaxed"
          disabled={promptLoading}
        />
        <button
          onClick={() => handleSubmit()}
          disabled={!input.trim() || promptLoading}
          className="absolute right-2 bottom-2 p-2 rounded-lg bg-brand-500 hover:bg-brand-400 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-white"
          aria-label="Generate"
        >
          {promptLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs">
          {error}
        </div>
      )}

      {/* Last result */}
      {lastResult && !error && (
        <div className="px-3 py-2.5 bg-brand-500/10 border border-brand-500/20 rounded-xl space-y-1.5">
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-brand-400 flex-shrink-0" />
            <p className="text-xs text-white/60">{lastResult.explanation}</p>
          </div>
          <div className="flex gap-1 flex-wrap">
            {lastResult.palette.map((color, i) => (
              <div
                key={i}
                className="w-5 h-5 rounded-md border border-white/10"
                style={{ backgroundColor: color }}
                title={color}
              />
            ))}
          </div>
        </div>
      )}

      {/* Example prompts */}
      <div>
        <p className="text-xs text-white/30 mb-2 font-medium">Try an example:</p>
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLE_PROMPTS.slice(0, 5).map((ex) => (
            <button
              key={ex}
              onClick={() => {
                setInput(ex);
                handleSubmit(ex);
              }}
              disabled={promptLoading}
              className="px-2.5 py-1 text-xs rounded-lg border border-white/10 hover:border-brand-500/50 text-white/40 hover:text-brand-300 bg-white/3 hover:bg-brand-500/10 transition-all disabled:opacity-40 text-left"
            >
              {ex}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
