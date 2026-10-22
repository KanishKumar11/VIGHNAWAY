import { useEffect, useRef, useState } from 'react';
import type { LatLng } from '@vighnaway/contracts';
import { GEOCODER_URL } from '@/config/env';
import { useConnection } from '@/stores/connection';
import { searchOnline, type OnlinePlace } from './onlineSearch';

export type OnlineStatus = 'idle' | 'loading' | 'ready' | 'offline' | 'error';
export interface OnlineState {
  status: OnlineStatus;
  places: OnlinePlace[];
}

/** Wait this long after the last keystroke before asking the server, so typing does not fire a request per letter. */
export const SEARCH_DEBOUNCE_MS = 350;
export const MIN_QUERY = 2;
const CACHE_MAX = 40;
const IDLE: OnlineState = { status: 'idle', places: [] };

/** Rounded the way the request rounds it, so a small map move still hits the cache. */
const biasKey = (b: LatLng | null) => (b ? `${b.lat.toFixed(1)},${b.lng.toFixed(1)}` : '-');

/**
 * Live place search for what is being typed: debounced, one request in flight (a newer one cancels
 * the older), results cached per text and area. `offline` and `error` leave `places` empty so the
 * sheet falls back to the built-in places and says why.
 */
export function useOnlineSearch(query: string, bias: LatLng | null, enabled = true, fetcher: typeof searchOnline = searchOnline): OnlineState {
  const [state, setState] = useState<OnlineState>(IDLE);
  const cache = useRef(new Map<string, OnlinePlace[]>());
  const q = query.trim();
  const key = `${q.toLowerCase()}|${biasKey(bias)}`;
  const biasRef = useRef(bias);
  biasRef.current = bias;

  useEffect(() => {
    if (!enabled || !GEOCODER_URL || q.length < MIN_QUERY) {
      setState(IDLE);
      return;
    }
    const hit = cache.current.get(key);
    if (hit) {
      setState({ status: 'ready', places: hit });
      return;
    }
    if (useConnection.getState().net === 'offline') {
      setState({ status: 'offline', places: [] });
      return;
    }
    // Keep showing the last answer while the next one loads, so the list does not flash empty.
    setState((s) => ({ status: 'loading', places: s.places }));
    const abort = new AbortController();
    const timer = setTimeout(() => {
      fetcher(q, biasRef.current, abort.signal)
        .then((places) => {
          if (abort.signal.aborted) return;
          if (cache.current.size >= CACHE_MAX) cache.current.delete(cache.current.keys().next().value as string);
          cache.current.set(key, places);
          setState({ status: 'ready', places });
        })
        .catch(() => {
          if (!abort.signal.aborted) setState({ status: 'error', places: [] });
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [q, key, enabled, fetcher]);

  return state;
}
