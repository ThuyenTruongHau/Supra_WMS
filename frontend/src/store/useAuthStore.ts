import { create } from 'zustand';

interface AuthState {
  access_token: string | null;
  refresh_token: string | null;
  role_canonical: string | null;
  role: string | null;
  username: string | null;
  isAuthenticated: boolean;
  setAuth: (access_token: string, refresh_token: string, role_canonical: string, role: string, username: string) => void;
  setToken: (access_token: string, refresh_token?: string) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  access_token: localStorage.getItem('access_token'),
  refresh_token: localStorage.getItem('refresh_token'),
  role_canonical: localStorage.getItem('role_canonical'),
  role: localStorage.getItem('role'),
  username: localStorage.getItem('username'),
  isAuthenticated: !!localStorage.getItem('access_token'),
  setAuth: (access_token, refresh_token, role_canonical, role, username) => {
    localStorage.setItem('access_token', access_token);
    localStorage.setItem('refresh_token', refresh_token);
    localStorage.setItem('role_canonical', role_canonical);
    localStorage.setItem('role', role);
    localStorage.setItem('username', username);
    set({ access_token, refresh_token, role_canonical, role, username, isAuthenticated: true });
  },
  setToken: (access_token, refresh_token) => {
    localStorage.setItem('access_token', access_token);
    const updates: Partial<AuthState> = { access_token };
    if (refresh_token) {
      localStorage.setItem('refresh_token', refresh_token);
      updates.refresh_token = refresh_token;
    }
    set(updates);
  },
  clearAuth: () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('role_canonical');
    localStorage.removeItem('role');
    localStorage.removeItem('username');
    set({ access_token: null, refresh_token: null, role_canonical: null, role: null, username: null, isAuthenticated: false });
  },
}));

