import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";

dayjs.extend(customParseFormat);

/** Naive local datetime sent to API (interpreted as Asia/Ho_Chi_Minh on server). */
const DATETIME_API = "YYYY-MM-DDTHH:mm:ss";
const LEGACY_DATE_API = "YYYY-MM-DD";

export interface OrderCreatedDateRangeValue {
  created_from?: string;
  created_to?: string;
}

function parseApiDateTime(value: string): Dayjs | null {
  const withTime = dayjs(value, DATETIME_API, true);
  if (withTime.isValid()) return withTime;
  const dateOnly = dayjs(value, LEGACY_DATE_API, true);
  if (dateOnly.isValid()) return dateOnly;
  const iso = dayjs(value);
  return iso.isValid() ? iso : null;
}

export function orderListDateRangeToDayjs(
  value: OrderCreatedDateRangeValue,
): [Dayjs, Dayjs] | null {
  const { created_from, created_to } = value;
  if (!created_from && !created_to) return null;
  const from = created_from ? parseApiDateTime(created_from) : null;
  const to = created_to ? parseApiDateTime(created_to) : null;
  if (from && to) return [from, to];
  if (from && !to) return [from, from];
  if (!from && to) return [to, to];
  return null;
}

export function dayjsRangeToOrderListParams(
  dates: [Dayjs | null, Dayjs | null] | null,
): OrderCreatedDateRangeValue {
  if (!dates) return {};
  const [from, to] = dates;
  const created_from =
    from && from.isValid() ? from.format(DATETIME_API) : undefined;
  const created_to =
    to && to.isValid() ? to.format(DATETIME_API) : undefined;
  return { created_from, created_to };
}
