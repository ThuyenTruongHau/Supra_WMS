import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { loginApi } from '@/api/auth';
import { useAuthStore } from '@/store/useAuthStore';
import { LoginRequest, LoginResponse, User } from '@/types/auth';
import { getUserApi, deleteUserApi, createUserApi, updateUserApi } from '@/api/auth';
import { AxiosError } from 'axios';
import { ApiErrorResponse } from '@/types/apiError';

export const useLogin = () => {
  const setAuth = useAuthStore((state) => state.setAuth);
  const navigate = useNavigate();

  return useMutation<LoginResponse, Error, LoginRequest>({
    mutationFn: loginApi,
    onSuccess: (data, variables) => {
      setAuth(data.access_token, data.refresh_token, data.role_canonical, data.role, variables.username);
      navigate('/');
    },
  });
};

export const useLogout = () => {
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return () => {
    clearAuth();
    queryClient.clear(); // hoặc queryClient.removeQueries()
    navigate('/login', { replace: true });
  };
};

// 1. Hook lấy danh sách (Read)
export const useUser = () => {
  return useQuery<User[], Error>({
      queryKey: ['user'],
      queryFn: getUserApi,
      staleTime: 5 * 60 * 1000,
  });
};

// 2. Hook tạo mới (Create)
export const useCreateUser = () => {
  const queryClient = useQueryClient();
  return useMutation<User, AxiosError<ApiErrorResponse>, Omit<User, 'id'>>({
      mutationFn: createUserApi,
      onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ['user'] });
      },
  });
};

// 3. Hook cập nhật (Update)
export const useUpdateUser = () => {
  const queryClient = useQueryClient();
  return useMutation<
      Omit<User, 'id'>,
      AxiosError<ApiErrorResponse>,
      { id: number; data: Omit<User, 'id'> }
  >({
      mutationFn: ({ id, data }) => updateUserApi(id, data),
      onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ['user'] });
      },
  });
};

// 4. Hook xóa (Delete)
export const useDeleteUser = () => {
  const queryClient = useQueryClient();
  return useMutation<void, AxiosError<ApiErrorResponse>, number>({
      mutationFn: deleteUserApi,
      onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ['user'] });
      },
  });
};

