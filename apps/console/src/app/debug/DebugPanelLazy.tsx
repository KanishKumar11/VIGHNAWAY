'use client';

import dynamic from 'next/dynamic';
import { ScreenLoading } from '@/components/shared/ScreenLoading';

/** The engine-parity panel needs the road graph; it loads after the gate, not with the page. */
export const DebugPanelLazy = dynamic(() => import('./DebugPanel').then((m) => m.DebugPanel), { ssr: false, loading: () => <ScreenLoading /> });
