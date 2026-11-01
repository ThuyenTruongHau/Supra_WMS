import dayjs, { type ConfigType, type Dayjs } from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

dayjs.extend(utc);
dayjs.extend(timezone);

export const VIETNAM_TIMEZONE = "Asia/Ho_Chi_Minh";

/** Offset-free legacy values are Vietnamese wall time; explicit offsets retain their instant. */
export function vietnamTime(value?: ConfigType): Dayjs {
  const parsed = dayjs(value);
  if (!parsed.isValid()) return parsed;
  if (typeof value === "string" && !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value.trim())) {
    return dayjs.tz(value, VIETNAM_TIMEZONE);
  }
  return parsed.tz(VIETNAM_TIMEZONE);
}

export function formatVietnamDateTime(
  value: ConfigType,
  pattern = "DD/MM/YYYY HH:mm",
  fallback = "—",
): string {
  if (value == null || value === "") return fallback;
  const parsed = vietnamTime(value);
  return parsed.isValid() ? parsed.format(pattern) : fallback;
}
