import { MODULE_ROLE_NAMES, type UserAccessSummary } from '@/types/auth';
import { useAuthStore } from '@/store/useAuthStore';
import { getHomePathForRole } from '@/constants/roles';

const AUTH_API_PATHS = ['/api/v1/auth/login', '/api/v1/auth/refresh', '/api/v1/auth/signup'];

export function isAuthApiUrl(url?: string): boolean {
  if (!url) return false;
  return AUTH_API_PATHS.some((path) => url === path || url.endsWith(path));
}

export function isRefreshApiUrl(url?: string): boolean {
  if (!url) return false;
  return url === '/api/v1/auth/refresh' || url.endsWith('/api/v1/auth/refresh');
}

export function isAdminRole(roles: string[]): boolean {
  return roles.some((role) => {
    const normalized = role.toLowerCase();
    return normalized === 'admin' || normalized === 'a001';
  });
}

export function isStaffRole(roles: string[]): boolean {
  return roles.some((role) =>
    MODULE_ROLE_NAMES.includes(role as (typeof MODULE_ROLE_NAMES)[number]),
  );
}

export function getHomePath(roles: string[]): string {
  if (isAdminRole(roles)) return '/report';
  if (isStaffRole(roles)) return '/qrtablet/import';
  if (roles.some((r) => r.toLowerCase() === 'operator' || r.toLowerCase() === 'o001' || r.toLowerCase() === 'o002')) {
    return '/overview';
  }
  return '/login';
}

export function getHomePathFromAccess(access: UserAccessSummary, roleCanonical?: string | null): string {
  if (access.is_admin) return '/report';
  if (access.modules.length > 0) return '/qrtablet/import';
  if (roleCanonical) return getHomePathForRole(roleCanonical);
  return '/login';
}

export function hasModuleAccess(
  access: UserAccessSummary | null | undefined,
  module: UserAccessSummary['modules'][number],
): boolean {
  if (!access) return false;
  if (access.is_admin) return true;
  return access.modules.includes(module);
}

export function decodeJwtExp(token: string): number | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))) as {
      exp?: number;
    };
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

export function isAccessTokenExpired(token: string | null, skewSeconds = 30): boolean {
  if (!token) return true;
  const exp = decodeJwtExp(token);
  if (exp === null) return false;
  return Date.now() >= (exp - skewSeconds) * 1000;
}

export function forceLogout(): void {
  useAuthStore.getState().clearAuth();
  if (window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
}

export function hasValidRefreshToken(refreshToken: string | null | undefined): boolean {
  return !!refreshToken && refreshToken.trim().length > 0;
}

/** Supports legacy sessions that only stored a single `role` string. */
export function resolveRoles(
  roles: string[],
  fallbackRole: string | null | undefined,
): string[] {
  if (roles.length > 0) return roles;
  return fallbackRole ? [fallbackRole] : [];
}
