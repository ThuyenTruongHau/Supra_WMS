import { isAxiosError } from "axios";
import axiosInstance from "./axiosInstance";
import type {
  GetTransactionHistoryParams,
  TransactionHistoryLookupResponse,
} from "@/types/transactionHistory";

const BASE = "/api/v1/transaction-history";

function isNotFoundError(err: unknown): boolean {
  return isAxiosError(err) && err.response?.status === 404;
}

export const getTransactionHistoryApi = async (
  params: GetTransactionHistoryParams,
): Promise<TransactionHistoryLookupResponse> => {
  const { data } = await axiosInstance.get<TransactionHistoryLookupResponse>(
    BASE,
    { params },
  );
  return data;
};

/** Try QR lookup first, then order_code when QR is not found. */
export const searchTransactionHistoryApi = async (
  query: string,
): Promise<TransactionHistoryLookupResponse> => {
  const trimmed = query.trim();
  if (!trimmed) {
    throw new Error("Vui lòng nhập mã QR hoặc mã đơn");
  }

  try {
    return await getTransactionHistoryApi({ qr_code: trimmed });
  } catch (qrErr) {
    if (!isNotFoundError(qrErr)) throw qrErr;
    try {
      return await getTransactionHistoryApi({ order_code: trimmed });
    } catch (orderErr) {
      if (isNotFoundError(orderErr)) {
        throw new Error("Không tìm thấy mã QR hoặc mã đơn");
      }
      throw orderErr;
    }
  }
};
