import axios from 'axios';

const API = axios.create({
  // Point this to your Bun/Hono backend
  baseURL: 'https://localhost:5000/api',
});

// Interceptor to attach the JWT token from localStorage to every request
API.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

export default API;