import { useEffect, useRef } from 'react';
import { refreshAccessTokenApi } from '@/api/authRefresh';
import { useAuthStore } from '@/store/useAuthStore';
import { SNAPSHOT_MODE } from '@/snapshot/snapshotConfig';
import {
  forceLogout,
  hasValidRefreshToken,
  isAccessTokenExpired,
} from '@/utils/authSession';

/**
 * On app load: if access token is expired, try refresh once or logout.
 */
export function useAuthBootstrap() {
  const ran = useRef(false);

  useEffect(() => {
    if (SNAPSHOT_MODE || ran.current) return;
    ran.current = true;

    const { access_token, refresh_token, isAuthenticated } = useAuthStore.getState();
    if (!isAuthenticated || !access_token) return;

    if (!isAccessTokenExpired(access_token)) return;

    if (!hasValidRefreshToken(refresh_token)) {
      forceLogout();
      return;
    }

    void refreshAccessTokenApi(refresh_token!)
      .then((data) => {
        useAuthStore.getState().setToken(data.access_token, data.refresh_token);
      })
      .catch(() => {
        forceLogout();
      });
  }, []);
}
