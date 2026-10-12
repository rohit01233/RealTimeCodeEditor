import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { javascript } from '@codemirror/lang-javascript';
import { yCollab } from 'y-codemirror.next';
import { useAuth } from '../context/AuthContext';
import { useCollabSocket } from '../socket/useCollabSocket';
import InviteModal from '../components/InviteModal';
import api from '../api/axios';

// ── Constants ────────────────────────────────────────────────────────────────
const ROLE_META = {
  owner:  { label: 'Owner',  bg: '#7c3aed', canEdit: true,  canInvite: true,  canDelete: true  },
  editor: { label: 'Editor', bg: '#059669', canEdit: true,  canInvite: false, canDelete: false },
  viewer: { label: 'Viewer', bg: '#6b7280', canEdit: false, canInvite: false, canDelete: false },
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function Room() {
  const { roomId }  = useParams();
  const navigate    = useNavigate();
  const { user, accessToken } = useAuth();

  const editorContainerRef = useRef(null);
  const editorViewRef      = useRef(null);

  const [roomName,      setRoomName]      = useState('');
  const [role,          setRole]          = useState(null);
  const [connected,     setConnected]     = useState(false);
  const [participants,  setParticipants]  = useState(new Map());
  const [toast,         setToast]         = useState(null);
  const [showInvite,    setShowInvite]    = useState(false);
  const [showSettings,  setShowSettings]  = useState(false);
  const [deletingRoom,  setDeletingRoom]  = useState(false);

  const roleMeta = role ? ROLE_META[role] : {};

  // ── Stable userInfo for socket hook ──────────────────────────────────────
  const userInfo = useMemo(
    () => (user ? { id: user._id, name: user.name } : null),
    [user?._id, user?.name]
  );

  // ── Toast helper ──────────────────────────────────────────────────────────
  const showToast = useCallback((msg, color = '#a6e3a1') => {
    setToast({ msg, color });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // ── Fetch room metadata ───────────────────────────────────────────────────
  useEffect(() => {
    api.get(`/rooms/${roomId}`)
      .then(({ data }) => setRoomName(data.room.name))
      .catch(() => navigate('/'));
  }, [roomId, navigate]);

  // ── Copy room link ────────────────────────────────────────────────────────
  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href)
      .then(() => showToast('Link copied to clipboard ✓'))
      .catch(() => showToast('Could not copy link', '#f38ba8'));
  };

  // ── Delete room ───────────────────────────────────────────────────────────
  const deleteRoom = async () => {
    if (!window.confirm(`Delete "${roomName}"? This cannot be undone.`)) return;
    setDeletingRoom(true);
    try {
      await api.delete(`/rooms/${roomId}`);
      navigate('/');
    } catch (err) {
      showToast(err.response?.data?.error || 'Delete failed', '#f38ba8');
      setDeletingRoom(false);
    }
  };

  // ── onReady: called once per mount when socket joins and Y.Doc is ready ──
  const handleReady = useCallback(
    ({ ydoc, awareness, socket, role: userRole }) => {
      setRole(userRole);
      setConnected(true);

      const ytext      = ydoc.getText('codemirror');
      const isReadOnly = userRole === 'viewer';

      // ── Participants from awareness ────────────────────────────────────
      const syncParticipants = () => {
        const next = new Map();
        awareness.getStates().forEach((state, clientId) => {
          if (!state?.user) return;
          next.set(clientId, { ...state.user, isLocal: clientId === awareness.clientID });
        });
        setParticipants(next);
      };

      awareness.on('change', ({ added, removed }) => {
        syncParticipants();
        added.forEach((cid) => {
          if (cid === awareness.clientID) return;
          const s = awareness.getStates().get(cid);
          if (s?.user) showToast(`${s.user.name} joined`, s.user.color);
        });
        if (removed.length) showToast('A collaborator left', '#f38ba8');
      });

      socket.on('user-joined', (u) => showToast(`${u.name} joined`, '#a6e3a1'));
      socket.on('user-left',   (u) => showToast(`${u.name} left`,   '#f38ba8'));
      syncParticipants();

      // ── Mount CodeMirror ───────────────────────────────────────────────
      editorViewRef.current?.destroy();

      const extensions = [
        basicSetup,
        javascript(),
        yCollab(ytext, awareness),
        EditorView.editable.of(!isReadOnly),
        // Second line of defence: suppress all input events for viewers
        ...(isReadOnly ? [EditorView.contentAttributes.of({ 'aria-readonly': 'true' })] : []),
        editorTheme,
        cursorStyles,
      ];

      editorViewRef.current = new EditorView({
        state: EditorState.create({ doc: ytext.toString(), extensions }),
        parent: editorContainerRef.current,
      });
    },
    [showToast]
  );

  useCollabSocket({ roomId, token: accessToken, userInfo, onReady: handleReady });

  useEffect(() => () => editorViewRef.current?.destroy(), []);

  const participantList = [...participants.values()];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={S.page}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header style={S.header}>
        <div style={S.headerLeft}>
          <button onClick={() => navigate('/')} style={S.iconBtn} title="Back to rooms">←</button>
          <span style={S.roomName}>{roomName || '…'}</span>
          {roleMeta.label && (
            <span style={{ ...S.roleBadge, background: roleMeta.bg }}>{roleMeta.label}</span>
          )}
        </div>

        <div style={S.headerRight}>
          {/* Connection indicator */}
          <span style={S.statusDot(connected)} title={connected ? 'Connected' : 'Connecting…'} />
          <span style={S.statusText}>{connected ? 'Live' : 'Connecting…'}</span>

          {/* Copy-link button — available to everyone */}
          <button style={S.actionBtn} onClick={copyLink} title="Copy room link">
            🔗 Share
          </button>

          {/* Invite — owner only */}
          {roleMeta.canInvite && (
            <button style={{ ...S.actionBtn, ...S.actionBtnPrimary }} onClick={() => setShowInvite(true)}>
              + Invite
            </button>
          )}

          {/* Settings — owner only */}
          {roleMeta.canDelete && (
            <button
              style={{ ...S.iconBtn, color: showSettings ? '#cba6f7' : '#585b70' }}
              onClick={() => setShowSettings((s) => !s)}
              title="Room settings"
            >
              ⚙
            </button>
          )}
        </div>
      </header>

      {/* ── Body ───────────────────────────────────────────────────────── */}
      <div style={S.body}>

        {/* Editor */}
        <div ref={editorContainerRef} style={S.editor} />

        {/* ── Sidebar ────────────────────────────────────────────────── */}
        <aside style={S.sidebar}>

          {/* ── Settings panel (owner only) ─────────────────────────── */}
          {showSettings && roleMeta.canDelete && (
            <div style={S.settingsPanel}>
              <p style={S.sidebarTitle}>Room Settings</p>
              <button
                style={S.dangerBtn}
                onClick={deleteRoom}
                disabled={deletingRoom}
              >
                {deletingRoom ? 'Deleting…' : '🗑 Delete Room'}
              </button>
              <p style={S.settingsHint}>Deletes all room data permanently.</p>
            </div>
          )}

          {/* ── Collaborators list ──────────────────────────────────── */}
          <p style={S.sidebarTitle}>
            Collaborators
            <span style={S.countBadge}>{participantList.length}</span>
          </p>

          <div style={S.participantList}>
            {participantList.length === 0 && (
              <p style={S.emptyMsg}>Just you — share the link!</p>
            )}
            {participantList.map((p, i) => (
              <div key={i} style={S.participant}>
                <div style={{ ...S.avatar, background: p.color, color: '#1e1e2e' }}>
                  {(p.name || '?')[0].toUpperCase()}
                </div>
                <span style={S.participantName} title={p.name}>
                  {p.name}
                  {p.isLocal && <span style={S.youBadge}>you</span>}
                </span>
                <div style={{ ...S.colorDot, background: p.color }} />
              </div>
            ))}
          </div>
        </aside>
      </div>

      {/* ── Viewer read-only banner ─────────────────────────────────────── */}
      {role === 'viewer' && (
        <div style={S.viewerBanner}>
          👁&nbsp; <strong>View-only mode</strong> — contact the room owner to request editor access
        </div>
      )}

      {/* ── Invite modal ───────────────────────────────────────────────── */}
      {showInvite && (
        <InviteModal
          roomId={roomId}
          onClose={() => setShowInvite(false)}
          onSuccess={(msg) => showToast(msg, '#a6e3a1')}
        />
      )}

      {/* ── Toast ──────────────────────────────────────────────────────── */}
      {toast && (
        <div style={{ ...S.toast, borderLeftColor: toast.color }}>{toast.msg}</div>
      )}
    </div>
  );
}

