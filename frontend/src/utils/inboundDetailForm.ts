import dayjs, { type Dayjs } from "dayjs";
import type { InboundDetailInput, InboundOrderDetail } from "@/types/inbound";
import type { Product } from "@/types/product";
import {
  parseNonNegativeInteger,
  parsePositiveInteger,
  toInteger,
} from "@/utils/number";
import { splitQuantity, type ImportPreviewRow } from "@/utils/inboundExcelImport";
import { resolveTotalAndPalletCount } from "@/utils/palletQuantity";

export { resolveTotalAndPalletCount };

export type InboundDetailLineFormValues = {
  product_id?: number;
  expected_quantity?: number;
  lot_number?: string;
  pallet_quantity?: number;
  assigned_location_id?: number | null;
  customer_import_time?: Dayjs | null;
  vehicle_number?: string;
  export_warehouse?: string;
  import_warehouse?: string;
  delivery_code?: string;
  carrier_name?: string;
};

export function detailToFormLine(
  detail: InboundOrderDetail,
): InboundDetailLineFormValues {
  return {
    product_id: detail.product_id,
    expected_quantity: toInteger(detail.expected_quantity),
    lot_number: detail.lot_number ?? undefined,
    pallet_quantity:
      detail.pallet_quantity != null
        ? toInteger(detail.pallet_quantity)
        : undefined,
    assigned_location_id: detail.assigned_location_id,
    customer_import_time: detail.customer_import_time
      ? dayjs(detail.customer_import_time)
      : detail.event_datetime
        ? dayjs(detail.event_datetime)
        : undefined,
    vehicle_number: detail.vehicle_number ?? undefined,
    export_warehouse: detail.export_warehouse ?? undefined,
    import_warehouse: detail.import_warehouse ?? undefined,
    delivery_code: detail.delivery_code ?? undefined,
    carrier_name: detail.carrier_name ?? undefined,
  };
}

export function formLineToDetailInput(
  line: InboundDetailLineFormValues,
): InboundDetailInput | null {
  if (!line.product_id || line.expected_quantity == null) {
    return null;
  }

  const expectedQuantity = parsePositiveInteger(line.expected_quantity);
  if (expectedQuantity == null) {
    return null;
  }

  let palletQuantity: number | null = null;
  if (line.pallet_quantity != null) {
    const parsedPallet = parseNonNegativeInteger(line.pallet_quantity);
    if (parsedPallet == null) {
      return null;
    }
    palletQuantity = parsedPallet;
  }

  return {
    product_id: line.product_id,
    expected_quantity: expectedQuantity,
    lot_number: line.lot_number?.trim() || null,
    pallet_quantity: palletQuantity,
    assigned_location_id: line.assigned_location_id ?? null,
    customer_import_time: line.customer_import_time
      ? line.customer_import_time.toISOString()
      : null,
    vehicle_number: line.vehicle_number?.trim() || null,
    export_warehouse: line.export_warehouse?.trim() || null,
    import_warehouse: line.import_warehouse?.trim() || null,
    delivery_code: line.delivery_code?.trim() || null,
    carrier_name: line.carrier_name?.trim() || null,
  };
}

export function mapFormLinesToDetailInputs(
  lines: InboundDetailLineFormValues[] | undefined,
): InboundDetailInput[] {
  return (lines ?? [])
    .map((line) => formLineToDetailInput(line))
    .filter((line): line is InboundDetailInput => line != null);
}

export function isExistingEditLine(line: InboundDetailLineFormValues): boolean {
  return (
    line.assigned_location_id != null && line.assigned_location_id > 0
  );
}

export function buildDetailsFromEditForm(
  lines: InboundDetailLineFormValues[] | undefined,
  products: Product[],
): {
  details: InboundDetailInput[];
  errors: string[];
} {
  const details: InboundDetailInput[] = [];
  const errors: string[] = [];

  (lines ?? []).forEach((line, lineIndex) => {
    if (!line.product_id) {
      return;
    }

    if (isExistingEditLine(line)) {
      const detail = formLineToDetailInput(line);
      if (!detail) {
        errors.push(`Dòng ${lineIndex + 1}: số lượng không hợp lệ`);
        return;
      }
      details.push(detail);
      return;
    }

    const expanded = expandManualLinesToDetails([line], products);
    if (expanded.errors.length > 0) {
      errors.push(
        ...expanded.errors.map(
          (error) =>
            error.replace(/^Dòng 1:/, `Dòng ${lineIndex + 1}:`),
        ),
      );
      return;
    }

    details.push(...expanded.details);
  });

  return { details, errors };
}

export function expandManualLinesToDetails(
  lines: InboundDetailLineFormValues[] | undefined,
  products: Product[],
): {
  details: InboundDetailInput[];
  previewRows: ImportPreviewRow[];
  errors: string[];
} {
  const productById = new Map(products.map((product) => [product.id, product]));
  const details: InboundDetailInput[] = [];
  const previewRows: ImportPreviewRow[] = [];
  const errors: string[] = [];

  (lines ?? []).forEach((line, lineIndex) => {
    const lineNumber = lineIndex + 1;

    if (!line.product_id) {
      return;
    }

    const base = formLineToDetailInput(line);
    if (!base) {
      errors.push(`Dòng ${lineNumber}: số lượng hoặc pallet không hợp lệ`);
      return;
    }

    const product = productById.get(base.product_id);
    const { totalQuantity, palletCount } = resolveTotalAndPalletCount(
      base.expected_quantity,
      base.pallet_quantity,
    );
    const quantities = splitQuantity(totalQuantity, palletCount);

    if (quantities.length === 0) {
      errors.push(
        `Dòng ${lineNumber}: không thể chia tổng SL ${totalQuantity} cho ${palletCount} pallet (mỗi pallet cần ít nhất 1)`,
      );
      return;
    }

    for (const expectedQuantity of quantities) {
      details.push({
        ...base,
        expected_quantity: expectedQuantity,
        pallet_quantity: 1,
      });

      previewRows.push({
        excelRowNumber: lineNumber,
        sku: product?.sku ?? String(base.product_id),
        productName: product?.name ?? "—",
        dbProductName: product?.name ?? "—",
        lotNumber: base.lot_number ?? "",
        lotStatus: "",
        totalQuantity,
        expectedQuantity,
        palletQuantity: 1,
        nameMismatch: false,
      });
    }
  });

  return { details, previewRows, errors };
}
