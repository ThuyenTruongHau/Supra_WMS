import axiosInstance from './axiosInstance';
import { LoginRequest, LoginResponse, RefreshResponse, User } from '@/types/auth';

export const loginApi = async (data: LoginRequest): Promise<LoginResponse> => {
  const response = await axiosInstance.post<LoginResponse>('/api/v1/auth/login', data);
  return response.data;
};

export const refreshApi = async (refresh_token: string): Promise<RefreshResponse> => {
  const response = await axiosInstance.post<RefreshResponse>('/api/v1/auth/refresh', { refresh_token });
  return response.data;
};

export const getUserApi = async (): Promise<User[]> => {
  const response = await axiosInstance.get<User[]>('/api/v1/auth/all');
  return response.data;
};
export const updateUserApi = async (id: number, data: Omit<User, 'id'>): Promise<Omit<User, 'id'>> => {
  const response = await axiosInstance.patch<Omit<User, 'id'>>(`/api/v1/auth/${id}`, data);
  return response.data;
};
export const createUserApi = async (data: Omit<User, 'id'>): Promise<User> => {
  const response = await axiosInstance.post<User>('/api/v1/auth/signup', data);
  return response.data;
};
export const deleteUserApi = async (id: number): Promise<void> => {
  await axiosInstance.delete(`/api/v1/auth/${id}`);
}