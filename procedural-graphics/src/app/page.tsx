import Link from 'next/link';
import { ArrowRight, Sparkles, Zap, Globe, Music, Youtube, CheckCircle } from 'lucide-react';
import { PRICING_TIERS } from '@/lib/utils';
import { PricingCard } from '@/components/Marketplace/PricingCard';

const FEATURES = [
  {
    icon: Zap,
    title: '23 Unique Algorithms',
    description:
      'From Navier-Stokes fluid dynamics and magnetic field lines to Fourier epicycles, reaction-diffusion, and aurora simulations.',
  },
  {
    icon: Sparkles,
    title: 'AI Prompt Generation',
    description:
      'Describe what you want in plain English. Our Claude-powered AI maps your prompt to the perfect algorithm and parameters.',
  },
  {
    icon: Globe,
    title: 'Real-Time Rendering',
    description:
      'See changes instantly as you tweak parameters. Every slider, every palette swap renders live in your browser.',
  },
];

const USE_CASES = [
  {
    icon: Music,
    title: 'Worship Teams',
    description: 'Create stunning motion backgrounds and still graphics for ProPresenter, EasyWorship, and Planning Center.',
    examples: ['Aurora Borealis loop', 'Sacred geometry mandala', 'Holy Spirit fluid flow', 'Kaleidoscope worship'],
    badge: 'Worship license included',
    color: 'from-purple-600 to-brand-600',
  },
  {
    icon: Youtube,
    title: 'YouTubers & Streamers',
    description: 'Unique animated backgrounds, channel art, thumbnails, and overlays that stand out from the crowd.',
    examples: ['Particle vortex loop', 'Fractal zoom intro', 'Boids flocking overlay', 'Plasma background'],
    badge: 'Commercial license',
    color: 'from-red-600 to-orange-600',
  },
  {
    icon: Globe,
    title: 'Motion Designers',
    description: 'Export 4K PNG and WebM sequences. Integrate into After Effects, DaVinci Resolve, or any NLE.',
    examples: ['Reaction-diffusion texture', 'Strange attractor loop', 'Crystal growth timelapse', 'DLA lightning'],
    badge: 'Broadcast quality',
    color: 'from-cyan-600 to-blue-600',
  },
];

const ALGORITHM_SHOWCASE = [
  { name: 'Fluid Dynamics', desc: 'Navier-Stokes', color: '#0099cc' },
  { name: 'Aurora Borealis', desc: 'Atmospheric', color: '#00916e' },
  { name: 'Mandelbrot Set', desc: 'Fractal', color: '#c4007b' },
  { name: 'Reaction-Diffusion', desc: 'Gray-Scott', color: '#ff6b35' },
  { name: 'Voronoi Cells', desc: 'Geometric', color: '#6088ff' },
  { name: 'Strange Attractor', desc: 'Chaos Theory', color: '#ffd700' },
  { name: 'Boids Flocking', desc: 'Emergence', color: '#61d095' },
  { name: 'Fractal Flame', desc: 'IFS', color: '#ff4500' },
];

