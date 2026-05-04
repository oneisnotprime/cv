'use client';

import { Check, Zap } from 'lucide-react';
import { PricingTier } from '@/engine/types';
import { formatPrice, cn } from '@/lib/utils';
import { useState } from 'react';

interface PricingCardProps {
  tier: PricingTier;
}

export function PricingCard({ tier }: PricingCardProps) {
  const [loading, setLoading] = useState(false);

  const handleCheckout = async () => {
    if (tier.price === 0 || !tier.stripeId) return;
    setLoading(true);
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId: tier.stripeId }),
      });
      const { url } = await res.json();
      if (url) window.location.href = url;
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={cn(
        'relative rounded-2xl p-6 border flex flex-col gap-6 transition-all duration-300',
        tier.popular
          ? 'border-brand-500/60 bg-brand-500/10 shadow-xl shadow-brand-500/10'
          : 'border-white/10 bg-white/3 hover:border-white/20 hover:bg-white/5'
      )}
    >
      {tier.popular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="flex items-center gap-1 px-3 py-1 rounded-full bg-brand-500 text-white text-xs font-semibold shadow-lg">
            <Zap className="w-3 h-3" />
            Most Popular
          </span>
        </div>
      )}

      <div>
        <h3 className="text-white font-bold text-lg">{tier.name}</h3>
        <div className="flex items-baseline gap-1 mt-2">
          {tier.price === 0 ? (
            <span className="text-3xl font-display font-bold text-white">Free</span>
          ) : (
            <>
              <span className="text-3xl font-display font-bold text-white">
                {formatPrice(tier.price)}
              </span>
              <span className="text-white/40 text-sm">/{tier.interval}</span>
            </>
          )}
        </div>
      </div>

      <ul className="space-y-2.5 flex-1">
        {tier.features.map((f) => (
          <li key={f} className="flex items-start gap-2.5">
            <Check className="w-4 h-4 text-brand-400 flex-shrink-0 mt-0.5" />
            <span className="text-white/70 text-sm leading-snug">{f}</span>
          </li>
        ))}
      </ul>

      <button
        onClick={handleCheckout}
        disabled={loading}
        className={cn(
          'w-full py-3 rounded-xl font-semibold text-sm transition-all',
          tier.popular
            ? 'btn-primary'
            : tier.price === 0
            ? 'btn-secondary'
            : 'btn-secondary hover:border-brand-500/40'
        )}
      >
        {loading ? 'Loading…' : tier.price === 0 ? 'Get Started Free' : `Start ${tier.name} Plan`}
      </button>
    </div>
  );
}
