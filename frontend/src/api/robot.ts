import axiosInstance from "./axiosInstance";
import type { RobotTelemetry } from "@/types/robot";

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
