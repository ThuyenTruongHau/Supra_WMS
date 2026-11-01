/** RCS telemetry retains optional vendor fields, including minimal Offline rows. */
export type RobotTelemetry = {
  deviceCode: string;
  state?: string | null;
  deviceStatus?: number | string | null;
  /** Raw RCS speed in mm/s. */
  speed?: number | string | null;
  [key: string]: unknown;
};
