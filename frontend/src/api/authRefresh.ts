import axios from 'axios';
import type { RefreshResponse } from '@/types/auth';

const refreshClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || undefined,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});

export async function refreshAccessTokenApi(
  refresh_token: string,
): Promise<RefreshResponse> {
  const { data } = await refreshClient.post<RefreshResponse>(
    '/api/v1/auth/refresh',
    { refresh_token },
  );
  return data;
}
