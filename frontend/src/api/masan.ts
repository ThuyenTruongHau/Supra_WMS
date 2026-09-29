import axiosInstance from "./axiosInstance";
import type {
  MasanInboundCallerResponse,
  MasanInboundDetailFilter,
  MasanInboundParseResponse,
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

export const callerMasanInboundApi = async (
  locationIds: number[],
): Promise<MasanInboundCallerResponse> => {
  const { data } = await axiosInstance.post<MasanInboundCallerResponse>(
    "/api/v1/masan/inbound-orders/caller",
    { location_ids: locationIds },
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
