import * as XLSX from "xlsx";
import * as XLSXStyle from "xlsx-js-style";
import dayjs from "dayjs";
import type { InboundDailyReport, InboundDailyReportLine, InboundDetailReport, InboundOrder } from "@/types/inbound";
import { toDisplayInteger } from "@/utils/number";

const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: "Khởi tạo",
  receiving: "Đang nhập",
  completed: "Hoàn thành",
  cancelled: "Đã hủy",
};

function formatDateShort(value?: string | null): string {
  if (!value) return "";
  return dayjs(value).format("DD/MM/YYYY");
}

function countInboundPallets(order: InboundOrder): number {
  return order.details.reduce((sum, detail) => {
    const palletCount =
      detail.pallet_quantity != null && Number(detail.pallet_quantity) > 0
        ? Number(detail.pallet_quantity)
        : 1;
    return sum + palletCount;
  }, 0);
}

function sumInboundExpectedQuantity(order: InboundOrder): number {
  return order.details.reduce(
    (sum, detail) => sum + Number(detail.expected_quantity ?? 0),
    0,
  );
}

function toListRows(orders: InboundOrder[]) {
  return orders.map((order, index) => ({
    STT: index + 1,
    "Mã đơn nhập": order.order_code,
    "Số pallet": toDisplayInteger(countInboundPallets(order)),
    "Tổng SL": toDisplayInteger(sumInboundExpectedQuantity(order)),
    "Trạng thái": ORDER_STATUS_LABELS[order.status] ?? order.status,
    "Người tạo": order.created_by_name ?? String(order.created_by),
    "Ngày tạo": formatDateShort(order.created_at),
    "Số dòng SP": order.details.length,
  }));
}

export function downloadInboundListExcel(
  orders: InboundOrder[],
  warehouseName: string,
  tabLabel = "danh-sach",
) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(toListRows(orders)),
    "Danh sách đơn",
  );

  const dateStr = new Date().toISOString().slice(0, 10);
  const safeName = warehouseName.replace(/[^\w\u00C0-\u024f\s-]/gi, "").trim();
  const safeTab = tabLabel.replace(/[^\w-]/gi, "_");
  XLSX.writeFile(
    workbook,
    `don-nhap_${safeTab}_${safeName || "kho"}_${dateStr}.xlsx`,
  );
}

const REPORT_HEADERS = [
  "STT",
  "Mã Item",
  "Tên Item",
  "LOT",
  "Lot status",
  "Số lượng",
  "Số pallet",
  "Locator",
  "Trạng thái",
] as const;

const REPORT_COL_COUNT = REPORT_HEADERS.length;
const NAME_ITEM_COL = 2;
const LOCATOR_COL = 7;

const THIN_BORDER = {
  top: { style: "thin", color: { rgb: "000000" } },
  bottom: { style: "thin", color: { rgb: "000000" } },
  left: { style: "thin", color: { rgb: "000000" } },
  right: { style: "thin", color: { rgb: "000000" } },
};

const TITLE_STYLE = {
  font: { bold: true, sz: 12, name: "Arial" },
  alignment: { horizontal: "center", vertical: "center", wrapText: true },
};

const SUBTITLE_STYLE = {
  font: { sz: 11, name: "Arial" },
  alignment: { horizontal: "center", vertical: "center", wrapText: true },
};

const HEADER_STYLE = {
  font: { bold: true, sz: 11, name: "Arial", color: { rgb: "000000" } },
  fill: { fgColor: { rgb: "FFFF00" }, patternType: "solid" },
  alignment: { horizontal: "center", vertical: "center", wrapText: true },
  border: THIN_BORDER,
};

const DATA_CENTER_STYLE = {
  font: { sz: 11, name: "Arial" },
  alignment: { horizontal: "center", vertical: "center" },
  border: THIN_BORDER,
};

const DATA_LEFT_WRAP_STYLE = {
  font: { sz: 11, name: "Arial" },
  alignment: { horizontal: "left", vertical: "center", wrapText: true },
  border: THIN_BORDER,
};

const DATA_LEFT_STYLE = {
  font: { sz: 11, name: "Arial" },
  alignment: { horizontal: "left", vertical: "center" },
  border: THIN_BORDER,
};

function setCellStyle(
  worksheet: XLSXStyle.WorkSheet,
  row: number,
  col: number,
  style: object,
) {
  const address = XLSXStyle.utils.encode_cell({ r: row, c: col });
  if (!worksheet[address]) {
    worksheet[address] = { t: "s", v: "" };
  }
  worksheet[address].s = style;
}

