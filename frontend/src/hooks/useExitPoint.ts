import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getExitPointsApi,
  getExitPointApi,
  createExitPointApi,
  updateExitPointApi,
  deleteExitPointApi,
} from '@/api/exitPoint'
import type {
  ExitPoint,
  ExitPointListParams,
  CreateExitPointRequest,
  UpdateExitPointRequest,
} from '@/types/exitPoint'
import { AxiosError } from 'axios'
import type { ApiErrorResponse } from '@/types/apiError'

export const useGetExitPoints = (params: ExitPointListParams = {}) => {
  return useQuery<ExitPoint[], Error>({
    queryKey: ['exitPoints', params],
    queryFn: () => getExitPointsApi(params),
    enabled: (params.zone_id ?? 0) > 0 || params.available_only === true,
    staleTime: 5 * 60 * 1000,
  })
}

export const useGetExitPoint = (id?: number) => {
  return useQuery<ExitPoint, Error>({
    queryKey: ['exitPoint', id],
    queryFn: () => getExitPointApi(id!),
    enabled: !!id && id > 0,
    staleTime: 5 * 60 * 1000,
  })
}

export const useCreateExitPoint = () => {
  const queryClient = useQueryClient()
  return useMutation<ExitPoint, AxiosError<ApiErrorResponse>, CreateExitPointRequest>({
    mutationFn: createExitPointApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exitPoints'] })
    },
  })
}

export const useUpdateExitPoint = () => {
  const queryClient = useQueryClient()
  return useMutation<
    ExitPoint,
    AxiosError<ApiErrorResponse>,
    { id: number; data: UpdateExitPointRequest }
  >({
    mutationFn: ({ id, data }) => updateExitPointApi(id, data),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['exitPoints'] })
      queryClient.invalidateQueries({ queryKey: ['exitPoint', result.id] })
    },
  })
}

/** Shortcut: chỉ cập nhật is_active */
export const useUpdateExitPointStatus = () => {
  const queryClient = useQueryClient()
  return useMutation<
    ExitPoint,
    AxiosError<ApiErrorResponse>,
    { id: number; is_active: boolean }
  >({
    mutationFn: ({ id, is_active }) => updateExitPointApi(id, { is_active }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['exitPoints'] })
      queryClient.invalidateQueries({ queryKey: ['exitPoint', result.id] })
    },
  })
}

export const useDeleteExitPoint = () => {
  const queryClient = useQueryClient()
  return useMutation<void, AxiosError<ApiErrorResponse>, number>({
    mutationFn: deleteExitPointApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exitPoints'] })
    },
  })
}
