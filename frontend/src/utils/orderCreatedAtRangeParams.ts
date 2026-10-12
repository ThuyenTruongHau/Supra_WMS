import type { Dayjs } from "dayjs";

export type OrderCreatedAtRange = [Dayjs, Dayjs] | null;

export function orderCreatedAtQueryParams(range: OrderCreatedAtRange): {
  created_from?: string;
  created_to?: string;
} {
  if (!range) return {};
  const [from, to] = range;
  return {
    created_from: from.startOf("minute").toISOString(),
    created_to: to.endOf("minute").toISOString(),
  };
}