export default function HomePage() {
  return (
    <div className="overflow-x-hidden">
      {/* Hero */}
      <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-surface-950 via-[#0d0826] to-surface-950" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_60%_20%,rgba(60,40,150,0.4),transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_80%,rgba(0,150,100,0.2),transparent_60%)]" />

        {/* Animated dots grid */}
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(100,88,255,0.4) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />

        <div className="relative z-10 text-center max-w-5xl mx-auto px-4 py-20">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-brand-500/30 bg-brand-500/10 text-brand-300 text-sm font-medium mb-8">
            <Sparkles className="w-3.5 h-3.5" />
            23 procedural algorithms · AI-powered · Real-time
          </div>

          <h1 className="text-5xl sm:text-6xl md:text-7xl font-display font-bold leading-tight text-balance mb-6">
            Generate Stunning{' '}
            <span className="gradient-text">Procedural Graphics</span>{' '}
            in Seconds
          </h1>

          <p className="text-white/50 text-lg sm:text-xl max-w-2xl mx-auto mb-10 text-balance leading-relaxed">
            Type a prompt. Watch AI transform your words into living, breathing procedural art.
            Fluid dynamics, fractals, aurora, particle fields, and 19 more algorithms at your fingertips.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/generate" className="btn-primary text-base px-8 py-3.5 inline-flex items-center gap-2 justify-center">
              Start Generating Free
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link href="/gallery" className="btn-secondary text-base px-8 py-3.5 inline-flex items-center gap-2 justify-center">
              View Gallery
            </Link>
          </div>

          {/* Social proof */}
          <p className="text-white/25 text-sm mt-8">
            No account required to start · Export up to 5 free graphics monthly
          </p>
        </div>
      </section>

      {/* Algorithm showcase */}
      <section className="py-16 px-4 border-t border-white/5">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-wrap gap-3 justify-center">
            {ALGORITHM_SHOWCASE.map((a) => (
              <div
                key={a.name}
                className="flex items-center gap-2 px-4 py-2 rounded-full glass text-sm"
              >
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: a.color }} />
                <span className="text-white/70 font-medium">{a.name}</span>
                <span className="text-white/30 text-xs">{a.desc}</span>
              </div>
            ))}
            <div className="flex items-center gap-2 px-4 py-2 rounded-full glass text-sm">
              <span className="text-white/40">+15 more</span>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-24 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-display font-bold mb-4">
              Everything you need to create{' '}
              <span className="gradient-text">unique graphics</span>
            </h2>
            <p className="text-white/40 max-w-xl mx-auto">
              Professional-grade procedural generation, made accessible through natural language.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {FEATURES.map(({ icon: Icon, title, description }) => (
              <div key={title} className="card p-6">
                <div className="w-10 h-10 rounded-xl bg-brand-500/20 border border-brand-500/30 flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5 text-brand-400" />
                </div>
                <h3 className="text-white font-semibold text-lg mb-2">{title}</h3>
                <p className="text-white/45 text-sm leading-relaxed">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Use cases */}
      <section className="py-24 px-4 bg-surface-900/50 border-y border-white/5">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-display font-bold mb-4">
              Made for <span className="gradient-text">creators like you</span>
            </h2>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {USE_CASES.map(({ icon: Icon, title, description, examples, badge, color }) => (
              <div key={title} className="card p-6 flex flex-col gap-4">
                <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center shadow-lg`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-white font-bold text-lg">{title}</h3>
                    <span className="badge bg-brand-500/20 text-brand-300 border border-brand-500/20">
                      {badge}
                    </span>
                  </div>
                  <p className="text-white/45 text-sm leading-relaxed">{description}</p>
                </div>
                <ul className="space-y-1.5">
                  {examples.map((ex) => (
                    <li key={ex} className="flex items-center gap-2 text-sm text-white/50">
                      <CheckCircle className="w-3.5 h-3.5 text-brand-500 flex-shrink-0" />
                      {ex}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-24 px-4" id="pricing">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-display font-bold mb-4">
              Simple, <span className="gradient-text">transparent pricing</span>
            </h2>
            <p className="text-white/40">Start free, upgrade when you need more.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {PRICING_TIERS.map((tier) => (
              <PricingCard key={tier.id} tier={tier} />
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_50%,rgba(60,100,250,0.15),transparent_70%)]" />
        <div className="relative max-w-2xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-display font-bold mb-4">
            Ready to create something{' '}
            <span className="gradient-text">extraordinary?</span>
          </h2>
          <p className="text-white/40 mb-8">
            No credit card required. Start generating immediately.
          </p>
          <Link href="/generate" className="btn-primary text-base px-10 py-4 inline-flex items-center gap-2">
            Open the Generator
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}
