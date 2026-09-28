import * as XLSXStyle from "xlsx-js-style";
import dayjs from "dayjs";
import type { OutboundDailyReport, OutboundDailyReportLine } from "@/types/outbound";
import { toDisplayInteger } from "@/utils/number";

const DAILY_REPORT_HEADERS = [
  "Ngày/ Giờ chi tiết",
  "Số xe",
  "Tên khách hàng",
  "SO number",
  "NVT",
  "Mã item",
  "Tên item",
  "LOT",
  "Lot status",
  "Số lượng",
  "Số pallet",
  "Locator",
] as const;

const DAILY_COL_COUNT = DAILY_REPORT_HEADERS.length;
const DAILY_NAME_ITEM_COL = 6;
const DAILY_LOCATOR_COL = 11;
const DAILY_GROUP_COLS = [0, 1, 2] as const;

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

const GROUP_FILL_WHITE = { fgColor: { rgb: "FFFFFF" }, patternType: "solid" as const };
const GROUP_FILL_GREEN = { fgColor: { rgb: "E2EFDA" }, patternType: "solid" as const };

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

function dailyGroupKey(line: OutboundDailyReportLine): string {
  return [
    line.updated_at_display,
    line.vehicle_number,
    line.customer_name,
  ].join("|");
}

function buildDailyGroupMerges(
  lines: OutboundDailyReportLine[],
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
  line: OutboundDailyReportLine,
  isGroupStart: boolean,
): (string | number)[] {
  return [
    isGroupStart ? line.updated_at_display : "",
    isGroupStart ? line.vehicle_number : "",
    isGroupStart ? line.customer_name : "",
    line.trip_code,
    line.carrier_name,
    line.item_code,
    line.item_name,
    line.lot?.trim() ?? "",
    line.lot_status || "GOOD",
    toDisplayInteger(line.quantity),
    line.pallet_count,
    line.locator || "...",
  ];
}

function getDailyGroupIndex(lines: OutboundDailyReportLine[], lineIndex: number): number {
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
  lines: OutboundDailyReportLine[],
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

function buildDailyReportSheet(report: OutboundDailyReport): XLSXStyle.WorkSheet {
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
    { wch: 18 },
    { wch: 12 },
    { wch: 16 },
    { wch: 14 },
    { wch: 16 },
    { wch: 14 },
    { wch: 48 },
    { wch: 10 },
    { wch: 12 },
    { wch: 10 },
    { wch: 10 },
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

export function downloadOutboundDailyReportExcel(report: OutboundDailyReport) {
  const workbook = XLSXStyle.utils.book_new();
  XLSXStyle.utils.book_append_sheet(
    workbook,
    buildDailyReportSheet(report),
    "Bao cao xuat theo ngay",
  );

  const dateStr = dayjs(report.report_date).format("DD_MM_YYYY");
  XLSXStyle.writeFile(workbook, `Inventory_outbound_overall_${dateStr}.xlsx`);
}
