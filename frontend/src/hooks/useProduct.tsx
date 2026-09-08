import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getProductsByZoneIdApi,
  getProductByIdApi,
  deleteProductApi,
  createProductApi,
  updateProductApi,
  importProductsApi,
  getProductImportJobApi,
} from "@/api/product";
import {
  Product,
  CreateProductInput,
  UpdateProductInput,
  GetProductByIdResponse,
  ProductImportJobAccepted,
  ProductImportJobStatus,
} from "@/types/product";
import { AxiosError } from "axios";
import { ApiErrorResponse } from "@/types/apiError";

// 1. Hook lấy danh sách (Read)
export const useProduct = (zoneId: number) => {
  return useQuery<Product[], Error>({
    queryKey: ["product_by_zone", zoneId],
    queryFn: async () => {
      const res = await getProductsByZoneIdApi(zoneId);
      return res.products;
    },
    enabled: zoneId > 0,
    staleTime: 30 * 1000,
    refetchOnMount: "always",
  });
};

export const useProductById = (id: number) => {
  return useQuery<GetProductByIdResponse, Error>({
    queryKey: ["product", id],
    queryFn: () => getProductByIdApi(id),
    enabled: id > 0,
    staleTime: 30 * 1000,
    refetchOnMount: "always",
  });
};
// 2. Hook tạo mới (Create)
export const useCreateProduct = () => {
  const queryClient = useQueryClient();
  return useMutation<Product, AxiosError<ApiErrorResponse>, CreateProductInput>(
    {
      mutationFn: createProductApi,
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["product_by_zone"] });
      },
    },
  );
};

// 3. Hook cập nhật (Update)
export const useUpdateProduct = () => {
  const queryClient = useQueryClient();
  return useMutation<
    Product,
    AxiosError<ApiErrorResponse>,
    { id: number; data: Omit<UpdateProductInput, "id"> }
  >({
    mutationFn: ({ id, data }) => updateProductApi(id, data),
    onSuccess: (_product, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["product", id] });
      queryClient.invalidateQueries({ queryKey: ["product_by_zone"] });
    },
  });
};

// 4. Hook xóa (Delete)
export const useDeleteProduct = () => {
  const queryClient = useQueryClient();
  return useMutation<void, AxiosError<ApiErrorResponse>, number>({
    mutationFn: deleteProductApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["product_by_zone"] });
    },
  });
};

const IMPORT_POLL_MS = 1500;

async function runImportWithPolling(
  file: File,
  zoneId: number,
  onProgress?: (job: ProductImportJobStatus) => void,
): Promise<ProductImportJobStatus> {
  const accepted: ProductImportJobAccepted = await importProductsApi(file, zoneId);
  let job = await getProductImportJobApi(accepted.job_id);

  while (job.status === "pending" || job.status === "running") {
    onProgress?.(job);
    await new Promise((resolve) => setTimeout(resolve, IMPORT_POLL_MS));
    job = await getProductImportJobApi(accepted.job_id);
  }

  onProgress?.(job);
  return job;
}

export const useImportProducts = () => {
  const queryClient = useQueryClient();
  return useMutation<
    ProductImportJobStatus,
    AxiosError<ApiErrorResponse>,
    {
      file: File;
      zoneId: number;
      onProgress?: (job: ProductImportJobStatus) => void;
    }
  >({
    mutationFn: ({ file, zoneId, onProgress }) =>
      runImportWithPolling(file, zoneId, onProgress),
    onSuccess: (job) => {
      if (job.status === "completed") {
        queryClient.invalidateQueries({ queryKey: ["product_by_zone"] });
      }
    },
  });
};
