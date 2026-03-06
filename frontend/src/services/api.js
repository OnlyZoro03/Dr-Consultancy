import axios from 'axios';
import { auth } from '../firebase';

const api = axios.create({
  baseURL: 'http://localhost:5001/api',
});

// Always get a fresh (auto-refreshed) Firebase token for every request.
// Firebase SDK caches valid tokens and only hits the network when they expire,
// so this is fast and handles the 1-hour expiry transparently.
api.interceptors.request.use(
  async (config) => {
    try {
      const firebaseUser = auth.currentUser;
      if (firebaseUser) {
        // getIdToken() returns cached token if still valid, silently refreshes if expired
        const freshToken = await firebaseUser.getIdToken();
        config.headers.Authorization = `Bearer ${freshToken}`;
        // Keep localStorage in sync so other parts of the app stay current
        localStorage.setItem('token', freshToken);
      } else {
        // Fallback for legacy JWT users (no Firebase session)
        const token = localStorage.getItem('token');
        if (token) config.headers.Authorization = `Bearer ${token}`;
      }
    } catch {
      const token = localStorage.getItem('token');
      if (token) config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// If a 401/403 slips through (e.g. token expired mid-request), force-refresh and retry once.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if ((error.response?.status === 401 || error.response?.status === 403) && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const firebaseUser = auth.currentUser;
        if (firebaseUser) {
          const freshToken = await firebaseUser.getIdToken(true); // force refresh
          localStorage.setItem('token', freshToken);
          originalRequest.headers.Authorization = `Bearer ${freshToken}`;
          return api(originalRequest);
        }
      } catch {
        // Refresh failed — let the original error propagate
      }
    }
    return Promise.reject(error);
  }
);

export default api;
