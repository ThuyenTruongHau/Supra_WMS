import * as XLSX from "xlsx";
import type { Product } from "@/types/product";
import type { DetailGroupInput } from "@/types/outbound";
import {
  normalizeHeaderCell,
  parsePositiveInteger,
} from "@/utils/inboundExcelImport";
import { resolveTotalAndPalletCount } from "@/utils/palletQuantity";

const HEADER_SCAN_LIMIT = 30;

const TEMPLATE_TITLE_KEYWORDS = ["bieu mau list xe xuat hang", "list xe xuat hang"] as const;

export type OutboundColumnMap = {
  vehicleNumber?: number;
  customerName?: number;
  tripCode?: number;
  carrierName?: number;
  sku?: number;
  productName?: number;
  lotNumber?: number;
  quantity?: number;
  palletCount?: number;
  locator?: number;
};

export type ParsedOutboundRow = {
  excelRowNumber: number;
  vehicleNumber: string;
  customerName: string;
  tripCode: string;
  carrierName: string;
  sku: string;
  productName: string;
  lotNumber: string;
  totalQuantity: number;
  palletCount: number | null;
  locator: string;
};

export type OutboundImportPreviewRow = {
  excelRowNumber: number;
  vehicleNumber: string;
  customerName: string;
  tripCode: string;
  carrierName: string;
  sku: string;
  productName: string;
  lotNumber: string;
  totalQuantity: number;
  palletCount: number | null;
  locator: string;
  dbProductName: string;
  nameMismatch: boolean;
};

export type ImportError = {
  excelRowNumber?: number;
  message: string;
};

export type OutboundExcelParseResult = {
  detail_groups: DetailGroupInput[];
  errors: ImportError[];
  warnings: ImportError[];
  previewRows: OutboundImportPreviewRow[];
};

