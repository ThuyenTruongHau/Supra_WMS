import { z } from 'zod';

export const loginSchema = z.object({
  username: z.string().min(1, 'Vui lòng nhập tài khoản'),
  password: z.string().min(1, 'Vui lòng nhập mật khẩu'),
});

export type LoginRequest = z.infer<typeof loginSchema>;

export interface RoleBrief {
  id: number;
  name: string;
}

export interface AuthTokens {
  access_token: string;
  refresh_token?: string | null;
  token_type?: string;
}

/** Raw login payload from backend */
export interface LoginApiResponse {
  user: User;
  tokens: AuthTokens;
}

/** Normalized shape used by FE login hook / store */
export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  role: string;
  role_canonical: string;
  user: User;
}

export interface RefreshResponse {
  access_token: string;
  token_type?: string;
  refresh_token?: string;
}

export interface User {
  id: number;
  username: string;
  email: string;
  roles: RoleBrief[];
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}

export interface UserListResponse {
  items: User[];
  total: number;
  page: number;
  page_size: number;
}

export interface CreateUserInput {
  username: string;
  email: string;
  password: string;
  password_confirm: string;
  role_ids?: number[];
}

export interface UpdateUserInput {
  email?: string;
  password?: string;
  password_confirm?: string;
  role_ids?: number[];
  is_active?: boolean;
}

/** Temporary role options until BE exposes GET /roles */
export const ROLE_OPTIONS: RoleBrief[] = [
  { id: 1, name: 'admin' },
  { id: 2, name: 'operator' },
];
