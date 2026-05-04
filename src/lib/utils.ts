import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { PricingTier } from '@/engine/types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b) resolve(b);
      else reject(new Error('toBlob returned null'));
    }, 'image/png');
  });
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export const PRICING_TIERS: PricingTier[] = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    interval: 'month',
    features: [
      '5 exports per month',
      'PNG format only',
      '1080p resolution',
      'Personal use license',
      'Access to 10 algorithms',
    ],
    stripeId: '',
  },
  {
    id: 'creator',
    name: 'Creator',
    price: 1200,
    interval: 'month',
    features: [
      'Unlimited exports',
      'PNG + WebM video',
      '4K resolution',
      'Commercial use license',
      'All 23 algorithms',
      'Prompt AI generation',
      'Save unlimited presets',
      'Priority generation',
    ],
    stripeId: 'price_creator_monthly',
    popular: true,
  },
  {
    id: 'worship',
    name: 'Worship',
    price: 2900,
    interval: 'month',
    features: [
      'Everything in Creator',
      'Worship broadcast license',
      'ProPresenter / EasyWorship export',
      'Motion background packages',
      'Bulk generation (50 at once)',
      'Custom palette saving',
      'Team sharing (5 seats)',
      'Priority support',
    ],
    stripeId: 'price_worship_monthly',
  },
];

export function truncate(s: string, max: number) {
  return s.length > max ? s.slice(0, max) + '…' : s;
}

export function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
}
