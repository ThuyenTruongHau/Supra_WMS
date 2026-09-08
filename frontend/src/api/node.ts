import axiosInstance from './axiosInstance';
import type { CreateNodeInput, NodeType, UpdateNodeInput, WarehouseNode } from '@/types/node';

export const listNodesApi = async (
  zoneId: number,
  nodeType: NodeType,
  options?: { search?: string; skip?: number; limit?: number },
): Promise<WarehouseNode[]> => {
  const response = await axiosInstance.get<WarehouseNode[]>('/api/v1/nodes/', {
    params: {
      zone_id: zoneId,
      type: nodeType,
      search: options?.search || undefined,
      skip: options?.skip ?? 0,
      limit: options?.limit ?? 200,
    },
  });
  return response.data;
};

export const createNodeApi = async (data: CreateNodeInput): Promise<WarehouseNode> => {
  const response = await axiosInstance.post<WarehouseNode>('/api/v1/nodes/', data);
  return response.data;
};

export const updateNodeApi = async (
  id: number,
  data: UpdateNodeInput,
): Promise<WarehouseNode> => {
  const response = await axiosInstance.patch<WarehouseNode>(`/api/v1/nodes/${id}`, data);
  return response.data;
};

export const deleteNodeApi = async (id: number): Promise<void> => {
  await axiosInstance.delete(`/api/v1/nodes/${id}`);
};
