import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { LanguageProvider } from '@/lib/LanguageContext';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Crowd Civic AI Verification',
  description: 'Crowd Civic AI Verification and Resolution System with role-based dashboards.',
  openGraph: {
    title: 'Crowd Civic AI Verification',
    description: 'Crowd Civic AI Verification and Resolution System with role-based dashboards.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Crowd Civic AI Verification',
    description: 'Crowd Civic AI Verification and Resolution System with role-based dashboards.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body suppressHydrationWarning className="font-sans antialiased bg-[#F4F8FD] text-[#13345D]">
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
