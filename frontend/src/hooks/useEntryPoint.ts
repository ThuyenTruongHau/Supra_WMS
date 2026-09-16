import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getEntryPointsApi, createEntryPointApi, updateEntryPointStatusApi, deleteEntryPointApi } from '@/api/entryPoint';
import { EntryPoint, CreateEntryPointRequest, EntryPointListParams } from '@/types/entryPoint';
import { AxiosError } from 'axios';
import { ApiErrorResponse } from '@/types/apiError';

export const useGetEntryPoints = (params: EntryPointListParams) => {
    return useQuery<EntryPoint[], Error>({
        queryKey: ['entryPoints', params],
        queryFn: () => getEntryPointsApi(params),
        enabled: !!params.zone_id,
        staleTime: 5 * 60 * 1000,
    });
};

export const useCreateEntryPoint = () => {
    const queryClient = useQueryClient();
    return useMutation<EntryPoint, AxiosError<ApiErrorResponse>, CreateEntryPointRequest>({
        mutationFn: createEntryPointApi,
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['entryPoints'] });
        },
    });
};

export const useUpdateEntryPointStatus = () => {
    const queryClient = useQueryClient();
    return useMutation<EntryPoint, AxiosError<ApiErrorResponse>, { id: number; zone_id: number; is_active: boolean }>({
        mutationFn: ({ id, is_active }) => updateEntryPointStatusApi(id, is_active),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['entryPoints'] });
        },
    });
};

export const useDeleteEntryPoint = () => {
    const queryClient = useQueryClient();
    return useMutation<void, AxiosError<ApiErrorResponse>, { id: number; zone_id: number }>({
        mutationFn: ({ id }) => deleteEntryPointApi(id),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['entryPoints'] });
        },
    });
};
