import * as XLSX from "xlsx";
import type { Product } from "@/types/product";
import type { InboundDetailInput, InboundExcelTemplate } from "@/types/inbound";
import type { WarehouseLocation } from "@/types/warehouseLocation";

const HEADER_SCAN_LIMIT = 30;

const LEGACY_HEADER_KEYWORDS = [
  "ma item",
  "ten item",
  "so luong",
  "so pallet",
  "lot",
] as const;

const LEGACY_TITLE_KEYWORDS = ["bieu mau nhap hang", "nhap hang"] as const;

const DAILY_TITLE_KEYWORDS = [
  "bieu mau bao cao nhap theo ngay",
  "bao cao nhap theo ngay",
] as const;

export type InboundColumnMap = {
  customerImportTime?: number;
  vehicleNumber?: number;
  exportWarehouse?: number;
  importWarehouse?: number;
  deliveryCode?: number;
  carrierName?: number;
  locator?: number;
  sku?: number;
  productName?: number;
  lotNumber?: number;
  lotStatus?: number;
  quantity?: number;
  palletCount?: number;
  qrCode?: number;
  notes?: number;
};

export type ParsedExcelRow = {
  excelRowNumber: number;
  sku: string;
  productName: string;
  lotNumber: string;
  lotStatus: string;
  totalQuantity: number;
  palletCount: number;
  qrCode: string;
  notes: string;
  customerImportTime?: string;
};

export type ParsedDailyReportRow = ParsedExcelRow & {
  customerImportTime: string;
  vehicleNumber: string;
  exportWarehouse: string;
  importWarehouse: string;
  deliveryCode: string;
  carrierName: string;
  locator: string;
};

export type ImportPreviewRow = {
  excelRowNumber: number;
  sku: string;
  productName: string;
  dbProductName: string;
  lotNumber: string;
  lotStatus: string;
  totalQuantity: number;
  expectedQuantity: number;
  palletQuantity: number;
  nameMismatch: boolean;
  customerImportTime?: string;
  vehicleNumber?: string;
  exportWarehouse?: string;
  importWarehouse?: string;
  deliveryCode?: string;
  carrierName?: string;
  locator?: string;
  locationCode?: string;
};

export type ImportError = {
  excelRowNumber?: number;
  message: string;
};

export type InboundExcelParseResult = {
  template: InboundExcelTemplate;
  details: InboundDetailInput[];
  errors: ImportError[];
  warnings: ImportError[];
  previewRows: ImportPreviewRow[];
};

function removeDiacritics(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "");
}

export function normalizeHeaderCell(value: unknown): string {
  if (value == null) return "";
  return removeDiacritics(String(value).trim().toLowerCase());
}

