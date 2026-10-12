import { createContext, useContext, useState, useCallback } from 'react';
import api from '../api/axios';

const AuthContext = createContext(null);

const loadFromStorage = () => {
  try {
    return {
      user: JSON.parse(localStorage.getItem('user')) || null,
      accessToken: localStorage.getItem('accessToken') || null,
      refreshToken: localStorage.getItem('refreshToken') || null,
    };
  } catch {
    return { user: null, accessToken: null, refreshToken: null };
  }
};

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState(loadFromStorage);

  const persist = (user, accessToken, refreshToken) => {
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    setAuth({ user, accessToken, refreshToken });
  };

  const register = useCallback(async (name, email, password) => {
    const { data } = await api.post('/auth/register', { name, email, password });
    persist(data.user, data.accessToken, data.refreshToken);
    return data.user;
  }, []);

  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    persist(data.user, data.accessToken, data.refreshToken);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('user');
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    setAuth({ user: null, accessToken: null, refreshToken: null });
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user: auth.user,
        accessToken: auth.accessToken,
        isAuthenticated: !!auth.user,
        register,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
};
