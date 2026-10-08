import axiosInstance from "./axiosInstance";
import type {
  MasanCcLocationResponse,
  MasanClearInboundZoneRequest,
  MasanClearInboundZoneResponse,
  MasanInboundCallerRequest,
  MasanInboundCallerResponse,
  MasanInboundDetailFilter,
  MasanInboundParseResponse,
  MasanSortingItemsNeededResponse,
  MasanSortingOutboundDispatchRequest,
  MasanSortingOutboundDispatchResponse,
  MasanSortingZoneCcLocationsResponse,
  MasanConfirmAllocationOutboundRequest,
  MasanConfirmAllocationOutboundResponse,
  MasanSortingZonePendingStockResponse,
} from "@/types/masan";
import type { InboundOrderDetail } from "@/types/inboundOrder";
import { downloadBlobFromResponse } from "@/utils/downloadBlob";

export const getMasanInboundDetailsApi = async (
  inboundOrderId: number,
  filter: MasanInboundDetailFilter,
): Promise<InboundOrderDetail[]> => {
  const { data } = await axiosInstance.get<InboundOrderDetail[]>(
    `/api/v1/masan/inbound-orders/${inboundOrderId}/details`,
    { params: filter },
  );
  return data;
};

export const clearMasanInboundZoneApi = async (
  body: MasanClearInboundZoneRequest,
): Promise<MasanClearInboundZoneResponse> => {
  const { data } = await axiosInstance.post<MasanClearInboundZoneResponse>(
    "/api/v1/masan/inbound-orders/clear-inbound-zone",
    body,
  );
  return data;
};

export const callerMasanInboundApi = async (
  body: MasanInboundCallerRequest,
): Promise<MasanInboundCallerResponse> => {
  const { data } = await axiosInstance.post<MasanInboundCallerResponse>(
    "/api/v1/masan/inbound-orders/caller",
    body,
  );
  return data;
};

export const parseMasanInboundPreviewApi = async (
  file: File,
  warehouseId: number,
  inboundType: "manual" | "auto",
): Promise<MasanInboundParseResponse> => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("warehouse_id", String(warehouseId));
  formData.append("inbound_type", inboundType);

  const { data } = await axiosInstance.post<MasanInboundParseResponse>(
    "/api/v1/masan/inbound-orders/parse-preview",
    formData,
    {
      headers: { "Content-Type": "multipart/form-data" },
    },
  );
  return data;
};

export const exportInboundOrderMasanApi = async (
  orderId: number,
): Promise<void> => {
  const response = await axiosInstance.get(
    `/api/v1/masan/inbound-orders/${orderId}/export`,
    { responseType: "blob" },
  );
  downloadBlobFromResponse(
    response.data as Blob,
    response.headers["content-disposition"] as string | undefined,
    `inbound-${orderId}_BaoCaoNhap.xlsx`,
  );
};

export const parseMasanOutboundPreviewApi = async (
  file: File,
  warehouseId: number,
  outboundType: "manual" | "auto" = "auto",
): Promise<import("@/types/masan").MasanOutboundParseResponse> => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("warehouse_id", String(warehouseId));
  formData.append("outbound_type", outboundType);

  const { data } = await axiosInstance.post<import("@/types/masan").MasanOutboundParseResponse>(
    "/api/v1/masan/outbound-orders/parse-preview",
    formData,
    {
      headers: { "Content-Type": "multipart/form-data" },
    },
  );
  return data;
};

export const getMasanCcLocationApi = async (
  warehouseId: number,
  locationId: number,
): Promise<MasanCcLocationResponse> => {
  const { data } = await axiosInstance.get<MasanCcLocationResponse>(
    `/api/v1/masan/outbound-orders/cc-locations/${locationId}`,
    { params: { warehouse_id: warehouseId } },
  );
  return data;
};

export const getMasanSortingZoneCcLocationsApi = async (
  warehouseId: number,
  zone: string,
): Promise<MasanSortingZoneCcLocationsResponse> => {
  const { data } = await axiosInstance.get<MasanSortingZoneCcLocationsResponse>(
    "/api/v1/masan/outbound-orders/sorting-zone/cc-locations",
    { params: { warehouse_id: warehouseId, zone } },
  );
  return data;
};

export const getMasanSortingItemsNeededApi = async (
  warehouseId: number,
  zone: string,
): Promise<MasanSortingItemsNeededResponse> => {
  const { data } = await axiosInstance.get<MasanSortingItemsNeededResponse>(
    "/api/v1/masan/outbound-orders/sorting-items-needed",
    { params: { warehouse_id: warehouseId, zone } },
  );
  return data;
};

export const masanSortingOutboundDispatchApi = async (
  body: MasanSortingOutboundDispatchRequest,
): Promise<MasanSortingOutboundDispatchResponse> => {
  const { data } = await axiosInstance.post<MasanSortingOutboundDispatchResponse>(
    "/api/v1/masan/outbound-orders/sorting-dispatch",
    body,
  );
  return data;
};

export const getMasanSortingZonePendingStockApi = async (
  warehouseId: number,
  zone: string,
  republish = false,
): Promise<MasanSortingZonePendingStockResponse> => {
  const { data } = await axiosInstance.get<MasanSortingZonePendingStockResponse>(
    "/api/v1/masan/outbound-orders/sorting-zone/pending-stock",
    {
      params: {
        warehouse_id: warehouseId,
        zone,
        ...(republish ? { republish: true } : {}),
      },
    },
  );
  return data;
};

export const masanConfirmAllocationOutboundApi = async (
  body: MasanConfirmAllocationOutboundRequest,
): Promise<MasanConfirmAllocationOutboundResponse> => {
  const { data } =
    await axiosInstance.post<MasanConfirmAllocationOutboundResponse>(
      "/api/v1/masan/outbound-orders/confirm-allocation",
      body,
    );
  return data;
};

export const exportOutboundOrderSOApi = async (
  orderId: number,
): Promise<void> => {
  const response = await axiosInstance.get(
    `/api/v1/masan/outbound-orders/${orderId}/export-so`,
    { responseType: "blob" },
  );
  downloadBlobFromResponse(
    response.data as Blob,
    response.headers["content-disposition"] as string | undefined,
    `outbound-${orderId}_SO.xlsx`,
  );
};
