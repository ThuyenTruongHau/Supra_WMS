import * as XLSX from "xlsx";
import type { Item } from "@/types/item";

export const EXPORT_LIMIT = 100;

function formatDateVi(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** Sắp lot date gần → xa, lấy tối đa 100 */
export function getItemsForExport(
  items: Item[],
  limit = EXPORT_LIMIT,
): Item[] {
  return [...items]
    .sort((a, b) => a.updated_at.localeCompare(b.updated_at))
    .slice(0, limit);
}

/** Chuyển sang dòng Excel (ngày hiển thị dd/mm/yyyy) */
export function toExportRows(items: Item[]) {
  return items.map((i, index) => ({
    STT: index + 1,
    "Mã sản phẩm": i.sku,
    "Tên sản phẩm": i.name,
    SKU: i.sku,
    "Nhà cung cấp": i.supplier,
    "Số lượng": i.quantity,
    "Đơn vị": i.base_unit,
    "Ngày tạo": formatDateVi(i.created_at),
    "Ngày cập nhật": formatDateVi(i.updated_at),
  }));
}

export function downloadItemExcel(
  items: Item[],
  warehouseName: string,
) {
  const rows = toExportRows(items);
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Sản phẩm");

  const dateStr = new Date().toISOString().slice(0, 10);
  const safeName = warehouseName.replace(/[^\w\u00C0-\u024f\s-]/gi, "").trim();
  const filename = `san-pham_${safeName || "kho"}_${dateStr}.xlsx`;

  XLSX.writeFile(workbook, filename);
}