function applyInventoryAdjustmentStyles(
  worksheet: XLSXStyle.WorkSheet,
  rowCount: number,
) {
  for (let row = 0; row < rowCount; row += 1) {
    for (let col = 0; col < REPORT_COL_COUNT; col += 1) {
      if (row === 0) {
        setCellStyle(worksheet, row, col, TITLE_STYLE);
        continue;
      }
      if (row === 1) {
        setCellStyle(worksheet, row, col, SUBTITLE_STYLE);
        continue;
      }
      if (row === 2) {
        setCellStyle(worksheet, row, col, HEADER_STYLE);
        continue;
      }

      if (col === NAME_ITEM_COL) {
        setCellStyle(worksheet, row, col, DATA_LEFT_WRAP_STYLE);
      } else if (col === LOCATOR_COL) {
        setCellStyle(worksheet, row, col, DATA_LEFT_STYLE);
      } else {
        setCellStyle(worksheet, row, col, DATA_CENTER_STYLE);
      }
    }
  }
}

function buildDetailReportSheet(report: InboundDetailReport): XLSXStyle.WorkSheet {
  const rows: (string | number)[][] = [
    [report.title],
    [report.subtitle],
    [...REPORT_HEADERS],
    ...report.lines.map((line) => [
      line.stt,
      line.item_code,
      line.item_name,
      line.lot?.trim() ?? "",
      line.lot_status || "GOOD",
      toDisplayInteger(line.quantity),
      line.pallet_count,
      line.locator || "...",
      line.status_display || "Chưa nhập",
    ]),
  ];

  const worksheet = XLSXStyle.utils.aoa_to_sheet(rows);
  worksheet["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: REPORT_COL_COUNT - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: REPORT_COL_COUNT - 1 } },
  ];
  worksheet["!cols"] = [
    { wch: 6 },
    { wch: 14 },
    { wch: 52 },
    { wch: 12 },
    { wch: 12 },
    { wch: 10 },
    { wch: 10 },
    { wch: 16 },
    { wch: 14 },
  ];
  worksheet["!rows"] = [
    { hpt: 24 },
    { hpt: 20 },
    { hpt: 22 },
    ...rows.slice(3).map(() => ({ hpt: 30 })),
  ];

  applyInventoryAdjustmentStyles(worksheet, rows.length);
  return worksheet;
}

export function downloadInboundDetailReportExcel(report: InboundDetailReport) {
  const workbook = XLSXStyle.utils.book_new();
  XLSXStyle.utils.book_append_sheet(
    workbook,
    buildDetailReportSheet(report),
    "Inventory Adjustment",
  );

  const dateStr = dayjs().format("DD_MM_YYYY");
  XLSXStyle.writeFile(workbook, `Inventory_Adjustment_${dateStr}.xlsx`);
}

const DAILY_REPORT_HEADERS = [
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
  "Locator",
  "Trạng thái",
] as const;

const DAILY_COL_COUNT = DAILY_REPORT_HEADERS.length;
const DAILY_NAME_ITEM_COL = 7;
const DAILY_LOCATOR_COL = 12;
const DAILY_GROUP_COLS = [0, 1, 2] as const;

const GROUP_FILL_WHITE = { fgColor: { rgb: "FFFFFF" }, patternType: "solid" as const };
const GROUP_FILL_GREEN = { fgColor: { rgb: "E2EFDA" }, patternType: "solid" as const };

function dailyGroupKey(line: InboundDailyReportLine): string {
  return [
    line.customer_import_time_display,
    line.vehicle_number,
    line.export_warehouse,
  ].join("|");
}

function buildDailyGroupMerges(
  lines: InboundDailyReportLine[],
  dataStartRow: number,
): XLSXStyle.Range[] {
  const merges: XLSXStyle.Range[] = [];
  let groupStart = 0;

  for (let index = 1; index <= lines.length; index += 1) {
    const prev = lines[index - 1];
    const curr = lines[index];
    const sameGroup = curr != null && dailyGroupKey(prev) === dailyGroupKey(curr);
    if (sameGroup) continue;

    const groupLength = index - groupStart;
    if (groupLength > 1) {
      for (const col of DAILY_GROUP_COLS) {
        merges.push({
          s: { r: dataStartRow + groupStart, c: col },
          e: { r: dataStartRow + index - 1, c: col },
        });
      }
    }
    groupStart = index;
  }

  return merges;
}

