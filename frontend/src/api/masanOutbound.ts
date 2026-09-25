import axiosInstance from "./axiosInstance";
import type { MasanOutboundParseResponse } from "@/types/masanOutbound";
import { downloadBlobFromResponse } from "@/utils/downloadBlob";

export const parseMasanOutboundPreviewApi = async (
  file: File,
  warehouseId: number,
  outboundType: "manual" | "auto",
): Promise<MasanOutboundParseResponse> => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("warehouse_id", String(warehouseId));
  formData.append("outbound_type", outboundType);

  const { data } = await axiosInstance.post<MasanOutboundParseResponse>(
    "/api/v1/masan/outbound-orders/parse-preview",
    formData,
    {
      headers: { "Content-Type": "multipart/form-data" },
    },
  );
  return data;
};

export const exportOutboundOrderSoApi = async (orderId: number): Promise<void> => {
  const response = await axiosInstance.get(
    `/api/v1/masan/outbound-orders/${orderId}/export-so`,
    { responseType: "blob" },
  );
  downloadBlobFromResponse(
    response.data as Blob,
    response.headers["content-disposition"] as string | undefined,
    `outbound-${orderId}_LayHangSO.xlsx`,
  );
};
