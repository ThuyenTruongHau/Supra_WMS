import axiosInstance from "./axiosInstance";
import type { MasanInboundParseResponse } from "@/types/masan";
import { downloadBlobFromResponse } from "@/utils/downloadBlob";

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
