import axiosInstance from './axiosInstance'
import type {
  ExitPoint,
  ExitPointListParams,
  CreateExitPointRequest,
  UpdateExitPointRequest,
} from '@/types/exitPoint'

const BASE = '/api/v1/end-points'

export const getExitPointsApi = async (
  params: ExitPointListParams = {},
): Promise<ExitPoint[]> => {
  const { data } = await axiosInstance.get<ExitPoint[]>(BASE, { params })
  return data
}

export const getExitPointApi = async (id: number): Promise<ExitPoint> => {
  const { data } = await axiosInstance.get<ExitPoint>(`${BASE}/${id}`)
  return data
}

export const createExitPointApi = async (
  payload: CreateExitPointRequest,
): Promise<ExitPoint> => {
  const { data } = await axiosInstance.post<ExitPoint>(BASE, payload)
  return data
}

export const updateExitPointApi = async (
  id: number,
  payload: UpdateExitPointRequest,
): Promise<ExitPoint> => {
  const { data } = await axiosInstance.patch<ExitPoint>(`${BASE}/${id}`, payload)
  return data
}

/** Soft-deactivate: DELETE /api/v1/end-points/{id} → 204, không body */
export const deleteExitPointApi = async (id: number): Promise<void> => {
  await axiosInstance.delete(`${BASE}/${id}`)
}
