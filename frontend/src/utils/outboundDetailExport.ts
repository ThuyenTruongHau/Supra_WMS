import * as XLSXStyle from "xlsx-js-style";
import dayjs from "dayjs";
import type { ItemOutbound, OutboundOrder } from "@/types/outbound";
import {
  groupDetailGroupsByCustomer,
  type CustomerViewNode,
  type VehicleInfoBlock,
} from "@/utils/outboundViewTransform";
import { effectivePalletQuantity } from "@/utils/palletQuantity";
import { toDisplayInteger } from "@/utils/number";

const TITLE = "BIỂU MẪU LẤY HÀNG THEO SO";
const SUBTITLE = "(Cung cấp thông tin xuất hàng)";

const TABLE_HEADERS = [
  "STT",
  "Mã Item",
  "Tên Item",
  "LOT",
  "Lot status",
  "Số lượng",
  "Số pallet",
  "Locator",
] as const;

const COL_COUNT = TABLE_HEADERS.length;
const NAME_ITEM_COL = 2;
const LOCATOR_COL = 7;

const INFO_LEFT_END_COL = 3;
const INFO_RIGHT_START_COL = 4;
const INFO_RIGHT_END_COL = 7;

const INFO_START_ROW = 2;
const TABLE_HEADER_ROW = 5;
const DATA_START_ROW = 6;

const THIN_BORDER = {
  top: { style: "thin", color: { rgb: "000000" } },
  bottom: { style: "thin", color: { rgb: "000000" } },
  left: { style: "thin", color: { rgb: "000000" } },
  right: { style: "thin", color: { rgb: "000000" } },
};

const TITLE_STYLE = {
  font: { bold: true, sz: 14, name: "Arial" },
  alignment: { horizontal: "center", vertical: "center", wrapText: true },
};

const SUBTITLE_STYLE = {
  font: { sz: 11, name: "Arial" },
  alignment: { horizontal: "center", vertical: "center", wrapText: true },
};

const INFO_TEXT_STYLE = {
  font: { sz: 11, name: "Arial" },
  alignment: { horizontal: "left", vertical: "center", wrapText: true },
};

const HEADER_STYLE = {
  font: { bold: true, sz: 11, name: "Arial", color: { rgb: "000000" } },
  fill: { fgColor: { rgb: "FFFF00" }, patternType: "solid" },
  alignment: { horizontal: "center", vertical: "center", wrapText: true },
  border: THIN_BORDER,
};

const DATA_CENTER_STYLE = {
  font: { sz: 11, name: "Arial" },
  alignment: { horizontal: "center", vertical: "center", wrapText: true },
  border: THIN_BORDER,
};

const DATA_LEFT_WRAP_STYLE = {
  font: { sz: 11, name: "Arial" },
  alignment: { horizontal: "left", vertical: "center", wrapText: true },
  border: THIN_BORDER,
};

const DATA_LEFT_STYLE = {
  font: { sz: 11, name: "Arial" },
  alignment: { horizontal: "left", vertical: "center", wrapText: true },
  border: THIN_BORDER,
};

type SoPickLine = {
  sku: string;
  name: string;
  lot: string;
  quantity: number;
  palletCount: number;
  locator: string;
};

type InfoLine = {
  left: string;
  right: string;
};

function setCell(
  worksheet: XLSXStyle.WorkSheet,
  row: number,
  col: number,
  value: string | number,
  style?: object,
) {
  const address = XLSXStyle.utils.encode_cell({ r: row, c: col });
  worksheet[address] = {
    t: typeof value === "number" ? "n" : "s",
    v: value,
    ...(style ? { s: style } : {}),
  };
}

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

function uniqueValues(values: Array<string | null | undefined>): string {
  const seen = new Set<string>();
  for (const value of values) {
    const text = value?.trim();
    if (text) seen.add(text);
  }
  return [...seen].join(", ");
}

