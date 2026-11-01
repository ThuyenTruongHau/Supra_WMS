import * as XLSXStyle from "xlsx-js-style";
import type { MasanOutboundStockShortage } from "@/types/masanOutbound";

/** Khớp BM.06 — parser nhập đọc header hàng 2, dữ liệu từ hàng 3. */
export const BM06_IMPORT_TITLE =
  "BIỂU MẪU BÁO CÁO NHẬP THEO NGÀY\n(New System trả về để truy vết)";

export const BM06_IMPORT_HEADERS = [
  "Ngày/ Giờ chi tiết",
  "Số xe",
  "Kho xuất",
  "Kho nhập",
  "Delivery",
  "NVT",
  "Mã Item",
  "Tên Item",
  "LOT",
  "Lot status",
  "Số lượng",
  "Số pallet",
  "Vị trí để",
  "Locator",
] as const;

const COL_COUNT = BM06_IMPORT_HEADERS.length;
const SKU_COL = 6;
const NAME_COL = 7;
const LOT_STATUS_COL = 9;
const QTY_COL = 10;

const THIN_BORDER = {
  top: { style: "thin", color: { rgb: "000000" } },
  bottom: { style: "thin", color: { rgb: "000000" } },
  left: { style: "thin", color: { rgb: "000000" } },
  right: { style: "thin", color: { rgb: "000000" } },
};

const TITLE_FILL = { fgColor: { rgb: "FFFF00" }, patternType: "solid" };

const TITLE_STYLE = {
  font: { bold: true, sz: 11, name: "Arial" },
  fill: TITLE_FILL,
  alignment: { horizontal: "center", vertical: "center", wrapText: true },
  border: THIN_BORDER,
};

const HEADER_STYLE = {
  font: { bold: true, sz: 10, name: "Arial" },
  alignment: { horizontal: "center", vertical: "center", wrapText: true },
  border: THIN_BORDER,
};

const DATA_CENTER = {
  font: { sz: 10, name: "Arial" },
  alignment: { horizontal: "center", vertical: "center", wrapText: true },
  border: THIN_BORDER,
};

const DATA_LEFT = {
  font: { sz: 10, name: "Arial" },
  alignment: { horizontal: "left", vertical: "center", wrapText: true },
  border: THIN_BORDER,
};

const DATA_RIGHT = {
  font: { sz: 10, name: "Arial" },
  alignment: { horizontal: "right", vertical: "center" },
  border: THIN_BORDER,
};

function setCellStyle(
  ws: XLSXStyle.WorkSheet,
  row: number,
  col: number,
  style: object,
) {
  const address = XLSXStyle.utils.encode_cell({ r: row, c: col });
  if (!ws[address]) {
    ws[address] = { t: "s", v: "" };
  }
  ws[address].s = style;
}

function applyBm06Styles(ws: XLSXStyle.WorkSheet, dataRowCount: number) {
  const totalRows = 2 + dataRowCount;
  for (let row = 0; row < totalRows; row += 1) {
    for (let col = 0; col < COL_COUNT; col += 1) {
      if (row === 0) {
        setCellStyle(ws, row, col, TITLE_STYLE);
        continue;
      }
      if (row === 1) {
        setCellStyle(ws, row, col, HEADER_STYLE);
        continue;
      }
      if (col === NAME_COL) {
        setCellStyle(ws, row, col, DATA_LEFT);
      } else if (col === QTY_COL) {
        setCellStyle(ws, row, col, DATA_RIGHT);
      } else {
        setCellStyle(ws, row, col, DATA_CENTER);
      }
    }
  }
}

export function downloadMasanInboundShortageWorkbook(
  shortages: MasanOutboundStockShortage[],
  filename = "Nhap_hang_thieu.xlsx",
): void {
  const titleRow: string[] = Array(COL_COUNT).fill("");
  titleRow[1] = BM06_IMPORT_TITLE;

  const dataRows = shortages.map((row) => {
    const cells: Array<string | number> = Array(COL_COUNT).fill("");
    cells[SKU_COL] = row.sku;
    cells[NAME_COL] = row.item_name ?? "";
    cells[LOT_STATUS_COL] = "GOOD";
    cells[QTY_COL] = row.shortage;
    return cells;
  });

  const rows = [titleRow, [...BM06_IMPORT_HEADERS], ...dataRows];
  const ws = XLSXStyle.utils.aoa_to_sheet(rows);

  ws["!merges"] = [
    { s: { r: 0, c: 1 }, e: { r: 0, c: COL_COUNT - 1 } },
  ];
  ws["!cols"] = [
    { wch: 14 },
    { wch: 12 },
    { wch: 30 },
    { wch: 30 },
    { wch: 14 },
    { wch: 14 },
    { wch: 12 },
    { wch: 45 },
    { wch: 10 },
    { wch: 12 },
    { wch: 10 },
    { wch: 10 },
    { wch: 14 },
    { wch: 14 },
  ];
  ws["!rows"] = [
    { hpt: 42 },
    { hpt: 28 },
    ...dataRows.map(() => ({ hpt: 20 })),
  ];
  ws["!freeze"] = { xSplit: 0, ySplit: 2, topLeftCell: "A3", activePane: "bottomLeft" };

  applyBm06Styles(ws, dataRows.length);

  const wb = XLSXStyle.utils.book_new();
  XLSXStyle.utils.book_append_sheet(wb, ws, "Nhap");
  XLSXStyle.writeFile(wb, filename);
}
