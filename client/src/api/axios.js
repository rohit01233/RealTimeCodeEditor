import axios from 'axios';

const BASE_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:5000';

const api = axios.create({
  baseURL: `${BASE_URL}/api`,
  withCredentials: true,
});

// Attach access token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Attempt a token refresh on 401; retry the original request once
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const refreshToken = localStorage.getItem('refreshToken');
        if (!refreshToken) throw new Error('No refresh token');

        const { data } = await axios.post(`${BASE_URL}/api/auth/refresh`, {
          refreshToken,
        });
        localStorage.setItem('accessToken', data.accessToken);
        original.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(original);
      } catch {
        // Refresh failed — clear storage; AuthContext will redirect to login
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
