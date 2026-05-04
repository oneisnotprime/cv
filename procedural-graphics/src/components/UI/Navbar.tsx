'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Sparkles, Layers, ShoppingBag, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

const links = [
  { href: '/generate', label: 'Generate', icon: Sparkles },
  { href: '/gallery', label: 'Gallery', icon: Layers },
  { href: '/marketplace', label: 'Marketplace', icon: ShoppingBag },
];

export function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 glass-dark border-b border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center shadow-lg shadow-brand-500/30 group-hover:shadow-brand-400/40 transition-shadow">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="font-display font-bold text-lg tracking-tight">
              <span className="gradient-text">Procedural</span>
            </span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-1">
            {links.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200',
                  pathname.startsWith(href)
                    ? 'bg-brand-500/20 text-brand-300 border border-brand-500/30'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                )}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            ))}
          </div>

          {/* CTA */}
          <div className="hidden md:flex items-center gap-3">
            <Link href="/marketplace" className="btn-secondary text-sm py-2 px-4">
              Pricing
            </Link>
            <Link href="/generate" className="btn-primary text-sm py-2 px-4">
              Start Creating
            </Link>
          </div>

          {/* Mobile menu toggle */}
          <button
            className="md:hidden p-2 rounded-xl hover:bg-white/5 text-white/70"
            onClick={() => setOpen(!open)}
            aria-label="Toggle menu"
          >
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Mobile menu */}
        {open && (
          <div className="md:hidden pb-4 border-t border-white/5 pt-3 space-y-1">
            {links.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors',
                  pathname.startsWith(href)
                    ? 'bg-brand-500/20 text-brand-300'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                )}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            ))}
            <div className="flex gap-2 pt-2 px-4">
              <Link href="/generate" onClick={() => setOpen(false)} className="btn-primary text-sm flex-1 text-center">
                Start Creating
              </Link>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
