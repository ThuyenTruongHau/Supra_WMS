import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import {
  createNodeApi,
  deleteNodeApi,
  listNodesApi,
  updateNodeApi,
} from '@/api/node';
import type {
  CreateNodeInput,
  NodeType,
  UpdateNodeInput,
  WarehouseNode,
} from '@/types/node';
import { ApiErrorResponse } from '@/types/apiError';

export const nodesQueryKey = (
  warehouseId: number,
  nodeType: NodeType,
  search?: string,
) => ['nodes', warehouseId, nodeType, search ?? ''] as const;

export const useNodes = (
  warehouseId: number,
  nodeType: NodeType,
  options?: { search?: string },
) => {
  return useQuery<WarehouseNode[], AxiosError<ApiErrorResponse>>({
    queryKey: nodesQueryKey(warehouseId, nodeType, options?.search),
    queryFn: () =>
      listNodesApi(warehouseId, nodeType, {
        search: options?.search,
        limit: 200,
      }),
    enabled: warehouseId > 0,
    staleTime: 60 * 1000,
  });
};

const invalidateNodes = (
  queryClient: ReturnType<typeof useQueryClient>,
  warehouseId: number,
  nodeType: NodeType,
) => {
  queryClient.invalidateQueries({ queryKey: ['nodes', warehouseId, nodeType] });
};

export const useCreateNode = () => {
  const queryClient = useQueryClient();
  return useMutation<WarehouseNode, AxiosError<ApiErrorResponse>, CreateNodeInput>({
    mutationFn: createNodeApi,
    onSuccess: (node) => {
      invalidateNodes(queryClient, node.zone_id, node.type as NodeType);
    },
  });
};

export const useUpdateNode = () => {
  const queryClient = useQueryClient();
  return useMutation<
    WarehouseNode,
    AxiosError<ApiErrorResponse>,
    { id: number; data: UpdateNodeInput; warehouseId: number; nodeType: NodeType }
  >({
    mutationFn: ({ id, data }) => updateNodeApi(id, data),
    onSuccess: (node, variables) => {
      invalidateNodes(queryClient, variables.warehouseId, variables.nodeType);
    },
  });
};

export const useDeleteNode = () => {
  const queryClient = useQueryClient();
  return useMutation<
    void,
    AxiosError<ApiErrorResponse>,
    { id: number; warehouseId: number; nodeType: NodeType }
  >({
    mutationFn: ({ id }) => deleteNodeApi(id),
    onSuccess: (_, variables) => {
      invalidateNodes(queryClient, variables.warehouseId, variables.nodeType);
    },
  });
};
