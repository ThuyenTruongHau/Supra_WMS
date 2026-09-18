import { create } from 'zustand';
import type { UserAccessSummary } from '@/types/auth';

interface AuthState {
  access_token: string | null;
  refresh_token: string | null;
  role_canonical: string | null;
  role: string | null;
  roles: string[];
  access: UserAccessSummary | null;
  username: string | null;
  zone_id: number | null;
  isAuthenticated: boolean;
  setAuth: (
    access_token: string,
    refresh_token: string | null,
    role_canonical: string,
    role: string,
    username: string,
    zone_id: number | null | undefined,
    roles: string[],
    access: UserAccessSummary,
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

function parseStoredAccess(): UserAccessSummary | null {
  try {
    const raw = localStorage.getItem('access_summary');
    if (!raw) return null;
    return JSON.parse(raw) as UserAccessSummary;
  } catch {
    return null;
  }
}

function parseStoredRoles(): string[] {
  try {
    const raw = localStorage.getItem('roles');
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((r): r is string => typeof r === 'string') : [];
  } catch {
    return [];
  }
}

const initialState = () => {
  const legacyRole = localStorage.getItem('role');
  const storedRoles = parseStoredRoles();
  return {
    access_token: localStorage.getItem('access_token'),
    refresh_token: localStorage.getItem('refresh_token'),
    role_canonical: localStorage.getItem('role_canonical'),
    role: legacyRole,
    roles: storedRoles.length > 0 ? storedRoles : legacyRole ? [legacyRole] : [],
    access: parseStoredAccess(),
    username: localStorage.getItem('username'),
    zone_id: readStoredZoneId(),
    isAuthenticated: !!localStorage.getItem('access_token'),
  };
};

export const useAuthStore = create<AuthState>((set) => ({
  ...initialState(),
  setAuth: (access_token, refresh_token, role_canonical, role, username, zone_id, roles, access) => {
    localStorage.setItem('access_token', access_token);
    localStorage.setItem('role_canonical', role_canonical);
    localStorage.setItem('role', role);
    localStorage.setItem('username', username);
    localStorage.setItem('roles', JSON.stringify(roles));
    localStorage.setItem('access_summary', JSON.stringify(access));
    
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
      role_canonical,
      role,
      roles,
      access,
      username,
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
    localStorage.removeItem('role_canonical');
    localStorage.removeItem('role');
    localStorage.removeItem('roles');
    localStorage.removeItem('access_summary');
    localStorage.removeItem('username');
    localStorage.removeItem('zone_id');
    set({
      access_token: null,
      refresh_token: null,
      role_canonical: null,
      role: null,
      roles: [],
      access: null,
      username: null,
      zone_id: null,
      isAuthenticated: false,
    });
  },
}));
