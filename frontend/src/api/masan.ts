import axiosInstance from "./axiosInstance";
import type {
  MasanCcLocationResponse,
  MasanClearInboundZoneRequest,
  MasanClearInboundZoneResponse,
  MasanClearOutboundStationCacheRequest,
  MasanClearOutboundStationCacheResponse,
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
  MasanSortingZoneRobotTasksResponse,
  MasanPickingListListResponse,
  MasanPickingListCreateRequest,
} from "@/types/masan";
import type { InboundOrderDetail } from "@/types/inboundOrder";
import {
  downloadBlobFromResponse,
  downloadPdfFromAxiosResponse,
} from "@/utils/downloadBlob";

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

export const clearMasanOutboundStationCacheApi = async (
  body: MasanClearOutboundStationCacheRequest,
): Promise<MasanClearOutboundStationCacheResponse> => {
  const { data } =
    await axiosInstance.post<MasanClearOutboundStationCacheResponse>(
      "/api/v1/masan/outbound-orders/clear-station-cache",
      body,
    );
  return data;
};

export const clearMasanCcCacheApi = async (warehouseId: number) => {
  const { data } = await axiosInstance.post<{
    warehouse_id: number;
    zones: string[];
    assigned_cc_location_keys: number;
    assigned_cc_details_keys: number;
    stock_ready_keys: number;
    total_keys_deleted: number;
  }>("/api/v1/masan/outbound-orders/clear-cc-cache", {
    warehouse_id: warehouseId,
  });
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

export const exportInboundOrdersMasanBulkApi = async (
  orderIds: number[],
): Promise<void> => {
  const response = await axiosInstance.post(
    "/api/v1/masan/inbound-orders/export",
    { order_ids: orderIds },
    { responseType: "blob" },
  );
  downloadBlobFromResponse(
    response.data as Blob,
    response.headers["content-disposition"] as string | undefined,
    `BaoCaoNhap_${orderIds.length}don.xlsx`,
  );
};

export const exportInboundDailyCapacityApi = async (
  warehouseId: number,
): Promise<void> => {
  const response = await axiosInstance.get(
    "/api/v1/masan/inbound-orders/daily-capacity-export",
    {
      params: { warehouse_id: warehouseId },
      responseType: "blob",
    },
  );
  downloadBlobFromResponse(
    response.data as Blob,
    response.headers["content-disposition"] as string | undefined,
    `Capacity_${warehouseId}.xlsx`,
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
  signal?: AbortSignal,
): Promise<MasanSortingZoneCcLocationsResponse> => {
  const { data } = await axiosInstance.get<MasanSortingZoneCcLocationsResponse>(
    "/api/v1/masan/outbound-orders/sorting-zone/cc-locations",
    { params: { warehouse_id: warehouseId, zone }, signal },
  );
  return data;
};

export const getMasanSortingItemsNeededApi = async (
  warehouseId: number,
  zone: string,
  signal?: AbortSignal,
): Promise<MasanSortingItemsNeededResponse> => {
  const { data } = await axiosInstance.get<MasanSortingItemsNeededResponse>(
    "/api/v1/masan/outbound-orders/sorting-items-needed",
    { params: { warehouse_id: warehouseId, zone }, signal },
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

export const getMasanSortingZoneRobotTasksApi = async (
  sortingZoneCode: string,
  signal?: AbortSignal,
): Promise<MasanSortingZoneRobotTasksResponse> => {
  const zone = sortingZoneCode.trim();
  const { data } = await axiosInstance.get<MasanSortingZoneRobotTasksResponse>(
    "/api/v1/masan/outbound-orders/sorting-zone/robot-tasks",
    { params: { zone }, signal },
  );
  return {
    zone: typeof data?.zone === "string" && data.zone.trim() ? data.zone : zone,
    tasks: Array.isArray(data?.tasks) ? data.tasks : [],
  };
};

export const getMasanSortingZonePendingStockApi = async (
  warehouseId: number,
  zone: string,
  republish = false,
  signal?: AbortSignal,
): Promise<MasanSortingZonePendingStockResponse> => {
  const { data } = await axiosInstance.get<MasanSortingZonePendingStockResponse>(
    "/api/v1/masan/outbound-orders/sorting-zone/pending-stock",
    {
      params: {
        warehouse_id: warehouseId,
        zone,
        ...(republish ? { republish: true } : {}),
      },
      signal,
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

export const listMasanPickingListsApi = async (
  warehouseId: number,
  vehicleNo: string,
): Promise<MasanPickingListListResponse> => {
  const { data } = await axiosInstance.get<MasanPickingListListResponse>(
    "/api/v1/masan/outbound/picking-lists",
    {
      params: { warehouse_id: warehouseId, vehicle_no: vehicleNo },
    },
  );
  return data;
};

export const createMasanPickingListPdfApi = async (
  body: MasanPickingListCreateRequest,
): Promise<void> => {
  const response = await axiosInstance.post(
    "/api/v1/masan/outbound/picking-lists",
    body,
    { responseType: "blob", timeout: 120_000 },
  );
  await downloadPdfFromAxiosResponse(
    response,
    `picking_list_${body.vehicle_no}.pdf`,
  );
};

export const downloadMasanPickingListPdfApi = async (params: {
  warehouse_id: number;
  vehicle_no: string;
  extracted: number;
  location_id?: number | null;
}): Promise<void> => {
  const response = await axiosInstance.get(
    "/api/v1/masan/outbound/picking-lists/pdf",
    {
      params,
      responseType: "blob",
      timeout: 120_000,
    },
  );
  await downloadPdfFromAxiosResponse(
    response,
    `picking_list_${params.vehicle_no}_${params.extracted}.pdf`,
  );
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

export const exportOutboundOrderReportApi = async (
  orderId: number,
): Promise<void> => {
  const response = await axiosInstance.get(
    `/api/v1/masan/outbound-orders/${orderId}/export`,
    { responseType: "blob" },
  );
  downloadBlobFromResponse(
    response.data as Blob,
    response.headers["content-disposition"] as string | undefined,
    `outbound-${orderId}_BaoCaoXuat.xlsx`,
  );
};

export const exportOutboundOrdersReportBulkApi = async (
  orderIds: number[],
): Promise<void> => {
  const response = await axiosInstance.post(
    "/api/v1/masan/outbound-orders/export",
    { order_ids: orderIds },
    { responseType: "blob" },
  );
  downloadBlobFromResponse(
    response.data as Blob,
    response.headers["content-disposition"] as string | undefined,
    `BaoCaoXuat_${orderIds.length}don.xlsx`,
  );
};