function cellToString(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

export function parsePositiveInteger(value: unknown): number | null {
  if (value == null || value === "") return null;
  const num = Number(String(value).replace(/,/g, "").trim());
  if (!Number.isFinite(num) || num <= 0) return null;

  const int = Math.round(num);
  if (Math.abs(num - int) > 1e-9) return null;

  return int;
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

function formatDeliveryFromCell(cell: XLSX.CellObject | undefined, matrixValue: unknown): string {
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

function parseDateTimeToIso(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const normalized = trimmed.replace(/(\d+)h(\d+)/i, "$1:$2");
  const parsed = Date.parse(normalized);
  if (!Number.isNaN(parsed)) {
    return new Date(parsed).toISOString();
  }

  const ddMmMatch = normalized.match(
    /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  if (ddMmMatch) {
    const [, day, month, year, hour = "0", minute = "0", second = "0"] = ddMmMatch;
    const date = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    );
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  return null;
}

function parseCustomerImportTimeToIso(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const lines = trimmed
    .split(/[\r\n]+/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length >= 2) {
    const timePart = lines[1].replace(/(\d{1,2})h(\d{2})/i, "$1:$2");
    return parseDateTimeToIso(`${lines[0]} ${timePart}`);
  }

  const normalized = trimmed.replace(/(\d{1,2})h(\d{2})/gi, "$1:$2");
  return parseDateTimeToIso(normalized);
}

function formatCustomerImportTimeFromCell(
  cell: XLSX.CellObject | undefined,
  matrixValue: unknown,
): string {
  if (cell?.t === "d" && cell.v instanceof Date) {
    return cell.v.toISOString();
  }

  if (cell?.t === "n" && typeof cell.v === "number" && cell.v > 0) {
    const parsedDate = XLSX.SSF.parse_date_code(cell.v);
    if (parsedDate) {
      const date = new Date(
        Date.UTC(
          parsedDate.y,
          parsedDate.m - 1,
          parsedDate.d,
          parsedDate.H,
          parsedDate.M,
          parsedDate.S,
        ),
      );
      return date.toISOString();
    }
  }

  const candidates = [
    cell?.w != null && cell.w !== "" ? String(cell.w).trim() : "",
    cellToString(matrixValue),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const iso = parseCustomerImportTimeToIso(candidate);
    if (iso) return iso;
  }

  return "";
}

function formatEventDateTimeFromCell(
  cell: XLSX.CellObject | undefined,
  matrixValue: unknown,
): string {
  if (cell?.t === "d" && cell.v instanceof Date) {
    return cell.v.toISOString();
  }

  if (cell?.t === "n" && typeof cell.v === "number" && cell.v > 0) {
    const parsedDate = XLSX.SSF.parse_date_code(cell.v);
    if (parsedDate) {
      const date = new Date(
        Date.UTC(
          parsedDate.y,
          parsedDate.m - 1,
          parsedDate.d,
          parsedDate.H,
          parsedDate.M,
          parsedDate.S,
        ),
      );
      return date.toISOString();
    }
  }

  const candidates = [
    cell?.w != null && cell.w !== "" ? String(cell.w).trim() : "",
    cellToString(matrixValue),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const iso = parseDateTimeToIso(candidate);
    if (iso) return iso;
  }

  return "";
}

function getWorksheetCell(
  worksheet: XLSX.WorkSheet,
  rowIndex: number,
  colIndex: number,
): XLSX.CellObject | undefined {
  if (colIndex < 0) return undefined;
  const address = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
  return worksheet[address];
}

function mapHeaderColumns(headerRow: unknown[]): InboundColumnMap {
  const columnMap: InboundColumnMap = {};

  headerRow.forEach((cell, index) => {
    const normalized = normalizeHeaderCell(cell);
    if (!normalized) return;

    if (
      normalized.includes("ngay") &&
      (normalized.includes("gio") || normalized.includes("chi tiet"))
    ) {
      columnMap.customerImportTime = index;
      return;
    }
    if (normalized.includes("so xe") || normalized === "soxe") {
      columnMap.vehicleNumber = index;
      return;
    }
    if (normalized.includes("kho xuat")) {
      columnMap.exportWarehouse = index;
      return;
    }
    if (normalized.includes("kho nhap")) {
      columnMap.importWarehouse = index;
      return;
    }
    if (normalized.includes("delivery") || normalized === "trip") {
      columnMap.deliveryCode = index;
      return;
    }
    if (normalized === "nvt" || normalized.includes("nha van tai")) {
      columnMap.carrierName = index;
      return;
    }
    if (normalized.includes("locator")) {
      columnMap.locator = index;
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
    if (normalized.includes("lot status") || normalized === "lotstatus") {
      columnMap.lotStatus = index;
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
    if (normalized.includes("qr")) {
      columnMap.qrCode = index;
      return;
    }
    if (normalized.includes("ghi chu")) {
      columnMap.notes = index;
      return;
    }
  });

  return columnMap;
}

function isDailyTitleRow(row: unknown[]): boolean {
  const normalized = row.map(normalizeHeaderCell).join(" ");
  return DAILY_TITLE_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

function isLegacyTitleRow(row: unknown[]): boolean {
  const normalized = row.map(normalizeHeaderCell).join(" ");
  return LEGACY_TITLE_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

function countLegacyHeaderMatches(headerRow: unknown[]): number {
  const normalizedCells = headerRow.map(normalizeHeaderCell);
  return LEGACY_HEADER_KEYWORDS.filter((keyword) =>
    normalizedCells.some((cell) => cell.includes(keyword)),
  ).length;
}

export function detectHeaderRow(sheet: unknown[][]): {
  template: InboundExcelTemplate;
  headerRowIndex: number;
  columnMap: InboundColumnMap;
} | null {
  const scanLimit = Math.min(sheet.length, HEADER_SCAN_LIMIT);

  for (let rowIndex = 0; rowIndex < scanLimit; rowIndex += 1) {
    const row = sheet[rowIndex] ?? [];
    const columnMap = mapHeaderColumns(row);
    if (columnMap.sku == null || columnMap.quantity == null) continue;

    if (isDailyTitleRow(sheet[rowIndex - 1] ?? []) || columnMap.locator != null) {
      if (columnMap.locator == null) continue;
      return { template: "daily_report", headerRowIndex: rowIndex, columnMap };
    }

    if (isLegacyTitleRow(row) || countLegacyHeaderMatches(row) >= 2) {
      return { template: "legacy", headerRowIndex: rowIndex, columnMap };
    }
  }

  for (let rowIndex = 0; rowIndex < scanLimit; rowIndex += 1) {
    const row = sheet[rowIndex] ?? [];
    if (isDailyTitleRow(row)) continue;
    if (countLegacyHeaderMatches(row) < 2) continue;
    const columnMap = mapHeaderColumns(row);
    if (columnMap.sku == null || columnMap.quantity == null) continue;
    return { template: "legacy", headerRowIndex: rowIndex, columnMap };
  }

  return null;
}

function isDuplicateHeaderRow(row: unknown[], columnMap: InboundColumnMap): boolean {
  const skuCell = normalizeHeaderCell(row[columnMap.sku!]);
  return skuCell.includes("ma item");
}

function readRowCell(
  worksheet: XLSX.WorkSheet,
  rowIndex: number,
  colIndex: number | undefined,
  matrixValue: unknown,
  mode: "text" | "number" | "lot" | "sku" | "delivery" | "datetime" | "customerdatetime" = "text",
): string {
  if (colIndex == null) return "";

  const cell = getWorksheetCell(worksheet, rowIndex, colIndex);
  if (mode === "lot") return formatLotFromCell(cell);
  if (mode === "sku") return formatSkuFromCell(cell);
  if (mode === "delivery") return formatDeliveryFromCell(cell, matrixValue);
  if (mode === "datetime") return formatEventDateTimeFromCell(cell, matrixValue);
  if (mode === "customerdatetime") {
    return formatCustomerImportTimeFromCell(cell, matrixValue);
  }
  if (mode === "number") {
    const raw = cell?.v ?? matrixValue;
    const num = parsePositiveInteger(raw);
    return num == null ? cellToString(matrixValue) : String(num);
  }

  if (cell?.w != null && cell.w !== "") return String(cell.w).trim();
  return cellToString(matrixValue);
}

export function parseInboundExcelRows(
  sheet: unknown[][],
  worksheet: XLSX.WorkSheet,
  columnMap: InboundColumnMap,
  startRow: number,
): { rows: ParsedExcelRow[]; errors: ImportError[] } {
  const rows: ParsedExcelRow[] = [];
  const errors: ImportError[] = [];

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

    const quantityRaw = readRowCell(
      worksheet,
      rowIndex,
      columnMap.quantity,
      row[columnMap.quantity!],
      "number",
    );
    const quantity = parsePositiveInteger(quantityRaw);
    if (quantityRaw !== "" && quantity == null) {
      errors.push({
        excelRowNumber: rowIndex + 1,
        message: `Số lượng phải là số nguyên dương (Mã Item: ${sku})`,
      });
      continue;
    }
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
        message: `Số pallet phải là số nguyên dương (Mã Item: ${sku})`,
      });
      continue;
    }
    const palletCount = rawPallet ?? 1;

    const customerImportTime =
      columnMap.customerImportTime != null
        ? readRowCell(
            worksheet,
            rowIndex,
            columnMap.customerImportTime,
            row[columnMap.customerImportTime],
            "customerdatetime",
          )
        : "";

    const lotStatus = readRowCell(
      worksheet,
      rowIndex,
      columnMap.lotStatus,
      columnMap.lotStatus != null ? row[columnMap.lotStatus] : "",
    );

    rows.push({
      excelRowNumber: rowIndex + 1,
      sku,
      productName: readRowCell(
        worksheet,
        rowIndex,
        columnMap.productName,
        columnMap.productName != null ? row[columnMap.productName] : "",
      ),
      lotNumber: readRowCell(
        worksheet,
        rowIndex,
        columnMap.lotNumber,
        columnMap.lotNumber != null ? row[columnMap.lotNumber] : "",
        "lot",
      ),
      lotStatus,
      totalQuantity: quantity,
      palletCount,
      qrCode: readRowCell(
        worksheet,
        rowIndex,
        columnMap.qrCode,
        columnMap.qrCode != null ? row[columnMap.qrCode] : "",
      ),
      notes: readRowCell(
        worksheet,
        rowIndex,
        columnMap.notes,
        columnMap.notes != null ? row[columnMap.notes] : "",
      ),
      customerImportTime,
    });
  }

  return { rows, errors };
}

export function parseDailyReportExcelRows(
  sheet: unknown[][],
  worksheet: XLSX.WorkSheet,
  columnMap: InboundColumnMap,
  startRow: number,
): { rows: ParsedDailyReportRow[]; errors: ImportError[] } {
  const rows: ParsedDailyReportRow[] = [];
  const errors: ImportError[] = [];

  let lastCustomerImportTime = "";
  let lastVehicle = "";
  let lastExportWarehouse = "";
  let lastImportWarehouse = "";
  let lastDelivery = "";
  let lastCarrier = "";

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

    const customerImportRaw = readRowCell(
      worksheet,
      rowIndex,
      columnMap.customerImportTime,
      columnMap.customerImportTime != null ? row[columnMap.customerImportTime] : "",
      "customerdatetime",
    );
    if (customerImportRaw) lastCustomerImportTime = customerImportRaw;

    const vehicleRaw = readRowCell(
      worksheet,
      rowIndex,
      columnMap.vehicleNumber,
      columnMap.vehicleNumber != null ? row[columnMap.vehicleNumber] : "",
    );
    if (vehicleRaw) lastVehicle = vehicleRaw;

    const exportRaw = readRowCell(
      worksheet,
      rowIndex,
      columnMap.exportWarehouse,
      columnMap.exportWarehouse != null ? row[columnMap.exportWarehouse] : "",
    );
    if (exportRaw) lastExportWarehouse = exportRaw;

    const importRaw = readRowCell(
      worksheet,
      rowIndex,
      columnMap.importWarehouse,
      columnMap.importWarehouse != null ? row[columnMap.importWarehouse] : "",
    );
    if (importRaw) lastImportWarehouse = importRaw;

    const deliveryRaw = readRowCell(
      worksheet,
      rowIndex,
      columnMap.deliveryCode,
      columnMap.deliveryCode != null ? row[columnMap.deliveryCode] : "",
      "delivery",
    );
    if (deliveryRaw) lastDelivery = deliveryRaw;

    const carrierRaw = readRowCell(
      worksheet,
      rowIndex,
      columnMap.carrierName,
      columnMap.carrierName != null ? row[columnMap.carrierName] : "",
    );
    if (carrierRaw) lastCarrier = carrierRaw;

    const locator = readRowCell(
      worksheet,
      rowIndex,
      columnMap.locator,
      columnMap.locator != null ? row[columnMap.locator] : "",
    );

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

    const lotStatus = readRowCell(
      worksheet,
      rowIndex,
      columnMap.lotStatus,
      columnMap.lotStatus != null ? row[columnMap.lotStatus] : "",
    );

    rows.push({
      excelRowNumber: rowIndex + 1,
      sku,
      productName: readRowCell(
        worksheet,
        rowIndex,
        columnMap.productName,
        columnMap.productName != null ? row[columnMap.productName] : "",
      ),
      lotNumber: readRowCell(
        worksheet,
        rowIndex,
        columnMap.lotNumber,
        columnMap.lotNumber != null ? row[columnMap.lotNumber] : "",
        "lot",
      ),
      lotStatus,
      totalQuantity: quantity,
      palletCount: rawPallet ?? 1,
      qrCode: "",
      notes: "",
      customerImportTime: lastCustomerImportTime,
      vehicleNumber: lastVehicle,
      exportWarehouse: lastExportWarehouse,
      importWarehouse: lastImportWarehouse,
      deliveryCode: lastDelivery,
      carrierName: lastCarrier,
      locator,
    });
  }

  return { rows, errors };
}

export function splitQuantity(total: number, palletCount: number): number[] {
  const n = Math.max(1, palletCount);
  const base = Math.trunc(total / n);
  let remainder = total - base * n;

  if (base === 0 && total > 0) {
    return [];
  }

  return Array.from({ length: n }, () => {
    const extra = remainder > 0 ? 1 : 0;
    if (extra) remainder -= 1;
    return base + extra;
  });
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

function buildLocationsByCode(locations: WarehouseLocation[]): Map<string, WarehouseLocation> {
  const map = new Map<string, WarehouseLocation>();
  for (const location of locations) {
    const code = location.location_code.trim();
    if (code) {
      map.set(code, location);
      map.set(code.toUpperCase(), location);
    }

    const bin = location.bin?.trim();
    if (bin) {
      map.set(bin, location);
      map.set(bin.toUpperCase(), location);
    }

    const rowColumnBin = [location.row, location.column, location.bin]
      .map((part) => part?.trim())
      .filter((part): part is string => Boolean(part))
      .join("-");
    if (rowColumnBin) {
      map.set(rowColumnBin, location);
      map.set(rowColumnBin.toUpperCase(), location);
    }
  }
  return map;
}

export function expandRowsToDetails(
  rows: ParsedExcelRow[],
  productsBySku: Map<string, Product>,
): {
  details: InboundDetailInput[];
  errors: ImportError[];
  warnings: ImportError[];
  previewRows: ImportPreviewRow[];
} {
  const details: InboundDetailInput[] = [];
  const errors: ImportError[] = [];
  const warnings: ImportError[] = [];
  const previewRows: ImportPreviewRow[] = [];

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

    const quantities = splitQuantity(row.totalQuantity, row.palletCount);
    if (quantities.length === 0) {
      errors.push({
        excelRowNumber: row.excelRowNumber,
        message: `Không thể chia ${row.totalQuantity} cho ${row.palletCount} pallet (Mã Item: ${row.sku})`,
      });
      continue;
    }

    const nameMismatch =
      row.productName !== "" &&
      normalizeHeaderCell(row.productName) !== normalizeHeaderCell(product.name);

    if (nameMismatch) {
      warnings.push({
        excelRowNumber: row.excelRowNumber,
        message: `Tên Item "${row.productName}" khác tên trong hệ thống "${product.name}" (Mã Item: ${row.sku})`,
      });
    }

    for (const expectedQuantity of quantities) {
      details.push({
        product_id: product.id,
        expected_quantity: Math.trunc(expectedQuantity),
        lot_number: row.lotNumber || null,
        pallet_quantity: 1,
        customer_import_time: row.customerImportTime || null,
      });

      previewRows.push({
        excelRowNumber: row.excelRowNumber,
        sku: row.sku,
        productName: row.productName || product.name,
        dbProductName: product.name,
        lotNumber: row.lotNumber,
        totalQuantity: row.totalQuantity,
        expectedQuantity,
        palletQuantity: 1,
        nameMismatch,
        customerImportTime: row.customerImportTime,
      });
    }
  }

  return { details, errors, warnings, previewRows };
}

export function expandDailyRowsToDetails(
  rows: ParsedDailyReportRow[],
  productsBySku: Map<string, Product>,
  locationsByCode: Map<string, WarehouseLocation>,
): {
  details: InboundDetailInput[];
  errors: ImportError[];
  warnings: ImportError[];
  previewRows: ImportPreviewRow[];
} {
  const details: InboundDetailInput[] = [];
  const errors: ImportError[] = [];
  const warnings: ImportError[] = [];
  const previewRows: ImportPreviewRow[] = [];

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

    const locatorCode = row.locator?.trim() ?? "";
    let location: WarehouseLocation | undefined;
    if (locatorCode) {
      location =
        locationsByCode.get(locatorCode) ??
        locationsByCode.get(locatorCode.toUpperCase());
      if (!location) {
        errors.push({
          excelRowNumber: row.excelRowNumber,
          message: `Không tìm thấy Locator "${locatorCode}" trong kho đang chọn`,
        });
        continue;
      }
    }

    const nameMismatch =
      row.productName !== "" &&
      normalizeHeaderCell(row.productName) !== normalizeHeaderCell(product.name);

    if (nameMismatch) {
      warnings.push({
        excelRowNumber: row.excelRowNumber,
        message: `Tên Item "${row.productName}" khác tên trong hệ thống "${product.name}" (Mã Item: ${row.sku})`,
      });
    }

    const quantities = splitQuantity(row.totalQuantity, row.palletCount);
    if (quantities.length === 0) {
      errors.push({
        excelRowNumber: row.excelRowNumber,
        message: `Không thể chia ${row.totalQuantity} cho ${row.palletCount} pallet (Mã Item: ${row.sku})`,
      });
      continue;
    }

    const sharedDetailFields = {
      product_id: product.id,
      lot_number: row.lotNumber || null,
      customer_import_time: row.customerImportTime || null,
      vehicle_number: row.vehicleNumber || null,
      export_warehouse: row.exportWarehouse || null,
      import_warehouse: row.importWarehouse || null,
      delivery_code: row.deliveryCode || null,
      carrier_name: row.carrierName || null,
    };

    quantities.forEach((expectedQuantity, palletIndex) => {
      const isFirstPallet = palletIndex === 0;

      details.push({
        ...sharedDetailFields,
        expected_quantity: Math.trunc(expectedQuantity),
        pallet_quantity: 1,
        assigned_location_id: isFirstPallet ? (location?.id ?? null) : null,
      });

      previewRows.push({
        excelRowNumber: row.excelRowNumber,
        sku: row.sku,
        productName: row.productName || product.name,
        dbProductName: product.name,
        lotNumber: row.lotNumber,
        lotStatus: row.lotStatus,
        totalQuantity: row.totalQuantity,
        expectedQuantity,
        palletQuantity: 1,
        nameMismatch,
        customerImportTime: row.customerImportTime,
        vehicleNumber: row.vehicleNumber,
        exportWarehouse: row.exportWarehouse,
        importWarehouse: row.importWarehouse,
        deliveryCode: row.deliveryCode,
        carrierName: row.carrierName,
        locator: isFirstPallet ? locatorCode || undefined : undefined,
        locationCode: isFirstPallet ? location?.location_code : undefined,
      });
    });
  }

  return { details, errors, warnings, previewRows };
}

function sheetToMatrix(workbook: XLSX.WorkBook): {
  sheet: unknown[][];
  worksheet: XLSX.WorkSheet;
} | null {
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return null;

  const worksheet = workbook.Sheets[sheetName];
  const sheet = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    defval: "",
    raw: false,
  });

  return { sheet, worksheet };
}

