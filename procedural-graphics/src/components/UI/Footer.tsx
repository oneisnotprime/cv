import Link from 'next/link';
import { Sparkles, Github, Twitter } from 'lucide-react';

export function Footer() {
  return (
    <footer className="border-t border-white/5 bg-surface-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="md:col-span-2">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center">
                <Sparkles className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="font-bold text-base gradient-text">Procedural</span>
            </div>
            <p className="text-white/40 text-sm leading-relaxed max-w-xs">
              Generate stunning procedural graphics powered by 23 mathematical algorithms
              and AI prompt interpretation. Built for worship teams, YouTubers, and
              creative professionals.
            </p>
            <div className="flex gap-3 mt-4">
              <a href="#" className="p-2 rounded-lg hover:bg-white/5 text-white/30 hover:text-white/60 transition-colors">
                <Twitter className="w-4 h-4" />
              </a>
              <a href="#" className="p-2 rounded-lg hover:bg-white/5 text-white/30 hover:text-white/60 transition-colors">
                <Github className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Links */}
          <div>
            <h4 className="text-white/80 text-sm font-semibold mb-3">Platform</h4>
            <ul className="space-y-2">
              {['Generate', 'Gallery', 'Marketplace', 'Pricing'].map((l) => (
                <li key={l}>
                  <Link
                    href={`/${l.toLowerCase()}`}
                    className="text-white/40 hover:text-white/70 text-sm transition-colors"
                  >
                    {l}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-white/80 text-sm font-semibold mb-3">Algorithms</h4>
            <ul className="space-y-2">
              {['Fluid Dynamics', 'Aurora', 'Fractals', 'Reaction-Diffusion', 'N-Body Gravity'].map((a) => (
                <li key={a}>
                  <Link
                    href="/generate"
                    className="text-white/40 hover:text-white/70 text-sm transition-colors"
                  >
                    {a}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-white/30 text-sm">
            &copy; {new Date().getFullYear()} Procedural. All rights reserved.
          </p>
          <div className="flex gap-4">
            {['Privacy', 'Terms', 'Licenses'].map((l) => (
              <Link key={l} href="#" className="text-white/30 hover:text-white/60 text-sm transition-colors">
                {l}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
