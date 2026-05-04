import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import '@/styles/globals.css';
import { Navbar } from '@/components/UI/Navbar';
import { Footer } from '@/components/UI/Footer';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Procedural — AI Generative Art Platform',
    template: '%s | Procedural',
  },
  description:
    'Generate stunning procedural graphics using 23 algorithms: fluid dynamics, fractals, aurora, and more. Perfect for worship teams, YouTubers, and content creators.',
  keywords: [
    'procedural graphics',
    'generative art',
    'worship backgrounds',
    'motion graphics',
    'fractal art',
    'fluid simulation',
    'aurora generator',
  ],
  openGraph: {
    type: 'website',
    title: 'Procedural — AI Generative Art Platform',
    description: 'Generate stunning procedural graphics with real-time AI prompts',
    siteName: 'Procedural',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} scroll-smooth`}>
      <body className="min-h-screen flex flex-col bg-surface-950">
        <Navbar />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
