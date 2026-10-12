import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import * as Y from 'yjs';
import { Awareness, encodeAwarenessUpdate, applyAwarenessUpdate } from 'y-protocols/awareness.js';

const SOCKET_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:5000';

// Deterministic color palette (Catppuccin Mocha)
const USER_COLORS = [
  { color: '#cba6f7', light: '#cba6f730' }, // Mauve
  { color: '#a6e3a1', light: '#a6e3a130' }, // Green
  { color: '#fab387', light: '#fab38730' }, // Peach
  { color: '#f38ba8', light: '#f38ba830' }, // Red
  { color: '#89b4fa', light: '#89b4fa30' }, // Blue
  { color: '#f5c2e7', light: '#f5c2e730' }, // Pink
  { color: '#94e2d5', light: '#94e2d530' }, // Teal
  { color: '#f9e2af', light: '#f9e2af30' }, // Yellow
  { color: '#b4befe', light: '#b4befe30' }, // Lavender
];

export const getUserColor = (uid = '') => {
  const idx = [...uid].reduce((acc, c) => acc + c.charCodeAt(0), 0) % USER_COLORS.length;
  return USER_COLORS[idx];
};

/**
 * Custom hook that manages:
 *  - socket.io connection with JWT auth
 *  - Y.Doc creation and hydration from server state
 *  - Yjs awareness sync (cursor positions, user metadata)
 *  - Bidirectional doc-update relay
 *  - Clean teardown on unmount
 *
 * @param {string}   roomId   - Room to join
 * @param {string}   token    - JWT access token
 * @param {object}   userInfo - { id, name } — written into awareness local state
 * @param {Function} onReady  - Called with { ydoc, awareness, socket, role }
 */
export function useCollabSocket({ roomId, token, userInfo, onReady }) {
  // Stable ref for onReady — prevents reconnect on parent re-renders
  const onReadyRef = useRef(onReady);
  useEffect(() => { onReadyRef.current = onReady; }, [onReady]);

  useEffect(() => {
    if (!roomId || !token || !userInfo) return;

    // ── Y.Doc + Awareness ────────────────────────────────────────────────
    const ydoc = new Y.Doc();
    const awareness = new Awareness(ydoc);

    // Assign this user a deterministic color so it stays stable across refreshes
    const { color, light } = getUserColor(userInfo.id);
    awareness.setLocalStateField('user', {
      name: userInfo.name,
      color,
      colorLight: light,
    });

    // ── Socket connection ────────────────────────────────────────────────
    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket'],
    });

    socket.on('connect_error', (err) => {
      console.error('[socket] connect error:', err.message);
    });

    socket.on('connect', () => {
      // ── Join room ──────────────────────────────────────────────────
      socket.emit('join-room', { roomId }, ({ state, role, error }) => {
        if (error) {
          console.error('[socket] join-room error:', error);
          return;
        }

        // Hydrate Y.Doc before calling onReady
        if (state && state.length > 0) {
          Y.applyUpdate(ydoc, new Uint8Array(state), 'server-init');
        }

        onReadyRef.current?.({ ydoc, awareness, socket, role });
      });
    });

    // ── doc-update ─────────────────────────────────────────────────────
    // Incoming remote Yjs updates → apply tagged 'remote' to skip re-emit
    socket.on('doc-update', (update) => {
      Y.applyUpdate(ydoc, new Uint8Array(update), 'remote');
    });

    // Local doc changes (not remote/server-init) → emit to server
    const docUpdateHandler = (update, origin) => {
      if (origin === 'remote' || origin === 'server-init') return;
      socket.emit('doc-update', Array.from(update));
    };
    ydoc.on('update', docUpdateHandler);

    // ── awareness-update ────────────────────────────────────────────────
    // Outgoing: encode changed clients and send binary frame
    const awarenessUpdateHandler = ({ added, updated, removed }) => {
      const changedClients = [...added, ...updated, ...removed];
      const update = encodeAwarenessUpdate(awareness, changedClients);
      socket.emit('awareness-update', Array.from(update));
    };
    awareness.on('update', awarenessUpdateHandler);

    // Incoming: decode and apply binary frame from other clients
    socket.on('awareness-update', (update) => {
      applyAwarenessUpdate(awareness, new Uint8Array(update), 'remote');
    });

    // ── Cleanup ─────────────────────────────────────────────────────────
    return () => {
      ydoc.off('update', docUpdateHandler);
      awareness.off('update', awarenessUpdateHandler);
      // Tell peers this client is gone before disconnecting
      awareness.setLocalState(null);
      socket.disconnect();
      awareness.destroy();
      ydoc.destroy();
    };
  }, [roomId, token, userInfo?.id]); // re-run only on room/token/user change
}
