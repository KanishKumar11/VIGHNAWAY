import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { consoleThemes as themes } from '@vighnaway/tokens';
import { t } from '@/i18n';
import { tokenCss } from '@/lib/theme';
import { themeBootScript } from '@/lib/themeMode';
import { Providers } from './providers';
// Fonts are bundled locally (no Google Fonts request): Inter for UI, JetBrains Mono for readouts.
import '@fontsource-variable/inter';
import '@fontsource-variable/manrope';
import '@fontsource-variable/jetbrains-mono';
import '@fontsource-variable/noto-sans-devanagari';
import './globals.css';

export const metadata: Metadata = {
  title: `${t.app.name} ${t.app.controlRoom}`,
  description: t.app.description,
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: themes.light.shell },
    { media: '(prefers-color-scheme: dark)', color: themes.dark.shell },
  ],
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // data-theme is set before first paint by the boot script (stored choice, else the page default).
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        {/* Token variables from @vighnaway/tokens; static CSS, never user text. */}
        <style>{tokenCss()}</style>
        {/* Runs before first paint: the stored theme, else the page default (lib/themeMode.ts). */}
        <script id="vw-theme">{themeBootScript}</script>
      </head>
      <body className="min-h-dvh bg-shell font-sans text-ink-on-shell antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