function cellToString(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function formatTripFromCell(cell: XLSX.CellObject | undefined, matrixValue: unknown): string {
  if (!cell && matrixValue == null) return "";
  if (cell?.t === "n" && cell.v != null) {
    const num = Number(cell.v);
    if (Number.isFinite(num)) {
      if (Number.isInteger(num)) return String(num);
      return num.toFixed(0);
    }
  }
  if (cell?.w != null && cell.w !== "") return String(cell.w).trim();
  return cellToString(matrixValue);
}

function formatLotFromCell(cell: XLSX.CellObject | undefined): string {
  if (!cell) return "";
  if (cell.t === "d" && cell.v instanceof Date) {
    const day = String(cell.v.getDate()).padStart(2, "0");
    const month = String(cell.v.getMonth() + 1).padStart(2, "0");
    const year = String(cell.v.getFullYear()).slice(-2);
    return `${day}${month}${year}`;
  }
  if (cell.t === "n" && cell.v != null) {
    const num = Number(cell.v);
    if (Number.isInteger(num)) return String(num);
  }
  if (cell.w != null && cell.w !== "") return String(cell.w).trim();
  return cellToString(cell.v);
}

function formatSkuFromCell(cell: XLSX.CellObject | undefined): string {
  if (!cell) return "";
  if (cell.w != null && cell.w !== "") return String(cell.w).trim();
  return cellToString(cell.v);
}

function getWorksheetCell(
  worksheet: XLSX.WorkSheet,
  rowIndex: number,
  colIndex: number,
): XLSX.CellObject | undefined {
  const address = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
  return worksheet[address];
}

function mapHeaderColumns(headerRow: unknown[]): OutboundColumnMap {
  const columnMap: OutboundColumnMap = {};

  headerRow.forEach((cell, index) => {
    const normalized = normalizeHeaderCell(cell);
    if (!normalized) return;

    if (normalized.includes("so xe") || normalized === "soxe") {
      columnMap.vehicleNumber = index;
      return;
    }
    if (normalized.includes("ten khach hang") || normalized.includes("khach hang")) {
      columnMap.customerName = index;
      return;
    }
    if (normalized === "trip" || normalized.includes("trip")) {
      columnMap.tripCode = index;
      return;
    }
    if (normalized === "nvt" || normalized.includes("nha van tai")) {
      columnMap.carrierName = index;
      return;
    }
    if (normalized.includes("ma item")) {
      columnMap.sku = index;
      return;
    }
    if (normalized.includes("ten item")) {
      columnMap.productName = index;
      return;
    }
    if (
      (normalized === "lot" || normalized.endsWith(" lot")) &&
      columnMap.lotNumber === undefined
    ) {
      columnMap.lotNumber = index;
      return;
    }
    if (normalized.includes("so luong")) {
      columnMap.quantity = index;
      return;
    }
    if (normalized.includes("so pallet")) {
      columnMap.palletCount = index;
      return;
    }
    if (normalized.includes("locator")) {
      columnMap.locator = index;
      return;
    }
  });

  return columnMap;
}

function isTemplateTitleRow(row: unknown[]): boolean {
  const normalized = row.map(normalizeHeaderCell).join(" ");
  return TEMPLATE_TITLE_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

export function detectOutboundHeaderRow(sheet: unknown[][]): {
  headerRowIndex: number;
  columnMap: OutboundColumnMap;
} | null {
  const scanLimit = Math.min(sheet.length, HEADER_SCAN_LIMIT);

  for (let rowIndex = 0; rowIndex < scanLimit; rowIndex += 1) {
    const row = sheet[rowIndex] ?? [];
    if (isTemplateTitleRow(row)) continue;

    const columnMap = mapHeaderColumns(row);
    if (columnMap.sku == null || columnMap.quantity == null) continue;
    if (columnMap.vehicleNumber == null || columnMap.customerName == null) continue;

    return { headerRowIndex: rowIndex, columnMap };
  }

  return null;
}

function readRowCell(
  worksheet: XLSX.WorkSheet,
  rowIndex: number,
  colIndex: number | undefined,
  matrixValue: unknown,
  mode: "text" | "number" | "lot" | "sku" | "trip" = "text",
): string {
  if (colIndex == null) return "";

  const cell = getWorksheetCell(worksheet, rowIndex, colIndex);
  if (mode === "lot") return formatLotFromCell(cell);
  if (mode === "sku") return formatSkuFromCell(cell);
  if (mode === "trip") return formatTripFromCell(cell, matrixValue);
  if (mode === "number") {
    const raw = cell?.v ?? matrixValue;
    const num = parsePositiveInteger(raw);
    return num == null ? cellToString(matrixValue) : String(num);
  }

  if (cell?.w != null && cell.w !== "") return String(cell.w).trim();
  return cellToString(matrixValue);
}

function isDuplicateHeaderRow(row: unknown[], columnMap: OutboundColumnMap): boolean {
  const skuCell = normalizeHeaderCell(row[columnMap.sku!]);
  return skuCell.includes("ma item");
}

export function parseOutboundExcelRows(
  sheet: unknown[][],
  worksheet: XLSX.WorkSheet,
  columnMap: OutboundColumnMap,
  startRow: number,
): { rows: ParsedOutboundRow[]; errors: ImportError[] } {
  const rows: ParsedOutboundRow[] = [];
  const errors: ImportError[] = [];

  let lastVehicle = "";
  let lastCustomer = "";
  let lastTrip = "";
  let lastCarrier = "";
  let lastLot = "";

  for (let rowIndex = startRow; rowIndex < sheet.length; rowIndex += 1) {
    const row = sheet[rowIndex] ?? [];
    if (isDuplicateHeaderRow(row, columnMap)) continue;

    const sku = readRowCell(
      worksheet,
      rowIndex,
      columnMap.sku,
      row[columnMap.sku!],
      "sku",
    );
    if (!sku) {
      const hasAnyValue = row.some((cell) => cellToString(cell) !== "");
      if (!hasAnyValue) continue;
      errors.push({
        excelRowNumber: rowIndex + 1,
        message: "Thiếu Mã Item",
      });
      continue;
    }

    const vehicleRaw = readRowCell(
      worksheet,
      rowIndex,
      columnMap.vehicleNumber,
      row[columnMap.vehicleNumber!],
    );
    if (vehicleRaw) lastVehicle = vehicleRaw;
    const customerRaw = readRowCell(
      worksheet,
      rowIndex,
      columnMap.customerName,
      row[columnMap.customerName!],
    );
    if (customerRaw) lastCustomer = customerRaw;

    const tripRaw = readRowCell(
      worksheet,
      rowIndex,
      columnMap.tripCode,
      row[columnMap.tripCode!],
      "trip",
    );
    if (tripRaw) lastTrip = tripRaw;

    const carrierRaw = readRowCell(
      worksheet,
      rowIndex,
      columnMap.carrierName,
      row[columnMap.carrierName!],
    );
    if (carrierRaw) lastCarrier = carrierRaw;

    const lotRaw = readRowCell(
      worksheet,
      rowIndex,
      columnMap.lotNumber,
      row[columnMap.lotNumber!],
      "lot",
    );
    if (lotRaw) lastLot = lotRaw;

    if (!lastVehicle) {
      errors.push({
        excelRowNumber: rowIndex + 1,
        message: "Thiếu Số xe",
      });
      continue;
    }
    if (!lastCustomer) {
      errors.push({
        excelRowNumber: rowIndex + 1,
        message: "Thiếu Tên khách hàng",
      });
      continue;
    }

    const quantityRaw = readRowCell(
      worksheet,
      rowIndex,
      columnMap.quantity,
      row[columnMap.quantity!],
      "number",
    );
    const quantity = parsePositiveInteger(quantityRaw);
    if (quantity == null) {
      errors.push({
        excelRowNumber: rowIndex + 1,
        message: `Số lượng không hợp lệ (Mã Item: ${sku})`,
      });
      continue;
    }

    const palletRaw =
      columnMap.palletCount != null
        ? readRowCell(
            worksheet,
            rowIndex,
            columnMap.palletCount,
            row[columnMap.palletCount],
            "number",
          )
        : "";
    const rawPallet = palletRaw !== "" ? parsePositiveInteger(palletRaw) : null;
    if (palletRaw !== "" && rawPallet == null) {
      errors.push({
        excelRowNumber: rowIndex + 1,
        message: `Số pallet không hợp lệ (Mã Item: ${sku})`,
      });
      continue;
    }

    let totalQuantity = quantity;
    let palletCount: number | null = null;
    if (rawPallet != null) {
      const resolved = resolveTotalAndPalletCount(quantity, rawPallet);
      totalQuantity = resolved.totalQuantity;
      palletCount = resolved.palletCount;
    }

    rows.push({
      excelRowNumber: rowIndex + 1,
      vehicleNumber: lastVehicle,
      customerName: lastCustomer,
      tripCode: lastTrip,
      carrierName: lastCarrier,
      sku,
      productName: readRowCell(
        worksheet,
        rowIndex,
        columnMap.productName,
        columnMap.productName != null ? row[columnMap.productName] : "",
      ),
      lotNumber: lastLot,
      totalQuantity,
      palletCount,
      locator: readRowCell(
        worksheet,
        rowIndex,
        columnMap.locator,
        columnMap.locator != null ? row[columnMap.locator] : "",
      ),
    });
  }

  return { rows, errors };
}

function buildProductsBySku(products: Product[]): Map<string, Product> {
  const map = new Map<string, Product>();
  for (const product of products) {
    const sku = product.sku.trim();
    map.set(sku, product);
    map.set(sku.toUpperCase(), product);
  }
  return map;
}

function groupKey(row: ParsedOutboundRow): string {
  return [
    row.vehicleNumber,
    row.customerName,
    row.tripCode,
    row.carrierName,
    row.lotNumber,
  ].join("||");
}

export function buildDetailGroupsFromRows(
  rows: ParsedOutboundRow[],
  productsBySku: Map<string, Product>,
): {
  detail_groups: DetailGroupInput[];
  errors: ImportError[];
  warnings: ImportError[];
  previewRows: OutboundImportPreviewRow[];
} {
  const errors: ImportError[] = [];
  const warnings: ImportError[] = [];
  const previewRows: OutboundImportPreviewRow[] = [];
  const groupMap = new Map<string, DetailGroupInput>();

  for (const row of rows) {
    const product =
      productsBySku.get(row.sku) ?? productsBySku.get(row.sku.toUpperCase());
    if (!product) {
      errors.push({
        excelRowNumber: row.excelRowNumber,
        message: `Không tìm thấy sản phẩm với Mã Item "${row.sku}" trong kho đang chọn`,
      });
      continue;
    }

    const nameMismatch =
      row.productName !== "" &&
      normalizeHeaderCell(row.productName) !==
        normalizeHeaderCell(product.name);

    if (nameMismatch) {
      warnings.push({
        excelRowNumber: row.excelRowNumber,
        message: `Tên Item "${row.productName}" khác tên trong hệ thống "${product.name}" (Mã Item: ${row.sku})`,
      });
    }

    previewRows.push({
      excelRowNumber: row.excelRowNumber,
      vehicleNumber: row.vehicleNumber,
      customerName: row.customerName,
      tripCode: row.tripCode,
      carrierName: row.carrierName,
      sku: row.sku,
      productName: row.productName || product.name,
      lotNumber: row.lotNumber,
      totalQuantity: row.totalQuantity,
      palletCount: row.palletCount,
      locator: row.locator,
      dbProductName: product.name,
      nameMismatch,
    });

    const key = groupKey(row);
    let group = groupMap.get(key);
    if (!group) {
      group = {
        customer_name: row.customerName,
        vehicle_number: row.vehicleNumber,
        carrier_name: row.carrierName || null,
        trip_code: row.tripCode || null,
        lot_number: row.lotNumber || null,
        items: [],
      };
      groupMap.set(key, group);
    }

    group.items.push({
      product_id: product.id,
      requested_quantity: row.totalQuantity,
      pallet_quantity: row.palletCount,
      locator: row.locator || null,
    });
  }

  return {
    detail_groups: Array.from(groupMap.values()),
    errors,
    warnings,
    previewRows,
  };
}

export async function parseOutboundExcelFile(
  file: File,
  products: Product[],
): Promise<OutboundExcelParseResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return {
      detail_groups: [],
      errors: [{ message: "File Excel trống hoặc không có dữ liệu" }],
      warnings: [],
      previewRows: [],
    };
  }

  const worksheet = workbook.Sheets[sheetName];
  const sheet = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    defval: "",
    raw: false,
  });

  const header = detectOutboundHeaderRow(sheet);
  if (!header) {
    return {
      detail_groups: [],
      errors: [
        {
          message:
            "Không nhận diện được biểu mẫu xuất hàng. File cần có Số xe, Tên khách hàng, Mã Item, Số lượng...",
        },
      ],
      warnings: [],
      previewRows: [],
    };
  }

  const { rows, errors: rowErrors } = parseOutboundExcelRows(
    sheet,
    worksheet,
    header.columnMap,
    header.headerRowIndex + 1,
  );

  const productsBySku = buildProductsBySku(products);
  const built = buildDetailGroupsFromRows(rows, productsBySku);
  const errors = [...rowErrors, ...built.errors];

  if (built.detail_groups.length === 0 && errors.length === 0) {
    errors.push({ message: "Không có dòng dữ liệu hợp lệ để import" });
  }

  return {
    detail_groups: built.detail_groups,
    errors,
    warnings: built.warnings,
    previewRows: built.previewRows,
  };
}
