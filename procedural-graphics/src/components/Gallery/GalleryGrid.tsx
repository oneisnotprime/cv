'use client';

import { SavedGeneration } from '@/engine/types';
import { useGeneratorStore } from '@/lib/store';
import { useRouter } from 'next/navigation';
import { Trash2, ExternalLink, Play } from 'lucide-react';
import Image from 'next/image';

export function GalleryGrid() {
  const { savedGenerations, deleteSaved, applyPromptResult, setAlgorithm, setParams } = useGeneratorStore();
  const router = useRouter();

  const handleOpen = (gen: SavedGeneration) => {
    setAlgorithm(gen.algorithmId);
    setParams(gen.params);
    applyPromptResult(gen.algorithmId, gen.params, gen.palette);
    router.push('/generate');
  };

  if (savedGenerations.length === 0) {
    return (
      <div className="text-center py-24">
        <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-4">
          <Play className="w-7 h-7 text-white/20" />
        </div>
        <h3 className="text-white/50 font-medium mb-1">No saved generations</h3>
        <p className="text-white/30 text-sm">
          Go to the generator and save your creations to see them here.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      {savedGenerations.map((gen) => (
        <div key={gen.id} className="group relative rounded-2xl overflow-hidden glass aspect-video">
          {/* Thumbnail */}
          {gen.thumbnailDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={gen.thumbnailDataUrl}
              alt={gen.algorithmId}
              className="w-full h-full object-cover"
            />
          ) : (
            <div
              className="w-full h-full"
              style={{
                background: `linear-gradient(135deg, ${gen.palette.slice(0, 3).join(', ')})`,
              }}
            />
          )}

          {/* Palette strip */}
          <div className="absolute bottom-0 left-0 right-0 flex h-1.5">
            {gen.palette.map((c, i) => (
              <div key={i} className="flex-1" style={{ backgroundColor: c }} />
            ))}
          </div>

          {/* Overlay */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/60 transition-all flex flex-col justify-between p-3 opacity-0 group-hover:opacity-100">
            <div className="flex justify-end">
              <button
                onClick={() => deleteSaved(gen.id)}
                className="p-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/40 text-red-300 transition-colors"
                title="Delete"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <div>
              <p className="text-white text-xs font-semibold capitalize">{gen.algorithmId.replace('_', ' ')}</p>
              {gen.promptText && (
                <p className="text-white/60 text-[10px] mt-0.5 line-clamp-2">{gen.promptText}</p>
              )}
              <button
                onClick={() => handleOpen(gen)}
                className="mt-2 flex items-center gap-1 text-xs text-brand-300 hover:text-brand-200 font-medium"
              >
                <ExternalLink className="w-3 h-3" />
                Open in generator
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
