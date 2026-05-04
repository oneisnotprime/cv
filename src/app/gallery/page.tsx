import type { Metadata } from 'next';
import { GalleryGrid } from '@/components/Gallery/GalleryGrid';
import { Layers, Sparkles } from 'lucide-react';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Gallery',
  description: 'Browse your saved procedural graphics generations',
};

export default function GalleryPage() {
  return (
    <div className="min-h-screen py-12 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Layers className="w-5 h-5 text-brand-400" />
              <h1 className="text-2xl font-display font-bold">My Gallery</h1>
            </div>
            <p className="text-white/40 text-sm">Your saved procedural graphics</p>
          </div>
          <Link href="/generate" className="btn-primary inline-flex items-center gap-2 text-sm">
            <Sparkles className="w-4 h-4" />
            Create New
          </Link>
        </div>

        <GalleryGrid />
      </div>
    </div>
  );
}
