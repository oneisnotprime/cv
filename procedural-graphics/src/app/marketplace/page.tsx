import type { Metadata } from 'next';
import { PricingCard } from '@/components/Marketplace/PricingCard';
import { PRICING_TIERS } from '@/lib/utils';
import { ShoppingBag, CheckCircle, Zap } from 'lucide-react';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Marketplace & Pricing',
  description: 'Plans for worship teams, YouTubers, and motion designers',
};

const FAQ = [
  {
    q: 'What license comes with the free plan?',
    a: 'Free exports are licensed for personal, non-commercial use only. You can use them in personal projects, but not sell or broadcast them.',
  },
  {
    q: 'Does the Worship plan include ProPresenter templates?',
    a: 'Yes — the Worship plan includes formatted motion packages compatible with ProPresenter 7, EasyWorship, and MediaShout.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Absolutely. You can cancel your subscription at any time and retain access until the end of your billing period.',
  },
  {
    q: 'What video formats do you export?',
    a: 'We export WebM (VP9) which is compatible with all major presentation software and video editors. More formats coming soon.',
  },
  {
    q: 'Do you offer team or church discounts?',
    a: 'Contact us for non-profit and multi-seat pricing. We love supporting churches and ministries.',
  },
];

const INCLUDED_ALGORITHMS = [
  'Navier-Stokes Fluid', 'Magnetic Fields', 'Aurora Borealis', 'Mandelbrot/Julia',
  'Reaction-Diffusion', 'Strange Attractor', 'Boids Flocking', 'N-Body Gravity',
  'Fractal Flame', 'Voronoi Cells', 'Kaleidoscope', 'Flow Field',
  'Crystal Growth', 'DLA Branching', 'Spirograph', 'Plasma Waves',
  'L-System Plants', 'Fourier Epicycles', 'Lissajous Curves', 'Cellular Automata',
  'Wave Interference', 'Particle Systems', 'Gravity Attractor',
];

export default function MarketplacePage() {
  return (
    <div className="min-h-screen py-16 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-brand-500/30 bg-brand-500/10 text-brand-300 text-sm font-medium mb-6">
            <ShoppingBag className="w-3.5 h-3.5" />
            Flexible plans for every creator
          </div>
          <h1 className="text-4xl sm:text-5xl font-display font-bold mb-4">
            Simple, <span className="gradient-text">transparent pricing</span>
          </h1>
          <p className="text-white/40 max-w-xl mx-auto text-lg">
            Start free. Upgrade when you need 4K exports, motion video, or worship broadcast licenses.
          </p>
        </div>

        {/* Pricing grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-20">
          {PRICING_TIERS.map((tier) => (
            <PricingCard key={tier.id} tier={tier} />
          ))}
        </div>

        {/* Algorithm list */}
        <div className="card p-8 mb-16">
          <div className="flex items-center gap-3 mb-6">
            <Zap className="w-5 h-5 text-brand-400" />
            <h2 className="text-lg font-bold">All 23 algorithms included in Creator & Worship</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {INCLUDED_ALGORITHMS.map((a) => (
              <div key={a} className="flex items-center gap-2 text-sm text-white/60">
                <CheckCircle className="w-3.5 h-3.5 text-brand-500 flex-shrink-0" />
                {a}
              </div>
            ))}
          </div>
        </div>

        {/* FAQ */}
        <div className="mb-16">
          <h2 className="text-2xl font-display font-bold text-center mb-8">
            Frequently Asked Questions
          </h2>
          <div className="max-w-3xl mx-auto space-y-4">
            {FAQ.map(({ q, a }) => (
              <div key={q} className="card p-5">
                <h3 className="font-semibold text-white mb-2">{q}</h3>
                <p className="text-white/50 text-sm leading-relaxed">{a}</p>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="text-center py-16 relative">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_50%,rgba(60,100,250,0.1),transparent_70%)]" />
          <h2 className="text-2xl sm:text-3xl font-display font-bold mb-4 relative">
            Ready to start creating?
          </h2>
          <p className="text-white/40 mb-6 relative">No credit card required for the free plan.</p>
          <Link href="/generate" className="btn-primary text-base px-8 py-3.5 inline-flex items-center gap-2 relative">
            Open the Generator
          </Link>
        </div>
      </div>
    </div>
  );
}
