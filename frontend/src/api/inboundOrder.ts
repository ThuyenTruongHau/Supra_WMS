import axiosInstance from './axiosInstance';
import {
  DraftInboundOrderRequest,
  DraftInboundOrderResponse,
  GetStorageLocationSuggestionsResponse,
  CreateInboundOrderRequest,
  CreateInboundOrderResponse,
  GetInboundOrdersParams,
  GetInboundOrdersResponse,
  InboundOrderDetail,
  ReceiveInboundOrderDetailRequest,
  InboundVehicle
} from '@/types/inboundOrder';

export const getInboundVehiclesApi = async (zone_id: number = 49): Promise<InboundVehicle[]> => {
  const response = await axiosInstance.get('api/v1/inbound-orders/vehicles', { params: { zone_id } });
  return response.data;
};

export const getInboundOrdersApi = async (params: GetInboundOrdersParams): Promise<GetInboundOrdersResponse> => {
  const response = await axiosInstance.get('api/v1/inbound-orders/', { params });
  return response.data;
};

export const getInboundOrderDetailApi = async (orderCode: string): Promise<InboundOrderDetail> => {
  const response = await axiosInstance.get(`api/v1/inbound-orders/${orderCode}/`);
  return response.data;
};

export const draftInboundOrderApi = async (data: DraftInboundOrderRequest): Promise<DraftInboundOrderResponse> => {
  const response = await axiosInstance.post('api/v1/inbound-orders/draft', data);
  console.log("Draft của response", response.data)
  return response.data;
};

export const getStorageLocationSuggestionsApi = async (sessionId: string): Promise<GetStorageLocationSuggestionsResponse> => {
  const response = await axiosInstance.get('api/v1/inbound-orders/storage-locations-suggest', {
    params: { session_id: sessionId }
  });
  return response.data;
};

export const createInboundOrderApi = async (sessionId: string, data: CreateInboundOrderRequest): Promise<CreateInboundOrderResponse> => {
  const response = await axiosInstance.post('api/v1/inbound-orders', data, {
    params: { session_id: sessionId }
  });
  return response.data;
};

export const receiveInboundOrderDetailApi = async (orderCode: string, detailId: number, data: ReceiveInboundOrderDetailRequest): Promise<any> => {
  console.log(`[API CALL] POST api/v1/inbound-orders/${orderCode}/details/${detailId}/receive`, { body: data });
  const response = await axiosInstance.post(`api/v1/inbound-orders/${orderCode}/details/${detailId}/receive`, data);
  return response.data;
};

