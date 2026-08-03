import axiosInstance from './axiosInstance';
import { EntryPoint, CreateEntryPointRequest } from '@/types/entryPoint';

export const getEntryPointsApi = async (zone_id?: number, code?: string): Promise<EntryPoint[]> => {
    const params: Record<string, any> = {};
    if (zone_id) params.zone_id = zone_id;
    if (code) params.code = code;
    const response = await axiosInstance.get<EntryPoint[]>('/api/v1/start-points', { params });
    return response.data;
};

export const createEntryPointApi = async (data: CreateEntryPointRequest): Promise<EntryPoint> => {
    const response = await axiosInstance.post<EntryPoint>('/api/v1/start-points', data);
    return response.data;
};

export const updateEntryPointStatusApi = async (id: number, is_active: boolean): Promise<EntryPoint> => {
    const response = await axiosInstance.patch<EntryPoint>(`/api/v1/start-points/${id}`, { is_active });
    return response.data;
};

export const deleteEntryPointApi = async (id: number): Promise<void> => {
    const response = await axiosInstance.delete(`/api/v1/start-points/${id}`, { data: { reason: 'no_reason_now' } });
    return response.data;
};
