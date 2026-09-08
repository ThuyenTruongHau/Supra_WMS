import axiosInstance from './axiosInstance';
import {
  Product,
  GetProductsByZoneIdResponse,
  CreateProductInput,
  UpdateProductInput,
  GetProductByIdResponse,
  ProductImportJobAccepted,
  ProductImportJobStatus,
} from '@/types/product';

const BASE = '/api/v1/product';

export const getProductsByZoneIdApi = async (zone_id: number): Promise<GetProductsByZoneIdResponse> => {
    const response = await axiosInstance.get<GetProductsByZoneIdResponse>(`${BASE}/get-products-by-zone-id?zone_id=${zone_id}`);
    return response.data;
};
export const getProductByIdApi = async (id: number): Promise<GetProductByIdResponse> => {
    const response = await axiosInstance.get<GetProductByIdResponse>(`${BASE}/get-product-by-id?id=${id}`);
    return response.data;
};
export const updateProductApi = async (
    id: number,
    data: Omit<UpdateProductInput, 'id'>,
): Promise<Product> => {
    const response = await axiosInstance.patch<Product>(
        `${BASE}/update-product-by-id`,
        { id, ...data },
    );
    return response.data;
};
export const createProductApi = async (data: CreateProductInput): Promise<Product> => {
    const response = await axiosInstance.post<Product>(`${BASE}/create-product`, data);
    return response.data;
};
export const deleteProductApi = async (id: number): Promise<void> => {
    await axiosInstance.delete(`${BASE}/delete-product-by-id?id=${id}`);
}

export const importProductsApi = async (
  file: File,
  zoneId: number,
): Promise<ProductImportJobAccepted> => {
  const formData = new FormData();
  formData.append('zone_id', String(zoneId));
  formData.append('file', file);
  const { data } = await axiosInstance.post<ProductImportJobAccepted>(
    `${BASE}/import`,
    formData,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 5 * 60 * 1000,
    },
  );
  return data;
};

export const getProductImportJobApi = async (
  jobId: string,
): Promise<ProductImportJobStatus> => {
  const { data } = await axiosInstance.get<ProductImportJobStatus>(
    `${BASE}/import/${encodeURIComponent(jobId)}`,
  );
  return data;
};