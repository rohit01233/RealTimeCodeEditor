import { useState } from 'react';
import api from '../api/axios';

/**
 * Modal for inviting a user by email to a room.
 * Props:
 *   roomId   - the room to invite into
 *   onClose  - callback to close the modal
 *   onSuccess - callback(message) after a successful invite
 */
export default function InviteModal({ roomId, onClose, onSuccess }) {
  const [email, setEmail]   = useState('');
  const [role,  setRole]    = useState('editor');
  const [error, setError]   = useState('');
  const [busy,  setBusy]    = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setError('');
    try {
      await api.post(`/rooms/${roomId}/invite`, { email: email.trim(), role });
      onSuccess?.(`${email.trim()} invited as ${role} ✓`);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Invite failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    // Backdrop
    <div style={S.backdrop} onClick={onClose}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
        <div style={S.header}>
          <span style={S.title}>Invite collaborator</span>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>

        <form onSubmit={submit} style={S.form}>
          <label style={S.label}>Email address</label>
          <input
            style={S.input}
            type="email"
            placeholder="colleague@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />

          <label style={S.label}>Role</label>
          <div style={S.roleRow}>
            {['editor', 'viewer'].map((r) => (
              <button
                key={r}
                type="button"
                style={{ ...S.roleBtn, ...(role === r ? S.roleBtnActive : {}) }}
                onClick={() => setRole(r)}
              >
                {r === 'editor' ? '✏️ Editor' : '👁 Viewer'}
              </button>
            ))}
          </div>
          <p style={S.roleHint}>
            {role === 'editor'
              ? 'Can read and write in the editor.'
              : 'Can view the editor but cannot type.'}
          </p>

          {error && <p style={S.error}>{error}</p>}

          <button style={S.submitBtn} type="submit" disabled={busy}>
            {busy ? 'Sending…' : 'Send invite'}
          </button>
        </form>
      </div>
    </div>
  );
}

const S = {
  backdrop:    { position: 'fixed', inset: 0, background: '#00000080', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500 },
  modal:       { background: '#1e1e2e', border: '1px solid #313244', borderRadius: 12, width: 380, padding: '1.5rem', boxShadow: '0 8px 32px #00000080' },
  header:      { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' },
  title:       { fontWeight: 700, fontSize: 16, color: '#cdd6f4' },
  closeBtn:    { background: 'none', border: 'none', color: '#585b70', cursor: 'pointer', fontSize: 16, padding: 0 },
  form:        { display: 'flex', flexDirection: 'column', gap: 10 },
  label:       { fontSize: 12, fontWeight: 600, color: '#a6adc8', letterSpacing: '0.04em' },
  input:       { padding: '10px 12px', borderRadius: 8, border: '1px solid #313244', background: '#181825', color: '#cdd6f4', fontSize: 14, outline: 'none' },
  roleRow:     { display: 'flex', gap: 8 },
  roleBtn:     { flex: 1, padding: '8px', borderRadius: 8, border: '1px solid #313244', background: 'none', color: '#a6adc8', cursor: 'pointer', fontSize: 13, fontWeight: 600 },
  roleBtnActive: { border: '1px solid #7c3aed', background: '#7c3aed20', color: '#cba6f7' },
  roleHint:    { fontSize: 11, color: '#585b70', margin: 0 },
  error:       { color: '#f38ba8', fontSize: 12, margin: 0 },
  submitBtn:   { padding: '10px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: 'pointer', marginTop: 4 },
};
