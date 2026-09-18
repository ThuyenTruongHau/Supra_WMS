import { create } from 'zustand';
import type { User } from '@/types/auth';

interface AuthState {
  access_token: string | null;
  refresh_token: string | null;
  user: User | null;
  zone_id: number | null;
  isAuthenticated: boolean;
  setAuth: (
    access_token: string,
    refresh_token: string | null,
    user: User,
    zone_id?: number | null,
  ) => void;
  setToken: (access_token: string, refresh_token?: string) => void;
  clearAuth: () => void;
}


function readStoredZoneId(): number | null {
  const raw = localStorage.getItem('zone_id');
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseStoredUser(): User | null {
  try {
    const raw = localStorage.getItem('user_data');
    if (!raw) return null;
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

const initialState = () => {
  return {
    access_token: localStorage.getItem('access_token'),
    refresh_token: localStorage.getItem('refresh_token'),
    user: parseStoredUser(),
    zone_id: readStoredZoneId(),
    isAuthenticated: !!localStorage.getItem('access_token'),
  };
};

export const useAuthStore = create<AuthState>((set) => ({
  ...initialState(),
  setAuth: (access_token, refresh_token, user, zone_id) => {
    localStorage.setItem('access_token', access_token);
    localStorage.setItem('user_data', JSON.stringify(user));
    
    // Clean up legacy keys
    localStorage.removeItem('role_canonical');
    localStorage.removeItem('role');
    localStorage.removeItem('roles');
    localStorage.removeItem('access_summary');
    localStorage.removeItem('username');
    
    if (zone_id != null && zone_id > 0) {
      localStorage.setItem('zone_id', String(zone_id));
    } else {
      localStorage.removeItem('zone_id');
    }

    if (refresh_token) {
      localStorage.setItem('refresh_token', refresh_token);
    } else {
      localStorage.removeItem('refresh_token');
    }
    
    set({
      access_token,
      refresh_token: refresh_token ?? null,
      user,
      zone_id: zone_id != null && zone_id > 0 ? zone_id : null,
      isAuthenticated: true,
    });
  },
  setToken: (access_token, refresh_token) => {
    localStorage.setItem('access_token', access_token);
    const updates: Partial<AuthState> = {
      access_token,
      isAuthenticated: !!access_token,
    };
    if (refresh_token) {
      localStorage.setItem('refresh_token', refresh_token);
      updates.refresh_token = refresh_token;
    }
    set(updates);
  },
  clearAuth: () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user_data');
    localStorage.removeItem('zone_id');

    // Clean up legacy keys just in case
    localStorage.removeItem('role_canonical');
    localStorage.removeItem('role');
    localStorage.removeItem('roles');
    localStorage.removeItem('access_summary');
    localStorage.removeItem('username');
    
    set({
      access_token: null,
      refresh_token: null,
      user: null,
      zone_id: null,
      isAuthenticated: false,
    });
  },
}));
