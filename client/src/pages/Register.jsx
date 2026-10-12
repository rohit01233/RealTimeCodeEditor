import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    setLoading(true);
    try {
      await register(form.name, form.email, form.password);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h2 style={styles.title}>Create account</h2>
        <form onSubmit={handleSubmit} style={styles.form}>
          <input style={styles.input} type="text" name="name" placeholder="Your name" value={form.name} onChange={handleChange} required autoFocus />
          <input style={styles.input} type="email" name="email" placeholder="Email" value={form.email} onChange={handleChange} required />
          <input style={styles.input} type="password" name="password" placeholder="Password (min 6 chars)" value={form.password} onChange={handleChange} required />
          {error && <p style={styles.error}>{error}</p>}
          <button style={styles.btn} type="submit" disabled={loading}>
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>
        <p style={styles.link}>
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}

const styles = {
  page: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#1e1e2e', fontFamily: 'sans-serif' },
  card: { background: '#181825', border: '1px solid #313244', borderRadius: 12, padding: '2rem', width: 360 },
  title: { color: '#cdd6f4', marginBottom: '1.5rem', textAlign: 'center', fontWeight: 700, fontSize: 22 },
  form: { display: 'flex', flexDirection: 'column', gap: 12 },
  input: { padding: '10px 14px', borderRadius: 8, border: '1px solid #313244', background: '#1e1e2e', color: '#cdd6f4', fontSize: 14, outline: 'none' },
  btn: { padding: '10px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer', marginTop: 4 },
  error: { color: '#f38ba8', fontSize: 13, margin: 0 },
  link: { textAlign: 'center', marginTop: '1rem', color: '#a6adc8', fontSize: 14 },
};
