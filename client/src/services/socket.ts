import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;
type SocketCallback = (...args: any[]) => void;
const eventListeners: Map<string, Set<SocketCallback>> = new Map();

export function getSocket(): Socket | null {
  return socket;
}

/**
 * Robust event subscriber that guarantees callbacks are attached
 * whether the socket connects before, during, or after subscription.
 */
export function onSocketEvent(event: string, callback: SocketCallback): () => void {
  if (!eventListeners.has(event)) {
    eventListeners.set(event, new Set());
  }
  eventListeners.get(event)!.add(callback);

  if (socket) {
    socket.on(event, callback);
  }

  return () => {
    eventListeners.get(event)?.delete(callback);
    if (socket) {
      socket.off(event, callback);
    }
  };
}

export function connectSocket(token: string): Socket | null {
  if (socket && socket.connected) {
    return socket;
  }

  const envSocketUrl = (import.meta as any).env?.VITE_API_URL;
  // On Vercel serverless domains without a dedicated WS host, skip persistent WS connection (polling handles updates)
  if (!envSocketUrl && typeof window !== 'undefined' && window.location.hostname.endsWith('.vercel.app')) {
    return null;
  }

  socket = io(envSocketUrl || window.location.origin, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 20,
    reconnectionDelay: 1000,
  });

  const bindListeners = () => {
    eventListeners.forEach((callbacks, event) => {
      callbacks.forEach((cb) => {
        socket?.off(event, cb);
        socket?.on(event, cb);
      });
    });
  };

  socket.on('connect', () => {
    console.log('[Socket] Connected to realtime gateway');
    bindListeners();
  });

  socket.on('disconnect', () => {
    console.log('[Socket] Disconnected from realtime gateway');
  });

  socket.on('connect_error', (err) => {
    console.warn('[Socket] Connection error:', err.message);
  });

  // Attach any listeners registered so far
  bindListeners();

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
