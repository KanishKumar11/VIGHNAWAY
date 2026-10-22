import { create } from 'zustand';

export type NetStatus = 'unknown' | 'online' | 'offline';
export type SocketStatus = 'idle' | 'connecting' | 'live' | 'unreachable';

interface ConnectionState {
  net: NetStatus;
  socket: SocketStatus;
  lastError: string | null;
  setNet: (n: NetStatus) => void;
  setSocket: (s: SocketStatus, error?: string | null) => void;
}

export const useConnection = create<ConnectionState>()((set) => ({
  net: 'unknown',
  socket: 'idle',
  lastError: null,
  setNet: (net) => set({ net }),
  setSocket: (socket, error = null) => set({ socket, lastError: error }),
}));

/** 'live' only when the network is up and the socket has resynced. */
export function connectionMode(net: NetStatus, socket: SocketStatus): 'live' | 'offline' | 'unreachable' | 'connecting' {
  if (net === 'offline') return 'offline';
  if (socket === 'live') return 'live';
  if (socket === 'unreachable') return 'unreachable';
  return 'connecting';
}