// ── CodeMirror extensions ────────────────────────────────────────────────────

const editorTheme = EditorView.theme({
  '&':                   { height: '100%', fontSize: '14px', background: '#1e1e2e' },
  '.cm-content':         { caretColor: '#cdd6f4', color: '#cdd6f4', padding: '8px 0' },
  '.cm-gutters':         { background: '#181825', borderRight: '1px solid #313244', color: '#585b70' },
  '.cm-activeLineGutter':{ background: '#313244' },
  '.cm-activeLine':      { background: '#31324440' },
  '.cm-selectionBackground': { background: '#7c3aed40' },
  '.cm-scroller':        { fontFamily: '"JetBrains Mono","Fira Code",Consolas,monospace', overflow: 'auto' },
  '&.cm-focused':        { outline: 'none' },
  '.cm-cursor':          { borderLeftColor: '#cdd6f4' },
});

const cursorStyles = EditorView.baseTheme({
  '.cm-ySelectionInfo': {
    opacity: 1,
    fontFamily: 'sans-serif',
    fontSize: '11px',
    fontWeight: 700,
    padding: '1px 6px',
    borderRadius: '4px 4px 4px 0',
    color: '#1e1e2e',
    whiteSpace: 'nowrap',
    userSelect: 'none',
    pointerEvents: 'none',
    zIndex: 999,
  },
  '.cm-ySelection': { opacity: 0.3 },
});

