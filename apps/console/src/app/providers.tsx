'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'motion/react';
import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { motion as motionTokens } from '@vighnaway/tokens';
import { Toaster } from '@/components/ui/toast';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useLang } from '@/stores/lang';
import { usePrefs } from '@/stores/prefs';

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false }, mutations: { retry: 0 } },
      }),
  );
  // Reduced motion: every motion/react animation becomes an instant state change.
  const reduced = useReducedMotion();
  // Language: the whole tree remounts on a switch, so every string re-reads the new table.
  const lang = useLang((s) => s.lang);
  useEffect(() => {
    useLang.getState().hydrate();
    usePrefs.getState().hydrate();
  }, []);
  return (
    <QueryClientProvider client={client}>
      <MotionConfig
        reducedMotion="user"
        skipAnimations={reduced}
        transition={reduced ? { duration: 0 } : { duration: 0.32, ease: motionTokens.easeOut as [number, number, number, number] }}
      >
        <Fragment key={lang}>
          {children}
          <Toaster />
        </Fragment>
      </MotionConfig>
    </QueryClientProvider>
  );
}
