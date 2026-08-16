import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listItemsApi,
  getItemByIdApi,
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
import { LIVE_QUERY_OPTIONS } from "@/utils/liveQueryOptions";

interface UseGetItemsParams {
  warehouse_id: number;
  q?: string;
  page?: number;
  page_size?: number;
  /** @deprecated use page_size */
  limit?: number;
  enabled?: boolean;
}

export const useGetItems = (params: UseGetItemsParams) => {
  const page = params.page ?? 1;
  const page_size = params.page_size ?? params.limit ?? 20;

  return useQuery({
    queryKey: ["items", params.warehouse_id, params.q, page, page_size],
    queryFn: async () => {
      return await listItemsApi({
        warehouse_id: params.warehouse_id,
        q: params.q,
        page,
        page_size,
      });
    },
    enabled: params.warehouse_id > 0 && (params.enabled ?? true),
    ...LIVE_QUERY_OPTIONS,
  });
};

export const useItems = (params: ItemListParams) => {
  return useQuery<ItemListResponse, Error>({
    queryKey: ["items", params],
    queryFn: () => listItemsApi(params),
    enabled: (params.warehouse_id ?? 0) > 0,
    ...LIVE_QUERY_OPTIONS,
  });
};

export const useItemById = (itemId: number) =>
  useQuery<ItemDetails, Error>({
    queryKey: ["item", itemId],
    queryFn: () => getItemByIdApi(itemId),
    enabled: itemId > 0,
    ...LIVE_QUERY_OPTIONS,
  });

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

export const useUpdateItem = () => {
  const queryClient = useQueryClient();
  return useMutation<
    Item,
    AxiosError<ApiErrorResponse>,
    { id: number; data: UpdateItemInput }
  >({
    mutationFn: ({ id, data }) => updateItemApi(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["item", id] });
      queryClient.invalidateQueries({ queryKey: ["item_analyze"] });
    },
  });
};

export const useDeactivateItem = () => {
  const queryClient = useQueryClient();
  return useMutation<void, AxiosError<ApiErrorResponse>, number>({
    mutationFn: deactivateItemApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["item_analyze"] });
    },
  });
};

export const useItemAnalyze = (warehouseId: number) => {
  return useQuery<ItemAnalyzeResponse, Error>({
    queryKey: ["item_analyze", warehouseId],
    queryFn: () => analyzeItemsApi(warehouseId),
    enabled: warehouseId > 0,
    ...LIVE_QUERY_OPTIONS,
  });
};

const IMPORT_POLL_MS = 1500;

async function runImportWithPolling(
  file: File,
  warehouseId: number,
  onProgress?: (job: ItemImportJobStatus) => void,
): Promise<ItemImportJobStatus> {
  const accepted: ItemImportJobAccepted = await importItemsApi(file, warehouseId);
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
    {
      file: File;
      warehouseId: number;
      onProgress?: (job: ItemImportJobStatus) => void;
    }
  >({
    mutationFn: ({ file, warehouseId, onProgress }) =>
      runImportWithPolling(file, warehouseId, onProgress),
    onSuccess: (job) => {
      if (job.status === "completed") {
        queryClient.invalidateQueries({ queryKey: ["items"] });
        queryClient.invalidateQueries({ queryKey: ["item_analyze"] });
      }
    },
  });
};