function buildDailyDataRow(
  line: InboundDailyReportLine,
  isGroupStart: boolean,
): (string | number)[] {
  return [
    isGroupStart ? line.customer_import_time_display : "",
    isGroupStart ? line.vehicle_number : "",
    isGroupStart ? line.export_warehouse : "",
    line.import_warehouse,
    line.delivery_code,
    line.carrier_name,
    line.item_code,
    line.item_name,
    line.lot?.trim() ?? "",
    line.lot_status || "GOOD",
    toDisplayInteger(line.quantity),
    line.pallet_count,
    line.locator || "...",
    line.status_display || "Chưa nhập",
  ];
}

function getDailyGroupIndex(lines: InboundDailyReportLine[], lineIndex: number): number {
  let groupIndex = 0;
  for (let index = 1; index <= lineIndex; index += 1) {
    if (dailyGroupKey(lines[index]) !== dailyGroupKey(lines[index - 1])) {
      groupIndex += 1;
    }
  }
  return groupIndex;
}

function applyDailyReportStyles(
  worksheet: XLSXStyle.WorkSheet,
  lines: InboundDailyReportLine[],
  dataStartRow: number,
) {
  const totalRows = dataStartRow + lines.length;

  for (let row = 0; row < totalRows; row += 1) {
    for (let col = 0; col < DAILY_COL_COUNT; col += 1) {
      if (row === 0) {
        setCellStyle(worksheet, row, col, TITLE_STYLE);
        continue;
      }
      if (row === 1) {
        setCellStyle(worksheet, row, col, SUBTITLE_STYLE);
        continue;
      }
      if (row === 2) {
        setCellStyle(worksheet, row, col, HEADER_STYLE);
        continue;
      }

      const lineIndex = row - dataStartRow;
      const fill =
        getDailyGroupIndex(lines, lineIndex) % 2 === 0
          ? GROUP_FILL_WHITE
          : GROUP_FILL_GREEN;

      const baseStyle =
        col === DAILY_NAME_ITEM_COL
          ? { ...DATA_LEFT_WRAP_STYLE, fill }
          : col === DAILY_LOCATOR_COL
            ? { ...DATA_LEFT_STYLE, fill }
            : { ...DATA_CENTER_STYLE, fill };

      setCellStyle(worksheet, row, col, baseStyle);
    }
  }
}

function buildDailyReportSheet(report: InboundDailyReport): XLSXStyle.WorkSheet {
  const dataStartRow = 3;
  const dataRows = report.lines.map((line, index, arr) =>
    buildDailyDataRow(
      line,
      index === 0 || dailyGroupKey(line) !== dailyGroupKey(arr[index - 1]),
    ),
  );

  const rows: (string | number)[][] = [
    [report.title],
    [report.subtitle],
    [...DAILY_REPORT_HEADERS],
    ...dataRows,
  ];

  const worksheet = XLSXStyle.utils.aoa_to_sheet(rows);
  worksheet["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: DAILY_COL_COUNT - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: DAILY_COL_COUNT - 1 } },
    ...buildDailyGroupMerges(report.lines, dataStartRow),
  ];
  worksheet["!cols"] = [
    { wch: 14 },
    { wch: 12 },
    { wch: 14 },
    { wch: 14 },
    { wch: 12 },
    { wch: 16 },
    { wch: 14 },
    { wch: 48 },
    { wch: 10 },
    { wch: 12 },
    { wch: 10 },
    { wch: 10 },
    { wch: 14 },
    { wch: 14 },
  ];
  worksheet["!rows"] = [
    { hpt: 24 },
    { hpt: 20 },
    { hpt: 22 },
    ...dataRows.map(() => ({ hpt: 34 })),
  ];

  applyDailyReportStyles(worksheet, report.lines, dataStartRow);
  return worksheet;
}

export function downloadInboundDailyReportExcel(report: InboundDailyReport) {
  const workbook = XLSXStyle.utils.book_new();
  XLSXStyle.utils.book_append_sheet(
    workbook,
    buildDailyReportSheet(report),
    "Bao cao nhap theo ngay",
  );

  const dateStr = dayjs(report.report_date).format("DD_MM_YYYY");
  XLSXStyle.writeFile(workbook, `Inventory_inbound_overall_${dateStr}.xlsx`);
}
