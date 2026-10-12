import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';

const ROLE_META = {
  owner:  { label: 'Owner',  color: '#cba6f7' },
  editor: { label: 'Editor', color: '#a6e3a1' },
  viewer: { label: 'Viewer', color: '#a6adc8' },
};

export default function Home() {
  const { user, logout, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [rooms,        setRooms]        = useState([]);
  const [newRoomName,  setNewRoomName]  = useState('');
  const [creating,     setCreating]     = useState(false);
  const [loading,      setLoading]      = useState(true);
  const [deleteId,     setDeleteId]     = useState(null);   // room being deleted

  // ── Fetch user's rooms ────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) return;
    api.get('/rooms')
      .then(({ data }) => setRooms(data.rooms))
      .finally(() => setLoading(false));
  }, [isAuthenticated]);

  // ── Derive my role in a room ──────────────────────────────────────────────
  const myRoleIn = (room) => {
    const member = room.members?.find((m) => {
      const id = m.userId?._id ?? m.userId;
      return id?.toString() === user?._id?.toString();
    });
    return member?.role ?? 'viewer';
  };

  // ── Create room ───────────────────────────────────────────────────────────
  const createRoom = async (e) => {
    e.preventDefault();
    if (!newRoomName.trim()) return;
    setCreating(true);
    try {
      const { data } = await api.post('/rooms', { name: newRoomName.trim() });
      setRooms((prev) => [data.room, ...prev]);
      setNewRoomName('');
      navigate(`/room/${data.room._id}`);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create room');
    } finally {
      setCreating(false);
    }
  };

  // ── Delete room (owner) ───────────────────────────────────────────────────
  const deleteRoom = async (room) => {
    if (!window.confirm(`Delete "${room.name}"? This cannot be undone.`)) return;
    setDeleteId(room._id);
    try {
      await api.delete(`/rooms/${room._id}`);
      setRooms((prev) => prev.filter((r) => r._id !== room._id));
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete room');
    } finally {
      setDeleteId(null);
    }
  };

  // ── Landing (unauthenticated) ─────────────────────────────────────────────
  if (!isAuthenticated) {
    return (
      <div style={S.page}>
        <div style={S.hero}>
          <div style={S.heroIcon}>⚡</div>
          <h1 style={S.heroTitle}>Collab Editor</h1>
          <p style={S.heroSub}>
            Real-time collaborative code editing — Google Docs for code.<br />
            Powered by CRDTs (Yjs) for conflict-free merging.
          </p>
          <div style={S.heroBtns}>
            <button style={S.btnPrimary} onClick={() => navigate('/register')}>Get started free</button>
            <button style={S.btnSecondary} onClick={() => navigate('/login')}>Sign in</button>
          </div>
          <div style={S.features}>
            {[
              ['🔄', 'Real-time sync',   'CRDT-based — no conflicts, ever'],
              ['🖱',  'Live cursors',     'See exactly where collaborators are'],
              ['🔒', 'Role permissions', 'Owner, Editor, Viewer — fully enforced'],
              ['📜', 'Version history',  'Auto-saved snapshots, instant restore'],
            ].map(([icon, title, desc]) => (
              <div key={title} style={S.featureCard}>
                <span style={S.featureIcon}>{icon}</span>
                <strong style={S.featureTitle}>{title}</strong>
                <span style={S.featureDesc}>{desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Dashboard (authenticated) ─────────────────────────────────────────────
  return (
    <div style={S.page}>
      {/* Header */}
      <header style={S.header}>
        <span style={S.logo}>⚡ Collab Editor</span>
        <div style={S.headerRight}>
          <div style={S.userChip}>
            <div style={S.userAvatar}>{user.name[0].toUpperCase()}</div>
            <span style={S.userName}>{user.name}</span>
          </div>
          <button style={S.btnSecondary} onClick={logout}>Logout</button>
        </div>
      </header>

      <main style={S.main}>
        <div style={S.mainHeader}>
          <h2 style={S.sectionTitle}>Your Rooms</h2>
          <span style={S.roomCount}>{rooms.length} room{rooms.length !== 1 ? 's' : ''}</span>
        </div>

        {/* Create room */}
        <form onSubmit={createRoom} style={S.createForm}>
          <input
            style={S.input}
            placeholder="New room name…"
            value={newRoomName}
            onChange={(e) => setNewRoomName(e.target.value)}
            maxLength={100}
          />
          <button style={S.btnPrimary} type="submit" disabled={creating || !newRoomName.trim()}>
            {creating ? 'Creating…' : '+ New Room'}
          </button>
        </form>

        {/* Room list */}
        {loading ? (
          <div style={S.emptyState}>Loading rooms…</div>
        ) : rooms.length === 0 ? (
          <div style={S.emptyState}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>🚀</div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>No rooms yet</div>
            <div style={{ color: '#585b70', fontSize: 13 }}>Create one above to start collaborating</div>
          </div>
        ) : (
          <div style={S.roomGrid}>
            {rooms.map((room) => {
              const myRole = myRoleIn(room);
              const roleMeta = ROLE_META[myRole] ?? ROLE_META.viewer;
              const isOwner = myRole === 'owner';
              return (
                <div key={room._id} style={S.roomCard}>
                  {/* Main clickable area */}
                  <div style={S.roomCardBody} onClick={() => navigate(`/room/${room._id}`)}>
                    <div style={S.roomCardTop}>
                      <span style={S.roomCardName}>{room.name}</span>
                      <span style={{ ...S.roleChip, color: roleMeta.color }}>
                        {roleMeta.label}
                      </span>
                    </div>
                    <div style={S.roomCardMeta}>
                      <span>👥 {room.members?.length ?? 1} member{room.members?.length !== 1 ? 's' : ''}</span>
                      <span>{new Date(room.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>

                  {/* Owner actions */}
                  <div style={S.roomCardActions}>
                    <button
                      style={S.roomActionBtn}
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/room/${room._id}`);
                      }}
                      title="Copy link"
                    >
                      🔗
                    </button>
                    {isOwner && (
                      <button
                        style={{ ...S.roomActionBtn, color: '#f38ba8' }}
                        onClick={(e) => { e.stopPropagation(); deleteRoom(room); }}
                        disabled={deleteId === room._id}
                        title="Delete room"
                      >
                        {deleteId === room._id ? '…' : '🗑'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────
const S = {
  page:          { minHeight: '100vh', background: '#1e1e2e', color: '#cdd6f4', fontFamily: 'sans-serif' },
  // Landing
  hero:          { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: 14, textAlign: 'center', padding: '2rem' },
  heroIcon:      { fontSize: 52, lineHeight: 1 },
  heroTitle:     { fontSize: 42, fontWeight: 800, margin: 0, letterSpacing: '-0.02em' },
  heroSub:       { color: '#a6adc8', fontSize: 16, maxWidth: 420, lineHeight: 1.6, margin: 0 },
  heroBtns:      { display: 'flex', gap: 12 },
  features:      { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginTop: 20, maxWidth: 480, width: '100%' },
  featureCard:   { background: '#181825', border: '1px solid #313244', borderRadius: 10, padding: '14px', display: 'flex', flexDirection: 'column', gap: 4, textAlign: 'left' },
  featureIcon:   { fontSize: 22 },
  featureTitle:  { fontSize: 13, fontWeight: 700, color: '#cdd6f4' },
  featureDesc:   { fontSize: 12, color: '#a6adc8' },
  // Dashboard
  header:        { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2rem', height: 56, background: '#181825', borderBottom: '1px solid #313244', position: 'sticky', top: 0, zIndex: 10 },
  logo:          { fontWeight: 800, fontSize: 17, letterSpacing: '-0.01em' },
  headerRight:   { display: 'flex', alignItems: 'center', gap: 12 },
  userChip:      { display: 'flex', alignItems: 'center', gap: 8 },
  userAvatar:    { width: 30, height: 30, borderRadius: '50%', background: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff' },
  userName:      { fontSize: 13, color: '#a6adc8' },
  main:          { maxWidth: 780, margin: '0 auto', padding: '2rem 1rem' },
  mainHeader:    { display: 'flex', alignItems: 'center', gap: 10, marginBottom: '1.25rem' },
  sectionTitle:  { fontWeight: 700, fontSize: 20, margin: 0 },
  roomCount:     { fontSize: 12, color: '#585b70', background: '#313244', padding: '2px 8px', borderRadius: 10 },
  createForm:    { display: 'flex', gap: 10, marginBottom: '1.5rem' },
  input:         { flex: 1, padding: '10px 14px', borderRadius: 8, border: '1px solid #313244', background: '#181825', color: '#cdd6f4', fontSize: 14, outline: 'none' },
  btnPrimary:    { padding: '10px 18px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 14, whiteSpace: 'nowrap' },
  btnSecondary:  { padding: '8px 14px', background: 'none', color: '#cdd6f4', border: '1px solid #313244', borderRadius: 8, cursor: 'pointer', fontSize: 13 },
  emptyState:    { textAlign: 'center', padding: '3rem 1rem', color: '#a6adc8' },
  roomGrid:      { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 },
  roomCard:      { background: '#181825', border: '1px solid #313244', borderRadius: 10, overflow: 'hidden', transition: 'border-color 0.15s', cursor: 'default' },
  roomCardBody:  { padding: '14px', cursor: 'pointer' },
  roomCardTop:   { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 6 },
  roomCardName:  { fontWeight: 600, fontSize: 14, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  roleChip:      { fontSize: 10, fontWeight: 700, flexShrink: 0 },
  roomCardMeta:  { display: 'flex', justifyContent: 'space-between', color: '#585b70', fontSize: 11 },
  roomCardActions: { display: 'flex', borderTop: '1px solid #313244' },
  roomActionBtn: { flex: 1, padding: '8px', background: 'none', border: 'none', color: '#585b70', cursor: 'pointer', fontSize: 14 },
};