export async function parseInboundExcelFile(
  file: File,
  products: Product[],
  locations: WarehouseLocation[] = [],
): Promise<InboundExcelParseResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const parsedSheet = sheetToMatrix(workbook);

  if (!parsedSheet) {
    return {
      template: "legacy",
      details: [],
      errors: [{ message: "File Excel trống hoặc không có dữ liệu" }],
      warnings: [],
      previewRows: [],
    };
  }

  const { sheet, worksheet } = parsedSheet;

  const header = detectHeaderRow(sheet);
  if (!header) {
    return {
      template: "legacy",
      details: [],
      errors: [
        {
          message:
            "Không nhận diện được biểu mẫu nhập hàng. File cần có dòng tiêu đề (Mã Item, Số lượng...).",
        },
      ],
      warnings: [],
      previewRows: [],
    };
  }

  const productsBySku = buildProductsBySku(products);

  if (header.template === "daily_report") {
    const { rows, errors: rowErrors } = parseDailyReportExcelRows(
      sheet,
      worksheet,
      header.columnMap,
      header.headerRowIndex + 1,
    );
    const locationsByCode = buildLocationsByCode(locations);
    const expanded = expandDailyRowsToDetails(rows, productsBySku, locationsByCode);
    const errors = [...rowErrors, ...expanded.errors];

    if (expanded.details.length === 0 && errors.length === 0) {
      errors.push({ message: "Không có dòng dữ liệu hợp lệ để import" });
    }

    return {
      template: "daily_report",
      details: expanded.details,
      errors,
      warnings: expanded.warnings,
      previewRows: expanded.previewRows,
    };
  }

  const { rows, errors: rowErrors } = parseInboundExcelRows(
    sheet,
    worksheet,
    header.columnMap,
    header.headerRowIndex + 1,
  );

  const expanded = expandRowsToDetails(rows, productsBySku);
  const errors = [...rowErrors, ...expanded.errors];

  if (expanded.details.length === 0 && errors.length === 0) {
    errors.push({ message: "Không có dòng dữ liệu hợp lệ để import" });
  }

  return {
    template: "legacy",
    details: expanded.details,
    errors,
    warnings: expanded.warnings,
    previewRows: expanded.previewRows,
  };
}