// ── Styles ───────────────────────────────────────────────────────────────────
const S = {
  page:          { display: 'flex', flexDirection: 'column', height: '100vh', background: '#1e1e2e', color: '#cdd6f4', fontFamily: 'sans-serif', overflow: 'hidden' },
  header:        { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', height: 48, background: '#181825', borderBottom: '1px solid #313244', flexShrink: 0, gap: 8 },
  headerLeft:    { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 },
  headerRight:   { display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 },
  iconBtn:       { background: 'none', border: 'none', color: '#cdd6f4', cursor: 'pointer', fontSize: 16, padding: '4px 6px', borderRadius: 6 },
  roomName:      { fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 200 },
  roleBadge:     { fontSize: 10, padding: '2px 7px', borderRadius: 12, color: '#fff', fontWeight: 700, flexShrink: 0 },
  statusDot: (ok) => ({ width: 7, height: 7, borderRadius: '50%', background: ok ? '#a6e3a1' : '#f9e2af', display: 'inline-block', flexShrink: 0 }),
  statusText:    { fontSize: 11, color: '#a6adc8' },
  actionBtn:     { padding: '5px 12px', background: '#313244', color: '#cdd6f4', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' },
  actionBtnPrimary: { background: '#7c3aed', color: '#fff' },
  body:          { display: 'flex', flex: 1, overflow: 'hidden' },
  editor:        { flex: 1, overflow: 'hidden' },
  sidebar:       { width: 210, background: '#181825', borderLeft: '1px solid #313244', display: 'flex', flexDirection: 'column', padding: '14px 0 0', flexShrink: 0, overflowY: 'auto' },
  settingsPanel: { borderBottom: '1px solid #313244', paddingBottom: 14, marginBottom: 10 },
  sidebarTitle:  { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#585b70', margin: '0 12px 10px', display: 'flex', alignItems: 'center', gap: 6 },
  countBadge:    { background: '#313244', color: '#cdd6f4', borderRadius: 10, padding: '0 6px', fontSize: 10, fontWeight: 700 },
  participantList: { display: 'flex', flexDirection: 'column', gap: 2, flex: 1 },
  participant:   { display: 'flex', alignItems: 'center', gap: 8, padding: '5px 12px', borderRadius: 4 },
  avatar:        { width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0 },
  participantName: { fontSize: 12, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: 4 },
  youBadge:      { fontSize: 9, background: '#313244', color: '#a6adc8', borderRadius: 4, padding: '1px 4px', fontWeight: 600, flexShrink: 0 },
  colorDot:      { width: 6, height: 6, borderRadius: '50%', flexShrink: 0 },
  dangerBtn:     { margin: '0 12px', padding: '7px 12px', background: '#f38ba820', color: '#f38ba8', border: '1px solid #f38ba840', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600, width: 'calc(100% - 24px)' },
  settingsHint:  { fontSize: 11, color: '#585b70', margin: '6px 12px 0' },
  emptyMsg:      { fontSize: 12, color: '#585b70', padding: '4px 12px' },
  viewerBanner:  { background: '#31324480', color: '#f9e2af', padding: '6px 1rem', fontSize: 12, textAlign: 'center', flexShrink: 0, borderTop: '1px solid #313244' },
  toast:         { position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: '#313244', color: '#cdd6f4', padding: '8px 16px', borderRadius: 8, fontSize: 13, borderLeft: '3px solid #a6e3a1', boxShadow: '0 4px 16px #00000080', zIndex: 1000, whiteSpace: 'nowrap' },
};
