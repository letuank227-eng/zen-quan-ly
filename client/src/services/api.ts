import axios from 'axios';

const envApiUrl = (import.meta as any).env?.VITE_API_URL;

const api = axios.create({
  baseURL: envApiUrl ? `${envApiUrl.replace(/\/$/, '')}/api` : '/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach Authorization Bearer token if stored in localStorage
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('zen_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response error handler
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !window.location.pathname.startsWith('/login') && !window.location.pathname.startsWith('/register')) {
      localStorage.removeItem('zen_token');
      // Redirect to login on token expiry
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