function itemToLines(item: ItemOutbound, lot: string): SoPickLine[] {
  const sku = item.product_sku?.trim() ?? "";
  const name = item.product_name?.trim() ?? "";
  const lotText = lot.trim();
  const palletCount = effectivePalletQuantity(item.pallet_quantity);
  const locatorRaw = item.locator?.trim() ?? "";
  const locators = locatorRaw
    ? locatorRaw.split(",").map((part) => part.trim()).filter(Boolean)
    : [];

  if (locators.length <= 1) {
    return [
      {
        sku,
        name,
        lot: lotText,
        quantity: toDisplayInteger(item.requested_quantity),
        palletCount,
        locator: locators[0] ?? "...",
      },
    ];
  }

  const totalQty = toDisplayInteger(item.requested_quantity);
  const baseQty = Math.floor(totalQty / locators.length);
  let remainder = totalQty - baseQty * locators.length;

  return locators.map((locator, index) => {
    const extra = remainder > 0 ? 1 : 0;
    if (remainder > 0) remainder -= 1;
    const quantity = baseQty + extra;
    const pallet =
      index === 0 ? palletCount : Math.max(1, Math.round(palletCount / locators.length));
    return {
      sku,
      name,
      lot: lotText,
      quantity,
      palletCount: pallet,
      locator,
    };
  });
}

function flattenCustomerLines(vehicles: VehicleInfoBlock[]): SoPickLine[] {
  const lines: SoPickLine[] = [];

  for (const vehicle of vehicles) {
    const lot = vehicle.group.lot_number ?? "";
    for (const item of vehicle.items) {
      lines.push(...itemToLines(item, lot));
    }
  }

  return lines.sort((a, b) => {
    const skuCompare = a.sku.localeCompare(b.sku);
    if (skuCompare !== 0) return skuCompare;
    return a.locator.localeCompare(b.locator);
  });
}

function buildInfoLines(customer: CustomerViewNode): InfoLine[] {
  const orderNumber =
    uniqueValues(customer.vehicles.map((vehicle) => vehicle.trip_code)) || "—";
  const vehicleNumbers =
    uniqueValues(customer.vehicles.map((vehicle) => vehicle.vehicle_number)) || "—";
  const carrier =
    uniqueValues(customer.vehicles.map((vehicle) => vehicle.carrier_name)) || "—";

  return [
    {
      left: `Khách hàng: ${customer.customer_name}`,
      right: `Số đơn hàng: ${orderNumber}`,
    },
    {
      left: "Địa chỉ giao hàng: —",
      right: "",
    },
    {
      left: `Đơn vị vận chuyển: ${carrier}`,
      right: `Số xe: ${vehicleNumbers}`,
    },
  ];
}

function writeInfoBlock(worksheet: XLSXStyle.WorkSheet, infoLines: InfoLine[]) {
  infoLines.forEach((line, index) => {
    const row = INFO_START_ROW + index;
    setCell(worksheet, row, 0, line.left, INFO_TEXT_STYLE);
    if (line.right) {
      setCell(worksheet, row, INFO_RIGHT_START_COL, line.right, INFO_TEXT_STYLE);
    }
  });
}

function buildMerges(dataRowCount: number): XLSXStyle.Range[] {
  const merges: XLSXStyle.Range[] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: COL_COUNT - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: COL_COUNT - 1 } },
  ];

  for (let index = 0; index < 3; index += 1) {
    const row = INFO_START_ROW + index;
    merges.push({
      s: { r: row, c: 0 },
      e: { r: row, c: INFO_LEFT_END_COL },
    });
    merges.push({
      s: { r: row, c: INFO_RIGHT_START_COL },
      e: { r: row, c: INFO_RIGHT_END_COL },
    });
  }

  return merges;
}

