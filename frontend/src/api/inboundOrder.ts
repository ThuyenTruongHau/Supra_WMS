import axiosInstance from "./axiosInstance";
import type {
  AssignOrGetItemStockRequest,
  AssignOrGetItemStockResponse,
  CacheForPackingUserRequest,
  GetInboundOrdersParams,
  InboundCallerResponse,
  InboundOrder,
  InboundOrderCreateRequest,
  InboundOrderDetail,
  InboundOrderDeleteResponse,
  InboundOrderListResponse,
  InboundOrderUpdateRequest,
  InboundReleaseLocationsRequest,
  InboundReleaseLocationsResponse,
  InboundSuggestAllocationRequest,
  InboundSuggestAllocationResponse,
  QrCodePreviewRequest,
  PackingUserPendingStocksResponse,
} from "@/types/inboundOrder";

const BASE = "/api/v1/inbound-orders";

export const getInboundOrdersApi = async (
  params: GetInboundOrdersParams,
): Promise<InboundOrderListResponse> => {
  const { data } = await axiosInstance.get<InboundOrderListResponse>(BASE, {
    params,
  });
  return data;
};

export const getInboundOrderDetailsApi = async (
  orderCode: string,
): Promise<InboundOrderDetail[]> => {
  const { data } = await axiosInstance.get<InboundOrderDetail[]>(
    `${BASE}/${encodeURIComponent(orderCode)}/details`,
  );
  return data;
};

export const suggestInboundAllocationApi = async (
  body: InboundSuggestAllocationRequest,
): Promise<InboundSuggestAllocationResponse> => {
  const { data } = await axiosInstance.post<InboundSuggestAllocationResponse>(
    `${BASE}/suggest-allocation`,
    body,
  );
  return data;
};

export const releaseInboundLocationsApi = async (
  body: InboundReleaseLocationsRequest,
): Promise<InboundReleaseLocationsResponse> => {
  const { data } = await axiosInstance.post<InboundReleaseLocationsResponse>(
    `${BASE}/release-locations`,
    body,
  );
  return data;
};

export const createInboundOrderApi = async (
  body: InboundOrderCreateRequest,
  inboundType: string,
): Promise<InboundOrder> => {
  const { data } = await axiosInstance.post<InboundOrder>(BASE, body, {
    params: { inbound_type: inboundType },
  });
  return data;
};

export const updateInboundOrderApi = async (
  orderCode: string,
  body: InboundOrderUpdateRequest,
  inboundType: string,
): Promise<InboundOrder> => {
  const { data } = await axiosInstance.patch<InboundOrder>(
    `${BASE}/${encodeURIComponent(orderCode)}`,
    body,
    { params: { inbound_type: inboundType } },
  );
  return data;
};

export const deleteInboundOrderApi = async (
  orderCode: string,
): Promise<InboundOrderDeleteResponse> => {
  const { data } = await axiosInstance.delete<InboundOrderDeleteResponse>(
    `${BASE}/${encodeURIComponent(orderCode)}`,
  );
  return data;
};

export const acceptInboundTaskApi = async (detailId: number): Promise<unknown> => {
  const { data } = await axiosInstance.post(
    `/api/v1/inbound-allocations/${detailId}/accept-task`,
  );
  return data;
};

export const assignOrGetItemStockApi = async (
  body: AssignOrGetItemStockRequest,
): Promise<AssignOrGetItemStockResponse> => {
  const { data } = await axiosInstance.post<AssignOrGetItemStockResponse>(
    `${BASE}/assigned-stocks`,
    body,
  );
  return data;
};

export const manualInboundScanApi = async (
  body: AssignOrGetItemStockRequest,
): Promise<AssignOrGetItemStockResponse> => {
  const { data } = await axiosInstance.post<AssignOrGetItemStockResponse>(
    `${BASE}/manual/scan`,
    body,
  );
  return data;
};

export const previewQrCodeApi = async (
  body: QrCodePreviewRequest,
): Promise<AssignOrGetItemStockResponse> => {
  const { data } = await axiosInstance.post<AssignOrGetItemStockResponse>(
    `${BASE}/preview-stocks`,
    body,
  );
  return data;
};

export const cacheForPackingUserApi = async (
  body: CacheForPackingUserRequest,
): Promise<AssignOrGetItemStockResponse> => {
  const { data } = await axiosInstance.post<AssignOrGetItemStockResponse>(
    `${BASE}/packing-stocks`,
    body,
  );
  return data;
};

export type PackingPendingRole = "item" | "pack";

export type GetPackingUserStocksOptions = {
  linked?: boolean;
  pendingRole?: PackingPendingRole;
};

export const getPackingUserStocksApi = async (
  packingUser: string,
  options?: boolean | GetPackingUserStocksOptions,
): Promise<PackingUserPendingStocksResponse> => {
  const resolved =
    typeof options === "boolean" ? { linked: options } : (options ?? {});
  const { data } = await axiosInstance.get<PackingUserPendingStocksResponse>(
    `${BASE}/packing-stocks`,
    {
      params: {
        packing_user: packingUser,
        ...(resolved.linked === true || resolved.linked === false
          ? { linked: resolved.linked }
          : {}),
        ...(resolved.pendingRole ? { pending_role: resolved.pendingRole } : {}),
      },
    },
  );
  return data;
};

export const callerInboundOrderApi = async (
  body: InboundOrderCreateRequest,
  inboundType: string,
): Promise<InboundCallerResponse> => {
  const { data } = await axiosInstance.post<InboundCallerResponse>(
    `${BASE}/caller`,
    body,
    { params: { inbound_type: inboundType } },
  );
  return data;
};
