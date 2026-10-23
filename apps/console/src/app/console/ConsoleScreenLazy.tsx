'use client';

import dynamic from 'next/dynamic';
import { ScreenLoading } from '@/components/shared/ScreenLoading';

/**
 * The control room carries the road graph (about 10 MB). It is fetched only once the gate has let an operator
 * in, so the sign-in page and every page change stay quick.
 */
export const ConsoleScreenLazy = dynamic(() => import('./ConsoleScreen').then((m) => m.ConsoleScreen), { ssr: false, loading: () => <ScreenLoading full /> });
