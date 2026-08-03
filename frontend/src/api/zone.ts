import axiosInstance from './axiosInstance';
import { Zone } from '@/types/zone';

export const getZoneApi = async (): Promise<Zone[]> => {
    const response = await axiosInstance.get<Zone[]>('/api/v1/zones/');
    return response.data;
};
export const updateZoneApi = async (id: number, data: Omit<Zone, 'id'>): Promise<Omit<Zone, 'id'>> => {
    const response = await axiosInstance.patch<Omit<Zone, 'id'>>(`/api/v1/zones/${id}`, data);
    return response.data;
};
export const createZoneApi = async (data: Omit<Zone, 'id'>): Promise<Zone> => {
    const response = await axiosInstance.post<Zone>('/api/v1/zones/', data);
    return response.data;
};
export const deleteZoneApi = async (id: number): Promise<void> => {
    await axiosInstance.delete(`/api/v1/zones/${id}`);
}