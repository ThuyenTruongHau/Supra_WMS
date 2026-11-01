import { vietnamTime } from "./vietnamTime.ts";
import type { Dayjs } from "dayjs";

export type OrderCreatedAtRange = [Dayjs, Dayjs] | null;

export function orderCreatedAtQueryParams(range: OrderCreatedAtRange): {
  created_from?: string;
  created_to?: string;
} {
  if (!range) return {};
  const [from, to] = range;
  return {
    created_from: vietnamTime(from.format("YYYY-MM-DDTHH:mm:00")).toISOString(),
    created_to: vietnamTime(to.format("YYYY-MM-DDTHH:mm:59.999")).toISOString(),
  };
}
