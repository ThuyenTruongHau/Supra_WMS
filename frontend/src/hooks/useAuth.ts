import { getHomePathForRole, isAdminRole } from '@/constants/roles';
import { useAppStore } from '@/store/useAppStore';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  loginApi,
  getUsersApi,
  deleteUserApi,
  createUserApi,
  updateUserApi,
} from '@/api/auth';
import { useAuthStore } from '@/store/useAuthStore';
import { SNAPSHOT_MODE } from '@/snapshot/snapshotConfig';
import { getHomePathFromAccess } from '@/utils/authSession';
import type {
  CreateUserInput,
  LoginRequest,
  LoginResponse,
  UpdateUserInput,
  User,
  UserListResponse,
} from '@/types/auth';
import { AxiosError } from 'axios';
import { ApiErrorResponse } from '@/types/apiError';

export const useLogin = () => {
  const setAuth = useAuthStore((state) => state.setAuth);
  const navigate = useNavigate();

  return useMutation<LoginResponse, Error, LoginRequest>({
    mutationFn: loginApi,
    onSuccess: (data, variables) => {
      const roles = data.roles.length > 0
        ? data.roles
        : data.user.roles?.map((r) => r.name) ?? [];
      setAuth(
        data.access_token,
        data.refresh_token,
        data.role_canonical,
        data.role,
        variables.username,
        roles,
        data.user.access,
      );
      navigate(getHomePathFromAccess(data.user.access));
    },
  });
};

export const useLogout = () => {
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return () => {
    if (SNAPSHOT_MODE) {
      navigate('/report', { replace: true });
      return;
    }
    clearAuth();
    queryClient.clear();
    navigate('/login', { replace: true });
  };
};

export const useUser = () => {
  return useQuery<User[], Error>({
    queryKey: ['user'],
    queryFn: async () => {
      const data: UserListResponse = await getUsersApi({ page_size: 100 });
      return data.items;
    },
    staleTime: 5 * 60 * 1000,
  });
};

export const useCreateUser = () => {
  const queryClient = useQueryClient();
  return useMutation<User, AxiosError<ApiErrorResponse>, CreateUserInput>({
    mutationFn: createUserApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user'] });
    },
  });
};

export const useUpdateUser = () => {
  const queryClient = useQueryClient();
  return useMutation<
    User,
    AxiosError<ApiErrorResponse>,
    { id: number; data: UpdateUserInput }
  >({
    mutationFn: ({ id, data }) => updateUserApi(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user'] });
    },
  });
};

export const useDeleteUser = () => {
  const queryClient = useQueryClient();
  return useMutation<void, AxiosError<ApiErrorResponse>, number>({
    mutationFn: deleteUserApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user'] });
    },
  });
};
