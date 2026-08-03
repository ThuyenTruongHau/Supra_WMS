import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getZoneApi, deleteZoneApi, createZoneApi, updateZoneApi } from '@/api/zone';
import { Zone } from '@/types/zone';
import { AxiosError } from 'axios';
import { ApiErrorResponse } from '@/types/apiError';

// 1. Hook lấy danh sách (Read)
export const useZone = () => {
    return useQuery<Zone[], Error>({
        queryKey: ['zone'],
        queryFn: getZoneApi,
        staleTime: 5 * 60 * 1000,
    });
};

// 2. Hook tạo mới (Create)
export const useCreateZone = () => {
    const queryClient = useQueryClient();
    return useMutation<Zone, AxiosError<ApiErrorResponse>, Omit<Zone, 'id'>>({
        mutationFn: createZoneApi,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['zone'] });
        },
    });
};

// 3. Hook cập nhật (Update)
export const useUpdateZone = () => {
    const queryClient = useQueryClient();
    return useMutation<
        Omit<Zone, 'id'>,
        AxiosError<ApiErrorResponse>,
        { id: number; data: Omit<Zone, 'id'> }
    >({
        mutationFn: ({ id, data }) => updateZoneApi(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['zone'] });
        },
    });
};

// 4. Hook xóa (Delete)
export const useDeleteZone = () => {
    const queryClient = useQueryClient();
    return useMutation<void, AxiosError<ApiErrorResponse>, number>({
        mutationFn: deleteZoneApi,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['zone'] });
        },
    });
};
