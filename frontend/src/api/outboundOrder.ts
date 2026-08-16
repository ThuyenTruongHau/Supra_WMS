import axiosInstance from "./axiosInstance";
import { isAxiosError } from "axios";
import type {
  CalculateOutboundRequest,
  CalculateOutboundResponse,
  GetOutboundOrdersParams,
  LackedDetail,
  OutboundOrder,
  OutboundOrderCreateRequest,
  OutboundOrderDeleteResponse,
  OutboundOrderDetail,
  OutboundOrderListResponse,
  OutboundOrderUpdateRequest,
  OutboundRobotTask,
} from "@/types/outbound";

const BASE = "/api/v1/outbound-orders";

export const getOutboundOrdersApi = async (
  params: GetOutboundOrdersParams,
): Promise<OutboundOrderListResponse> => {
  const { data } = await axiosInstance.get<OutboundOrderListResponse>(BASE, {
    params,
  });
  return data;
};

export const getOutboundOrderByIdApi = async (
  orderId: number,
): Promise<OutboundOrder> => {
  const { data } = await axiosInstance.get<OutboundOrder>(
    `${BASE}/id/${orderId}`,
  );
  return data;
};

export const getOutboundOrderDetailsApi = async (
  orderId: number,
): Promise<OutboundOrderDetail[]> => {
  const { data } = await axiosInstance.get<OutboundOrderDetail[]>(
    `${BASE}/id/${orderId}/details`,
  );
  return data;
};

export const createOutboundOrderApi = async (
  body: OutboundOrderCreateRequest,
  outboundType: string,
): Promise<OutboundOrder> => {
  const { data } = await axiosInstance.post<OutboundOrder>(BASE, body, {
    params: { outbound_type: outboundType },
  });
  return data;
};

export const updateOutboundOrderApi = async (
  orderId: number,
  body: OutboundOrderUpdateRequest,
  outboundType: string,
): Promise<OutboundOrder> => {
  const { data } = await axiosInstance.patch<OutboundOrder>(
    `${BASE}/id/${orderId}`,
    body,
    { params: { outbound_type: outboundType } },
  );
  return data;
};

export const deleteOutboundOrderApi = async (
  orderCode: string,
): Promise<OutboundOrderDeleteResponse> => {
  const { data } = await axiosInstance.delete<OutboundOrderDeleteResponse>(
    `${BASE}/${encodeURIComponent(orderCode)}`,
  );
  return data;
};

export const getOutboundLackedDetailsApi = async (
  orderId: number,
): Promise<LackedDetail[]> => {
  const { data } = await axiosInstance.get<LackedDetail[]>(
    `${BASE}/id/${orderId}/lacked`,
  );
  return data;
};

export const calculateOutboundOrderApi = async (
  body: CalculateOutboundRequest,
  strategy = "fefo",
): Promise<CalculateOutboundResponse> => {
  const { data } = await axiosInstance.post<CalculateOutboundResponse>(
    `${BASE}/calculate`,
    body,
    { params: { strategy } },
  );
  return data;
};

export const getOutboundRobotTasksApi = async (
  orderId: number,
): Promise<OutboundRobotTask[]> => {
  try {
    const { data } = await axiosInstance.get<OutboundRobotTask[]>(
      `/api/v1/robot-tasks/${orderId}`,
    );
    return Array.isArray(data) ? data : [];
  } catch (err) {
    if (isAxiosError(err) && err.response?.status === 404) {
      return [];
    }
    throw err;
  }
};
