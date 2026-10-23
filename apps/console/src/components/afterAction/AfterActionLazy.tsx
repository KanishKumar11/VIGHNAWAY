'use client';

import dynamic from 'next/dynamic';
import { ScreenLoading } from '@/components/shared/ScreenLoading';

/** The after-action summary replays the demo trip on the road graph; it loads after the gate, not with the page. */
export const AfterActionLazy = dynamic(() => import('./AfterActionContent').then((m) => m.AfterActionContent), { ssr: false, loading: () => <ScreenLoading full /> });
