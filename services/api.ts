import axios from 'axios';
import { toast } from 'sonner';

const API_BASE_URL =
  (import.meta as any)?.env?.VITE_API_BASE_URL ||
  '';

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

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const token = localStorage.getItem('token');
      if (token) {
        // Token was present but rejected -> Expired/Invalid
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        
        toast.error("登录已过期，请重新登录");
        
        // Optional: Redirect to login if not already there
        if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
           setTimeout(() => {
               window.location.href = '/login';
           }, 1000);
        }
      }
    }
    return Promise.reject(error);
  }
);

export const sendCode = async (phone: string, scene: 'register' | 'login' = 'login') => {
  const response = await api.post('/api/auth/send-code', { phone, scene });
  return response.data;
};

export const login = async (phone: string, code: string) => {
  const response = await api.post('/api/auth/login', { phone, code });
  console.log('Login response:', response.data);

  // Robust parsing to handle various backend response structures (EchoHub BFF, Legacy, etc.)
  const body = response.data;
  // EchoHub: { code: 'OK', data: { tokens: { accessToken, ... }, user } }
  // Legacy: { code: 0, data: { accessToken, ... } }
  // Fallback: { accessToken, ... }
  const data = body.data || body;

  const accessToken = 
    data.tokens?.accessToken || 
    data.accessToken || 
    body.tokens?.accessToken || 
    body.accessToken;

  const refreshToken = 
    data.tokens?.refreshToken || 
    data.refreshToken || 
    body.tokens?.refreshToken || 
    body.refreshToken;

  if (accessToken) {
    localStorage.setItem('token', accessToken);
    if (refreshToken) {
      localStorage.setItem('refreshToken', refreshToken);
    }
    const user = data.user || body.user;
    if (user) {
      localStorage.setItem('user', JSON.stringify(user));
    }
  } else {
    console.error('Login successful but no access token found in response', response.data);
  }
  return response.data;
};

export const getUserProfile = async () => {
  const response = await api.get('/api/users/me');
  // EchoHub returns: { code: 0, message: "OK", data: { ...user } }
  // We need to return user data directly or adapt based on caller expectation
  return response.data;
};

export default api;
