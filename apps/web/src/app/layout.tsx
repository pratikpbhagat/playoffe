import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { TopProgressBar } from '@/components/layout/TopProgressBar';
import { ConfirmProvider } from '@/components/ui/ConfirmProvider';
import { ToastProvider } from '@/components/ui/ToastProvider';
import { PermissionProvider } from '@/components/PermissionProvider';
import './globals.css';

const inter = Inter({ variable: '--font-inter', subsets: ['latin'], display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'PLAYOFFE', template: '%s | PLAYOFFE' },
  description: 'Professional tournament management, player network, and venue display.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Warm up the connection to Supabase before the first JS-initiated request */}
        <link rel="preconnect" href={process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''} />
        <link rel="dns-prefetch" href={process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''} />
      </head>
      <body className={`${inter.variable} min-h-screen bg-surface font-sans antialiased`}>
        <TopProgressBar />
        <ConfirmProvider>
          <ToastProvider>
            <PermissionProvider>
              {children}
            </PermissionProvider>
          </ToastProvider>
        </ConfirmProvider>
      </body>
    </html>
  );
}
