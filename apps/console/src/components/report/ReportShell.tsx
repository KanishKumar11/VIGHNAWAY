'use client';

import { useEffect, type ReactNode } from 'react';
import { royalCssVariables } from '@/lib/theme';
import { useTheme } from '@/stores/theme';

/**
 * The /report page in the phone app's look: its "Royal blue" colours, rounder corners and Manrope, set as
 * variables on this wrapper only (the sign-in page does the same), so the form reads like the app's report screen.
 */
export function ReportShell({ children }: { children: ReactNode }) {
  const theme = useTheme((s) => s.theme);
  useEffect(() => useTheme.getState().hydrate(), []);
  return (
    <div style={{ ...royalCssVariables(theme), fontFamily: 'var(--vw-font-web)' }} className="min-h-dvh bg-shell text-ink">
      {children}
    </div>
  );
}
