import axiosInstance from "./axiosInstance";
import type {
  GetInboundOrdersParams,
  InboundOrder,
  InboundOrderCreateRequest,
  InboundOrderDetail,
  InboundOrderListResponse,
  InboundOrderUpdateRequest,
  InboundReleaseLocationsRequest,
  InboundReleaseLocationsResponse,
  InboundSuggestAllocationRequest,
  InboundSuggestAllocationResponse,
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

export const acceptInboundTaskApi = async (detailId: number): Promise<unknown> => {
  const { data } = await axiosInstance.post(
    `/api/v1/inbound-allocations/${detailId}/accept-task`,
  );
  return data;
};
