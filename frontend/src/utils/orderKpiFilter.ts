/** Trạng thái đơn map với key KPI card */
export const ORDER_KPI_STATUS_KEYS = new Set([
  "initialize",
  "in_progress",
  "completed",
]);

export function orderKpiSelectedKey(
  statusFilter: string,
): string | null {
  if (statusFilter === "all") return null;
  if (ORDER_KPI_STATUS_KEYS.has(statusFilter)) return statusFilter;
  return null;
}

export function handleOrderKpiFilterKey(
  key: string | null,
  statusFilter: string,
  setStatusFilter: (v: string) => void,
  setPage: (p: number) => void,
) {
  if (key === null) {
    setStatusFilter("all");
    setPage(1);
    return;
  }
  if (key === "all") {
    setStatusFilter("all");
    setPage(1);
    return;
  }
  if (statusFilter === key) {
    setStatusFilter("all");
  } else {
    setStatusFilter(key);
  }
  setPage(1);
}
