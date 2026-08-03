import { z } from 'zod';

export const loginSchema = z.object({
  username: z.string().min(1, 'Vui lòng nhập tài khoản'),
  password: z.string().min(1, 'Vui lòng nhập mật khẩu'),
});

export type LoginRequest = z.infer<typeof loginSchema>;

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  role: string;
  role_canonical: string;
}

export interface RefreshResponse {
  access_token: string;
  refresh_token: string;
}

export interface User {
  id: number;
  username: string;
  email: string;
  full_name: string;
  role: string;
  created_at: string;
}
