import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listItemsApi,
  getItemBySkuApi,
  createItemApi,
  updateItemApi,
  deactivateItemApi,
  analyzeItemsApi,
  importItemsApi,
  getItemImportJobApi,
} from "@/api/item";
import {
  Item,
  CreateItemInput,
  UpdateItemInput,
  ItemDetails,
  ItemAnalyzeResponse,
  ItemListParams,
  ItemListResponse,
  ItemImportJobAccepted,
  ItemImportJobStatus,
} from "@/types/item";
import { AxiosError } from "axios";
import { ApiErrorResponse } from "@/types/apiError";

interface UseGetItemsParams {
  zone_id: number;
  q?: string;
  limit?: number;
  enabled?: boolean;
  staleTime?: number;
}

export const useGetItems = (params: UseGetItemsParams) => {
  return useQuery({
    queryKey: ['items', params.zone_id, params.q, params.limit],
    queryFn: async () => {
      return await listItemsApi({
        zone_id: params.zone_id,
        q: params.q,
        limit: params.limit,
      });
    },
    enabled: params.zone_id > 0 && (params.enabled ?? true),
    staleTime: params.staleTime ?? 5 * 60 * 1000,
  });
};

// 1. Hook lấy danh sách (Read)
export const useItems = (params: ItemListParams) => {
  return useQuery<ItemListResponse, Error>({
    queryKey: ["items", params],
    queryFn: () => listItemsApi(params),
    enabled: (params.zone_id ?? 0) > 0,
    staleTime: 5 * 60 * 1000,
  });
};

export const useItemBySku = (sku: string) =>
  useQuery<ItemDetails, Error>({
    queryKey: ["item", sku],
    queryFn: () => getItemBySkuApi(sku),
    enabled: !!sku,
    staleTime: 5 * 60 * 1000,
  });

// 2. Hook tạo mới (Create)
export const useCreateItem = () => {
  const queryClient = useQueryClient();
  return useMutation<Item, AxiosError<ApiErrorResponse>, CreateItemInput>({
    mutationFn: createItemApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["item_analyze"] });
    },
  });
};

// 3. Hook cập nhật (Update)
export const useUpdateItem = () => {
  const queryClient = useQueryClient();
  return useMutation<
    Item,
    AxiosError<ApiErrorResponse>,
    { sku: string; data: UpdateItemInput }
  >({
    mutationFn: ({ sku, data }) => updateItemApi(sku, data),
    onSuccess: (_, { sku }) => {
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["item", sku] });
      queryClient.invalidateQueries({ queryKey: ["item_analyze"] });
    },
  });
};

// 4. Hook xóa (Delete)
export const useDeactivateItem = () => {
  const queryClient = useQueryClient();
  return useMutation<void, AxiosError<ApiErrorResponse>, string>({
    mutationFn: deactivateItemApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["item_analyze"] });
    },
  });
};

export const useItemAnalyze = (zoneId: number) => {
  return useQuery<ItemAnalyzeResponse, Error>({
    queryKey: ["item_analyze", zoneId],
    queryFn: () => analyzeItemsApi(zoneId),
    enabled: zoneId > 0,
    staleTime: 5 * 60 * 1000,
  });
};

const IMPORT_POLL_MS = 1500;

async function runImportWithPolling(
  file: File,
  zoneId: number,
  onProgress?: (job: ItemImportJobStatus) => void,
): Promise<ItemImportJobStatus> {
  const accepted: ItemImportJobAccepted = await importItemsApi(file, zoneId);
  let job = await getItemImportJobApi(accepted.job_id);

  while (job.status === "pending" || job.status === "running") {
    onProgress?.(job);
    await new Promise((resolve) => setTimeout(resolve, IMPORT_POLL_MS));
    job = await getItemImportJobApi(accepted.job_id);
  }

  onProgress?.(job);
  return job;
}

export const useImportItems = () => {
  const queryClient = useQueryClient();
  return useMutation<
    ItemImportJobStatus,
    AxiosError<ApiErrorResponse>,
    { file: File; zoneId: number; onProgress?: (job: ItemImportJobStatus) => void }
  >({
    mutationFn: ({ file, zoneId, onProgress }) =>
      runImportWithPolling(file, zoneId, onProgress),
    onSuccess: (job) => {
      if (job.status === "completed") {
        queryClient.invalidateQueries({ queryKey: ["items"] });
        queryClient.invalidateQueries({ queryKey: ["item_analyze"] });
      }
    },
  });
};
