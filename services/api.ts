import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/v1';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const sendCode = async (phone: string, scene: 'register' | 'login' = 'login') => {
  const response = await api.post('/auth/send-code', { phone, scene });
  return response.data;
};

export const login = async (phone: string, code: string) => {
  const response = await api.post('/auth/login', { phone, code });
  if (response.data.data.tokens) {
    localStorage.setItem('token', response.data.data.tokens.accessToken);
    localStorage.setItem('refreshToken', response.data.data.tokens.refreshToken);
    localStorage.setItem('user', JSON.stringify(response.data.data.user));
  }
  return response.data;
};

export const getUserProfile = async () => {
  const response = await api.get('/users/me');
  return response.data;
};

export default api;
