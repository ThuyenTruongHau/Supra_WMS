import type { AgvStatusRow } from "@/components/layout/OperatorStatusMetricPanels";
import type { RobotTelemetry } from "@/types/robot";

export const INBOUND_ROBOTS = [
  { deviceCode: "EE49822BAK00001", name: "FL 01" },
  { deviceCode: "EE49822BAK00002", name: "FL 02" },
] as const;

export type InboundRobot = (typeof INBOUND_ROBOTS)[number];

const STATE_DISPLAY = new Map<string, Pick<AgvStatusRow, "status" | "tone">>([
  ["InCharging", { status: "Đang sạc", tone: "charging" }],
  ["Idle", { status: "Rảnh", tone: "idle" }],
  ["InTask", { status: "Làm nhiệm vụ", tone: "task" }],
  ["Offline", { status: "Mất kết nối", tone: "offline" }],
]);

const DEVICE_STATUS_STATE: Record<number, string> = {
  0: "Offline",
  1: "Idle",
  4: "InTask",
  5: "InCharging",
};

function displayRobotState(robot: RobotTelemetry): Pick<AgvStatusRow, "status" | "tone"> {
  let state = typeof robot.state === "string" ? robot.state.trim() : "";
  if (!state) {
    const rawStatus = robot.deviceStatus;
    if (
      typeof rawStatus === "number" ||
      (typeof rawStatus === "string" && rawStatus.trim() !== "")
    ) {
      state = DEVICE_STATUS_STATE[Number(rawStatus)] ?? "";
    }
  }
  return STATE_DISPLAY.get(state) ?? {
    status: state || "Không rõ trạng thái",
    tone: "unknown",
  };
}

function parseRobotSpeed(speed: RobotTelemetry["speed"]): number | undefined {
  if (typeof speed !== "number" && typeof speed !== "string") return undefined;
  if (typeof speed === "string" && speed.trim() === "") return undefined;
  const value = Number(speed);
  // RCS reports mm/s; display m/s rounded to one decimal, without trailing zero.
  return Number.isFinite(value) ? Number((value / 1000).toFixed(1)) : undefined;
}

export function buildRobotStatusRows(
  robots: RobotTelemetry[] | undefined,
  options: { isLoading?: boolean; isError?: boolean } = {},
): AgvStatusRow[] {
  const byCode = new Map((robots ?? []).map((robot) => [robot.deviceCode, robot]));
  return INBOUND_ROBOTS.map(({ deviceCode, name }) => {
    if (options.isLoading) {
      return { id: name, status: "Đang tải…", tone: "unknown" };
    }
    const robot = byCode.get(deviceCode);
    if (options.isError || !robot) {
      return { id: name, status: "Không có dữ liệu", tone: "unknown" };
    }
    const speed = parseRobotSpeed(robot.speed);
    return {
      id: name,
      ...displayRobotState(robot),
      ...(speed === undefined ? {} : { speed }),
    };
  });
}
