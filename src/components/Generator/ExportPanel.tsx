'use client';

import { Download, Film, Image, Bookmark, Share2, Loader2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { useGeneratorStore } from '@/lib/store';
import { ProceduralRenderer } from '@/engine/renderer';
import { downloadBlob, canvasToBlob } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface ExportPanelProps {
  rendererRef: React.MutableRefObject<ProceduralRenderer | null>;
  canvasRef: React.RefObject<HTMLCanvasElement>;
}

type ExportFormat = 'png_1080' | 'png_4k' | 'webm_30s' | 'webm_10s';

export function ExportPanel({ rendererRef, canvasRef }: ExportPanelProps) {
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [saved, setSaved] = useState(false);
  const { activeAlgorithm, params, palette, seed, promptText, saveGeneration } = useGeneratorStore();

  const handleExport = async (format: ExportFormat) => {
    if (exporting) return;
    const renderer = rendererRef.current;
    const canvas = canvasRef.current;
    if (!renderer || !canvas) return;

    setExporting(format);
    try {
      if (format === 'png_1080') {
        const blob = await renderer.exportPng(1920, 1080);
        downloadBlob(blob, `procedural-${activeAlgorithm}-${seed}.png`);
      } else if (format === 'png_4k') {
        const blob = await renderer.exportPng(3840, 2160);
        downloadBlob(blob, `procedural-${activeAlgorithm}-${seed}-4k.png`);
      } else if (format === 'webm_10s') {
        const blob = await renderer.exportWebM({ format: 'webm', width: 1920, height: 1080, frames: 300, fps: 30 });
        downloadBlob(blob, `procedural-${activeAlgorithm}-${seed}-10s.webm`);
      } else if (format === 'webm_30s') {
        const blob = await renderer.exportWebM({ format: 'webm', width: 1920, height: 1080, frames: 900, fps: 30 });
        downloadBlob(blob, `procedural-${activeAlgorithm}-${seed}-30s.webm`);
      }
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setExporting(null);
    }
  };

  const handleSave = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const thumbnailDataUrl = canvas.toDataURL('image/jpeg', 0.5);
    saveGeneration({ algorithmId: activeAlgorithm, params, palette, seed, promptText, thumbnailDataUrl });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const exports: { format: ExportFormat; label: string; sublabel: string; icon: React.FC<{ className?: string }> }[] = [
    { format: 'png_1080', label: 'PNG 1080p', sublabel: '1920×1080', icon: Image },
    { format: 'png_4k', label: 'PNG 4K', sublabel: '3840×2160', icon: Image },
    { format: 'webm_10s', label: 'WebM 10s', sublabel: 'Video loop', icon: Film },
    { format: 'webm_30s', label: 'WebM 30s', sublabel: 'Full motion', icon: Film },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Download className="w-4 h-4 text-brand-400" />
        <h3 className="text-sm font-semibold text-white/80">Export</h3>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {exports.map(({ format, label, sublabel, icon: Icon }) => (
          <button
            key={format}
            onClick={() => handleExport(format)}
            disabled={exporting !== null}
            className={cn(
              'flex items-center gap-2 p-3 rounded-xl border border-white/10 hover:border-brand-500/40 bg-white/3 hover:bg-brand-500/5 transition-all text-left group disabled:opacity-50',
            )}
          >
            {exporting === format ? (
              <Loader2 className="w-4 h-4 text-brand-400 animate-spin flex-shrink-0" />
            ) : (
              <Icon className="w-4 h-4 text-white/40 group-hover:text-brand-400 transition-colors flex-shrink-0" />
            )}
            <div>
              <p className="text-xs font-medium text-white/70 group-hover:text-white/90">{label}</p>
              <p className="text-[10px] text-white/30">{sublabel}</p>
            </div>
          </button>
        ))}
      </div>

      <div className="flex gap-2 pt-1">
        <button
          onClick={handleSave}
          className={cn(
            'flex-1 flex items-center justify-center gap-2 py-2 rounded-xl border text-xs font-medium transition-all',
            saved
              ? 'border-green-500/50 bg-green-500/10 text-green-400'
              : 'border-white/10 hover:border-white/20 bg-white/3 hover:bg-white/5 text-white/50 hover:text-white/80'
          )}
        >
          <Bookmark className="w-3.5 h-3.5" />
          {saved ? 'Saved!' : 'Save Preset'}
        </button>
        <button className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-white/10 hover:border-white/20 bg-white/3 hover:bg-white/5 text-white/50 hover:text-white/80 text-xs font-medium transition-all">
          <Share2 className="w-3.5 h-3.5" />
          Share
        </button>
      </div>

      <div className="px-3 py-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl">
        <p className="text-xs text-amber-300/80">
          4K export and video formats require a Creator or Worship plan.
        </p>
      </div>
    </div>
  );
}