function applySheetStyles(
  worksheet: XLSXStyle.WorkSheet,
  dataRowCount: number,
) {
  const totalRows = DATA_START_ROW + dataRowCount;

  for (let row = 0; row < totalRows; row += 1) {
    for (let col = 0; col < COL_COUNT; col += 1) {
      if (row === 0) {
        setCellStyle(worksheet, row, col, TITLE_STYLE);
        continue;
      }
      if (row === 1) {
        setCellStyle(worksheet, row, col, SUBTITLE_STYLE);
        continue;
      }
      if (row >= INFO_START_ROW && row <= INFO_START_ROW + 2) {
        if (col <= INFO_LEFT_END_COL || col >= INFO_RIGHT_START_COL) {
          setCellStyle(worksheet, row, col, INFO_TEXT_STYLE);
        }
        continue;
      }
      if (row === TABLE_HEADER_ROW) {
        setCellStyle(worksheet, row, col, HEADER_STYLE);
        continue;
      }
      if (row < DATA_START_ROW) continue;

      const baseStyle =
        col === NAME_ITEM_COL
          ? DATA_LEFT_WRAP_STYLE
          : col === LOCATOR_COL
            ? DATA_LEFT_STYLE
            : DATA_CENTER_STYLE;
      setCellStyle(worksheet, row, col, baseStyle);
    }
  }
}

function buildCustomerSheet(customer: CustomerViewNode): XLSXStyle.WorkSheet {
  const lines = flattenCustomerLines(customer.vehicles);
  const infoLines = buildInfoLines(customer);

  const dataRows = lines.map((line, index) => [
    index + 1,
    line.sku,
    line.name,
    line.lot,
    "GOOD",
    line.quantity,
    line.palletCount,
    line.locator,
  ]);

  const rows: (string | number)[][] = [
    [TITLE],
    [SUBTITLE],
    [],
    [],
    [],
    [...TABLE_HEADERS],
    ...dataRows,
  ];

  const worksheet = XLSXStyle.utils.aoa_to_sheet(rows);
  writeInfoBlock(worksheet, infoLines);

  worksheet["!merges"] = buildMerges(dataRows.length);
  worksheet["!cols"] = [
    { wch: 7 },
    { wch: 14 },
    { wch: 52 },
    { wch: 11 },
    { wch: 13 },
    { wch: 11 },
    { wch: 11 },
    { wch: 14 },
  ];
  worksheet["!rows"] = [
    { hpt: 30 },
    { hpt: 22 },
    { hpt: 28 },
    { hpt: 28 },
    { hpt: 28 },
    { hpt: 28 },
    ...dataRows.map(() => ({ hpt: 42 })),
  ];

  applySheetStyles(worksheet, dataRows.length);
  return worksheet;
}

function sanitizeSheetName(name: string, index: number): string {
  const cleaned = name
    .replace(/[\\/*?:[\]]/g, "")
    .trim()
    .slice(0, 28);
  return cleaned || `KH_${index + 1}`;
}

function uniqueSheetName(
  customerName: string,
  index: number,
  usedNames: Set<string>,
): string {
  const base = sanitizeSheetName(customerName, index);
  let candidate = base;
  let suffix = 2;

  while (usedNames.has(candidate)) {
    const tail = `_${suffix}`;
    candidate = `${base.slice(0, Math.max(1, 31 - tail.length))}${tail}`;
    suffix += 1;
  }

  usedNames.add(candidate);
  return candidate;
}

export function downloadOutboundDetailExcel(order: OutboundOrder) {
  const customers = groupDetailGroupsByCustomer(order.detail_groups);
  const workbook = XLSXStyle.utils.book_new();
  const usedSheetNames = new Set<string>();

  if (customers.length === 0) {
    const emptySheet = XLSXStyle.utils.aoa_to_sheet([
      [TITLE],
      [SUBTITLE],
      [],
      ["Không có dữ liệu khách hàng trong đơn này."],
    ]);
    XLSXStyle.utils.book_append_sheet(workbook, emptySheet, "Trong_don");
  } else {
    customers.forEach((customer, index) => {
      const sheet = buildCustomerSheet(customer);
      const sheetName = uniqueSheetName(customer.customer_name, index, usedSheetNames);
      XLSXStyle.utils.book_append_sheet(workbook, sheet, sheetName);
    });
  }

  const dateStr = dayjs().format("DD_MM_YYYY");
  const safeCode = order.order_code.replace(/[^\w-]/gi, "_");
  XLSXStyle.writeFile(
    workbook,
    `Lay_hang_theo_SO_${safeCode}_${dateStr}.xlsx`,
  );
}
