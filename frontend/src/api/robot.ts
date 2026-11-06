import axios from "axios";
import axiosInstance from "./axiosInstance";
import type { RobotTelemetry } from "@/types/robot";

export async function sendCompletedRobotStatusApi(orderId: string): Promise<void> {
  // Same-origin proxy keeps the fixed HTTP webhook usable from HTTPS pages.
  const { data } = await axios.post<{ code: number }>(
    "/control-tower-api/receive-status",
    { orderId: orderId.trim(), status: 8 },
    { timeout: 20000 },
  );
  if (data?.code !== 1000) {
    throw new Error("Máy chủ chưa xác nhận tiếp nhận trạng thái.");
  }
}

export async function getRobotDataApi(signal?: AbortSignal): Promise<RobotTelemetry[]> {
  const { data } = await axiosInstance.get<RobotTelemetry[]>("/api/v1/robot_data", {
    signal,
    timeout: 5000,
  });
  if (!Array.isArray(data)) {
    throw new Error("Invalid robot telemetry response");
  }
  return data;
}
