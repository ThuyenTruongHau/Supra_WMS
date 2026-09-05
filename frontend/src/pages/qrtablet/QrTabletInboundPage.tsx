import { useCallback, useEffect, useMemo, useState } from "react";
import { Form, Input, Modal, Progress } from "antd";
import { ScanOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { Button, Select, message } from "@/components/ui";
import { QrCameraOverlay, QrImageImport } from "@/components/qr-scan";
import CreateImportModal, {
  type ImportGroupDraft,
} from "@/pages/components/CreateImportModal";
import { useAssignOrGetItemStock, useCacheForPackingUser, useGetPackingUserStocks, usePreviewQrCode } from "@/hooks/useInboundOrder";
import { getStaffUsernamesApi } from "@/api/auth";
import { getItemAvailableUnitsApi } from "@/api/itemUnit";
import { getApiErrorMessage, isQrTypeLocationConflictError } from "@/utils/apiErrorMessage";
import {
  isAssignOrGetAssigned,
  isAssignOrGetLocationStocks,
  isAssignOrGetPendingCached,
  isAssignOrGetPreview,
  type AssignedItemStock,
  type AssignOrGetItemStockRequest,
  type AssignOrGetItemStockResponse,
  type CacheForPackingUserRequest,
  type InboundCallerResponse,
  type PackDraft,
  type PackerItemAnchor,
  type QrCodePreviewResponse,
} from "@/types/inboundOrder";
import { sendCallerAddTasks } from "@/utils/sendCallerAddTasks";
import { PackAggregateError, aggregatePackDrafts } from "@/utils/aggregatePackDrafts";
import { useAppStore } from "@/store/useAppStore";
import {
  formatAssignedProduct,
  formatPackerBatchSendProgress,
  formatPackerBatchTotalRequests,
  formatPackerListCount,
  formatPendingCached,
  tQrTabletInbound,
} from "@/i18n/qrTabletInbound.vi";
import type { InboundScanFlow } from "@/pages/qrtablet/inboundScanFlow";
import InboundScanFlowToggle from "@/pages/qrtablet/InboundScanFlowToggle";

type ScanMode = "idle" | "product" | "location";

const STAFF_LIST_SEPARATOR = ",";

function parseStaffList(raw: string | null | undefined): string[] {
  if (!raw?.trim()) {
    return [];
  }
  return raw
    .split(STAFF_LIST_SEPARATOR)
    .map((part) => part.trim())
    .filter(Boolean);
}

function serializeStaffList(users: string[]): string | undefined {
  const normalized = users.map((user) => user.trim()).filter(Boolean);
  if (normalized.length === 0) {
    return undefined;
  }
  return normalized.join(STAFF_LIST_SEPARATOR);
}

function filterKnownStaff(users: string[], staffUsernameSet: Set<string>): string[] {
  return users.filter((user) => staffUsernameSet.has(user.trim()));
}

function mapStocksToGroups(stocks: AssignedItemStock[]): ImportGroupDraft[] {
  const first = stocks[0];
  return [
    {
      key: `tablet-group-${first?.location_id ?? "loc"}`,
      from_location_id: first?.location_id ?? undefined,
      from_location_name: first?.location_name ?? undefined,
      qr_type: first?.qr_type ?? undefined,
      items: stocks.map((stock, index) => ({
        key: `tablet-item-${stock.qr_code_id}-${index}`,
        sku: stock.item_sku,
        item_id: stock.item_id,
        item_name: stock.item_name ?? undefined,
        quantity: stock.quantity,
        unit_id: stock.unit_id,
        lot_number: stock.lot_number || stock.lot_number_to || undefined,
        qr_code_id: stock.qr_code_id,
        qr_type: stock.qr_type ?? undefined,
      })),
    },
  ];
}

function qrTypeNeedsQcPacking(qrType: string | null | undefined): boolean {
  const normalized = (qrType ?? "item").trim().toLowerCase();
  return normalized === "item" || normalized === "pack";
}

function isItemQrType(qrType: string | null | undefined): boolean {
  return (qrType ?? "item").trim().toLowerCase() === "item";
}

function isPackQrType(qrType: string | null | undefined): boolean {
  return (qrType ?? "item").trim().toLowerCase() === "pack";
}

function PackerStockField({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-stripe-ink-mute">
        {label}
      </p>
      <p className="mt-1 truncate text-lg font-semibold leading-tight text-stripe-ink">
        {value?.trim() || "—"}
      </p>
    </div>
  );
}

function isTransitPreview(preview: QrCodePreviewResponse | null): boolean {
  return preview?.qr_type === "transit";
}

export default function QrTabletInboundPage() {
  const selectedWarehouseId = useAppStore((s) => s.selectedWarehouseId);
  const inboundType = useAppStore((s) => s.inboundType);
  const isAutoWarehouse = inboundType === "auto";
  const [scanFlow, setScanFlow] = useState<InboundScanFlow>(() =>
    useAppStore.getState().inboundType === "auto" ? "continuous" : "assign",
  );
  const isPackerMode = scanFlow === "continuous";
  const assignMutation = useAssignOrGetItemStock();
  const previewMutation = usePreviewQrCode();
  const packingMutation = useCacheForPackingUser();
  const packingStocksMutation = useGetPackingUserStocks();

  useEffect(() => {
    setScanFlow(isAutoWarehouse ? "continuous" : "assign");
    setPackingCaches([]);
    setWorkbenchOpen(false);
    setWorkbenchPackingUser(undefined);
    setPackDrafts([]);
    setItemAnchor(null);
    setItemBatchPreview(null);
    setPackerBatchReviewOpen(false);
    setBatchSendProgress(null);
    setIsBatchSending(false);
  }, [selectedWarehouseId, isAutoWarehouse]);

  const handleScanFlowChange = useCallback(
    (value: InboundScanFlow) => {
      setScanFlow(value);
      setPackingCaches([]);
      setWorkbenchOpen(false);
      setWorkbenchPackingUser(undefined);
      setPackDrafts([]);
      setItemAnchor(null);
      setItemBatchPreview(null);
      setPackerBatchReviewOpen(false);
      setBatchSendProgress(null);
      setIsBatchSending(false);
      setPreview(null);
      setQuantity(1);
      setUnitId(undefined);
      setLotNumber("");
      setCavityNumber(undefined);
      setManufacturingUsers([]);
      setQcUsers([]);
      setPackingUser(undefined);
      setUnitOptions([]);
    },
    [],
  );
  const {
    data: staffUsernames = [],
    isLoading: staffLoading,
    isError: staffError,
  } = useQuery({
    queryKey: ["qrtablet", "staff-usernames"],
    queryFn: getStaffUsernamesApi,
    staleTime: 5 * 60 * 1000,
  });
  const staffOptions = useMemo(
    () => staffUsernames.map((name) => ({ value: name, label: name })),
    [staffUsernames],
  );
  const [scanMode, setScanMode] = useState<ScanMode>("idle");
  const [preview, setPreview] = useState<QrCodePreviewResponse | null>(null);
  const [quantity, setQuantity] = useState<number>(1);
  const [unitId, setUnitId] = useState<number | undefined>();
  const [lotNumber, setLotNumber] = useState("");
  const [manufacturingUsers, setManufacturingUsers] = useState<string[]>([]);
  const [qcUsers, setQcUsers] = useState<string[]>([]);
  const [packingUser, setPackingUser] = useState<string | undefined>();
  const [cavityNumber, setCavityNumber] = useState<string | undefined>();
  const [unitOptions, setUnitOptions] = useState<
    { value: number; label: string }[]
  >([]);
  const [formOpen, setFormOpen] = useState(false);
  const [importGroups, setImportGroups] = useState<ImportGroupDraft[]>();
  const [warehouseId, setWarehouseId] = useState<number | undefined>();
  const [packingCaches, setPackingCaches] = useState<AssignedItemStock[]>([]);
  const [workbenchOpen, setWorkbenchOpen] = useState(false);
  const [workbenchPackingUser, setWorkbenchPackingUser] = useState<
    string | undefined
  >();
  const [packDrafts, setPackDrafts] = useState<PackDraft[]>([]);
  const [itemAnchor, setItemAnchor] = useState<PackerItemAnchor | null>(null);
  const [itemBatchPreview, setItemBatchPreview] =
    useState<QrCodePreviewResponse | null>(null);
  const [packerBatchReviewOpen, setPackerBatchReviewOpen] = useState(false);
  const [batchSendProgress, setBatchSendProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [isBatchSending, setIsBatchSending] = useState(false);
  const scanPending =
    assignMutation.isPending ||
    previewMutation.isPending ||
    packingMutation.isPending ||
    packingStocksMutation.isPending ||
    isBatchSending;
  const isPackerItemPicker =
    isPackerMode && !!preview && isItemQrType(preview.qr_type);
  const isPackerPackForm =
    isPackerMode && !!preview && isPackQrType(preview.qr_type);

  const aggregatedBatchPreview = useMemo(() => {
    if (!itemBatchPreview || packDrafts.length === 0) {
      return null;
    }
    try {
      return aggregatePackDrafts(packDrafts, itemBatchPreview.item_id);
    } catch {
      return null;
    }
  }, [itemBatchPreview, packDrafts]);

  const batchRequestTotal = useMemo(
    () => (packDrafts.length > 0 ? 1 + packDrafts.length : 0),
    [packDrafts.length],
  );

  const staffUsernameSet = useMemo(
    () => new Set(staffUsernames),
    [staffUsernames],
  );

  const isStaffSelected = useCallback(
    (value: string | undefined) =>
      !!value?.trim() && staffUsernameSet.has(value.trim()),
    [staffUsernameSet],
  );

  const cavityOptions = useMemo(
    () =>
      (preview?.cavity_numbers ?? []).map((c) => ({
        value: c,
        label: c,
      })),
    [preview?.cavity_numbers],
  );
  const requiresCavity = cavityOptions.length > 0;
  const showQcUser = qrTypeNeedsQcPacking(preview?.qr_type);
  const showPackingUser = qrTypeNeedsQcPacking(preview?.qr_type);

  const isStaffListReady = useCallback(
    (values: string[]) =>
      values.some((value) => staffUsernameSet.has(value.trim())),
    [staffUsernameSet],
  );

  const selectedStaffList = useCallback(
    (values: string[]): string | undefined => {
      const valid = filterKnownStaff(values, staffUsernameSet);
      return serializeStaffList(valid);
    },
    [staffUsernameSet],
  );

  const selectedStaff = useCallback(
    (value: string | undefined) =>
      isStaffSelected(value) ? value!.trim() : undefined,
    [isStaffSelected],
  );

  const manufacturingReady = isStaffListReady(manufacturingUsers);
  const lotReady = !!lotNumber.trim();

  const isPackingFormReady = useMemo(
    () =>
      !!preview &&
      !!quantity &&
      !!unitId &&
      lotReady &&
      manufacturingReady &&
      (!requiresCavity || !!cavityNumber?.trim()) &&
      (!showQcUser || isStaffListReady(qcUsers)) &&
      (!showPackingUser || isStaffSelected(packingUser)),
    [
      cavityNumber,
      isStaffListReady,
      isStaffSelected,
      lotReady,
      manufacturingReady,
      manufacturingUsers,
      packingUser,
      preview,
      qcUsers,
      quantity,
      requiresCavity,
      showPackingUser,
      showQcUser,
      unitId,
    ],
  );

  const resetPreview = useCallback(() => {
    setPreview(null);
    setQuantity(1);
    setUnitId(undefined);
    setLotNumber("");
    setCavityNumber(undefined);
    setManufacturingUsers([]);
    setQcUsers([]);
    setPackingUser(undefined);
    setUnitOptions([]);
  }, []);

  const applyPreviewResult = useCallback(
    async (result: QrCodePreviewResponse) => {
      setWorkbenchOpen(false);
      setPackerBatchReviewOpen(false);
      if (isItemQrType(result.qr_type)) {
        setItemAnchor(null);
        setItemBatchPreview(null);
      }
      setPreview(result);
      setQuantity(result.quantity);
      setUnitId(result.unit_id);
      setLotNumber(result.lot_number);
      setCavityNumber(result.cavity_number ?? result.cavity_numbers?.[0]);
      setManufacturingUsers(
        filterKnownStaff(parseStaffList(result.manufacturing_user), staffUsernameSet),
      );
      setQcUsers(
        qrTypeNeedsQcPacking(result.qr_type)
          ? filterKnownStaff(parseStaffList(result.qc_user), staffUsernameSet)
          : [],
      );
      setPackingUser(
        qrTypeNeedsQcPacking(result.qr_type)
          ? result.packing_user || undefined
          : undefined,
      );
      setUnitOptions([{ value: result.unit_id, label: result.unit_name }]);
      try {
        const available = await getItemAvailableUnitsApi(result.item_id);
        setUnitOptions(
          available.units.map((u) => ({
            value: u.unit_id,
            label: u.unit_name,
          })),
        );
      } catch {
        // keep base unit option
      }
    },
    [staffUsernameSet],
  );

  const handleAssignOrGetResponse = useCallback(
    async (result: AssignOrGetItemStockResponse) => {
      if (isAssignOrGetPreview(result)) {
        await applyPreviewResult(result.preview);
        return;
      }
      if (isAssignOrGetAssigned(result)) {
        resetPreview();
        Modal.success({
          title: tQrTabletInbound("assignedTitle"),
          content: formatAssignedProduct(
            result.assigned.part_number,
            result.assigned.location,
          ),
        });
        return;
      }
      if (isAssignOrGetLocationStocks(result)) {
        const stocks = result.location_stocks ?? [];
        if (stocks.length === 0) {
          message.warning(tQrTabletInbound("noStockAtLocation"));
          return;
        }
        setWarehouseId(stocks[0]?.warehouse_id ?? undefined);
        setImportGroups(mapStocksToGroups(stocks));
        setFormOpen(true);
        return;
      }
      if (isAssignOrGetPendingCached(result)) {
        message.success(
          formatPendingCached(
            result.pending.code,
            result.pending.part_number,
          ),
        );
        resetPreview();
        return;
      }
      message.error(tQrTabletInbound("unhandledResponse"));
    },
    [applyPreviewResult, resetPreview],
  );

  const buildPackDraftFromForm = useCallback((): PackDraft => {
    if (!preview) {
      throw new Error("Missing preview for pack draft");
    }
    const unitName =
      unitOptions.find((option) => option.value === unitId)?.label ??
      preview.unit_name;
    return {
      qr_code: preview.code,
      qr_code_id: preview.qr_code_id,
      item_id: preview.item_id,
      quantity,
      unit_id: unitId!,
      unit_name: unitName,
      lot_number: lotNumber.trim(),
      cavity_number: cavityNumber || undefined,
      manufacturing_user: selectedStaffList(manufacturingUsers)!,
      qc_user: showQcUser ? selectedStaffList(qcUsers) : undefined,
    };
  }, [
    cavityNumber,
    lotNumber,
    manufacturingUsers,
    preview,
    qcUsers,
    quantity,
    selectedStaffList,
    showQcUser,
    unitId,
    unitOptions,
  ]);

  const buildPackingCachePayload = useCallback((): CacheForPackingUserRequest => {
    if (!preview) {
      throw new Error("Missing preview for packing cache");
    }
    const resolvedPackingUser =
      itemAnchor && workbenchPackingUser
        ? workbenchPackingUser
        : selectedStaff(packingUser);
    const payload: CacheForPackingUserRequest = {
      qr_code: preview.code,
      warehouse_id: selectedWarehouseId,
      quantity,
      unit_id: unitId!,
      lot_number: lotNumber.trim(),
      cavity_number: cavityNumber || undefined,
      manufacturing_user: selectedStaffList(manufacturingUsers)!,
      qc_user: showQcUser ? selectedStaffList(qcUsers) : undefined,
      packing_user: resolvedPackingUser,
    };
    if (isPackQrType(preview.qr_type) && itemAnchor) {
      payload.relation = itemAnchor.qr_code_id;
    }
    return payload;
  }, [
    cavityNumber,
    itemAnchor,
    lotNumber,
    manufacturingUsers,
    packingUser,
    preview,
    qcUsers,
    quantity,
    selectedStaff,
    selectedStaffList,
    selectedWarehouseId,
    showQcUser,
    unitId,
    workbenchPackingUser,
  ]);

  const appendPackDraft = useCallback((): boolean => {
    if (!isPackingFormReady) {
      return false;
    }
    const draft = buildPackDraftFromForm();
    setPackDrafts((prev) => [...prev, draft]);
    resetPreview();
    return true;
  }, [buildPackDraftFromForm, isPackingFormReady, resetPreview]);

  const cachePackingForm = useCallback(async () => {
    if (!isPackingFormReady) {
      return false;
    }
    const result = await packingMutation.mutateAsync(buildPackingCachePayload());
    await handleAssignOrGetResponse(result);
    const cachedPackingUser =
      itemAnchor && workbenchPackingUser
        ? workbenchPackingUser
        : selectedStaff(packingUser);
    if (cachedPackingUser) {
      const stocks = await packingStocksMutation.mutateAsync(cachedPackingUser);
      setPackingCaches(stocks.items);
    }
    return true;
  }, [
    buildPackingCachePayload,
    handleAssignOrGetResponse,
    isPackingFormReady,
    itemAnchor,
    packingMutation,
    packingStocksMutation,
    packingUser,
    selectedStaff,
    workbenchPackingUser,
  ]);

  const submitPackingCache = useCallback(
    async (afterSuccess: "close" | "scanNext") => {
      try {
        if (!itemAnchor) {
          const appended = appendPackDraft();
          if (!appended) {
            return;
          }
          if (afterSuccess === "scanNext") {
            setScanMode("product");
          }
          return;
        }
        const cached = await cachePackingForm();
        if (!cached) {
          return;
        }
        resetPreview();
        if (afterSuccess === "scanNext") {
          setScanMode("product");
        }
      } catch (err) {
        message.error(getApiErrorMessage(err));
      }
    },
    [appendPackDraft, cachePackingForm, itemAnchor, resetPreview],
  );

  const handlePackingUserConfirm = useCallback(async () => {
    const user = selectedStaff(packingUser);
    if (!user || !preview || !isItemQrType(preview.qr_type)) {
      return;
    }

    const stocks = await packingStocksMutation.mutateAsync(user);
    setWorkbenchPackingUser(user);
    setPackingCaches(stocks.items);
    setItemBatchPreview(preview);
    resetPreview();
    setPackerBatchReviewOpen(true);
  }, [packingStocksMutation, packingUser, preview, resetPreview, selectedStaff]);

  const handlePackingBatchSend = useCallback(async () => {
    const user = workbenchPackingUser;
    if (!user || !itemBatchPreview) {
      return;
    }
    if (packDrafts.length === 0) {
      message.warning(tQrTabletInbound("packerNoPacksToConfirm"));
      return;
    }

    const totalSteps = 1 + packDrafts.length;
    setIsBatchSending(true);
    setBatchSendProgress({ current: 0, total: totalSteps });

    try {
      const aggregated = aggregatePackDrafts(
        packDrafts,
        itemBatchPreview.item_id,
      );

      setBatchSendProgress({ current: 1, total: totalSteps });
      await packingMutation.mutateAsync({
        qr_code: itemBatchPreview.code,
        warehouse_id: selectedWarehouseId,
        quantity: aggregated.quantity,
        unit_id: aggregated.unit_id,
        lot_number: aggregated.lot_number,
        cavity_number: aggregated.cavity_number,
        manufacturing_user: aggregated.manufacturing_user,
        qc_user: aggregated.qc_user,
        packing_user: user,
      });

      for (let index = 0; index < packDrafts.length; index += 1) {
        const pack = packDrafts[index];
        await packingMutation.mutateAsync({
          qr_code: pack.qr_code,
          warehouse_id: selectedWarehouseId,
          quantity: pack.quantity,
          unit_id: pack.unit_id,
          lot_number: pack.lot_number,
          cavity_number: pack.cavity_number,
          manufacturing_user: pack.manufacturing_user,
          qc_user: pack.qc_user,
          packing_user: user,
          relation: itemBatchPreview.qr_code_id,
        });
        setBatchSendProgress({
          current: index + 2,
          total: totalSteps,
        });
      }

      const stocks = await packingStocksMutation.mutateAsync(user);
      setPackingCaches(stocks.items);
      setItemAnchor({
        qr_code_id: itemBatchPreview.qr_code_id,
        code: itemBatchPreview.code,
        item_id: itemBatchPreview.item_id,
      });
      setPackDrafts([]);
      setItemBatchPreview(null);
      setPackerBatchReviewOpen(false);
      setWorkbenchOpen(true);
      message.success(tQrTabletInbound("packerBatchSendComplete"));
    } catch (err) {
      if (err instanceof PackAggregateError) {
        message.error(tQrTabletInbound(err.messageKey));
        return;
      }
      throw err;
    } finally {
      setIsBatchSending(false);
      setBatchSendProgress(null);
    }
  }, [
    itemBatchPreview,
    packDrafts,
    packingMutation,
    packingStocksMutation,
    selectedWarehouseId,
    workbenchPackingUser,
  ]);

  const handlePackingSubmit = useCallback(
    (afterSuccess: "close" | "scanNext") => {
      void submitPackingCache(afterSuccess);
    },
    [submitPackingCache],
  );

  const buildScanPayload = useCallback(
    (scanned: string): AssignOrGetItemStockRequest => {
      if (preview) {
        return {
          qr_code: preview.code,
          raw: scanned,
          warehouse_id: selectedWarehouseId,
          quantity,
          unit_id: unitId,
          lot_number: lotNumber.trim() || undefined,
          cavity_number: cavityNumber || undefined,
          manufacturing_user: selectedStaffList(manufacturingUsers),
          qc_user: showQcUser ? selectedStaffList(qcUsers) : undefined,
          packing_user: showPackingUser ? selectedStaff(packingUser) : undefined,
        };
      }
      return {
        qr_code: scanned,
        warehouse_id: selectedWarehouseId,
      };
    },
    [
      cavityNumber,
      lotNumber,
      manufacturingUsers,
      packingUser,
      preview,
      qcUsers,
      quantity,
      selectedStaff,
      selectedStaffList,
      selectedWarehouseId,
      showPackingUser,
      showQcUser,
      unitId,
    ],
  );

  const isProductFormReady = useMemo(
    () =>
      !!quantity &&
      !!unitId &&
      lotReady &&
      manufacturingReady &&
      (!requiresCavity || !!cavityNumber?.trim()) &&
      (!showQcUser || isStaffListReady(qcUsers)) &&
      (!showPackingUser || isStaffSelected(packingUser)),
    [
      cavityNumber,
      isStaffListReady,
      isStaffSelected,
      lotReady,
      manufacturingReady,
      manufacturingUsers,
      packingUser,
      qcUsers,
      quantity,
      requiresCavity,
      showPackingUser,
      showQcUser,
      unitId,
    ],
  );

  const handleScan = useCallback(
    async (scanned: string) => {
      setScanMode("idle");
      if (!selectedWarehouseId) {
        message.warning(tQrTabletInbound("selectWarehouseFirst"));
        return;
      }
      try {
        if (isPackerMode) {
          const previewResult = await previewMutation.mutateAsync({
            qr_code: scanned,
            warehouse_id: selectedWarehouseId,
          });
          await applyPreviewResult(previewResult);
          return;
        }
        const result = await assignMutation.mutateAsync(buildScanPayload(scanned));
        await handleAssignOrGetResponse(result);
      } catch (err) {
        const errorMessage = getApiErrorMessage(err);
        if (isQrTypeLocationConflictError(err)) {
          Modal.error({
            title: tQrTabletInbound("cannotAssignLocationTitle"),
            content: errorMessage,
            centered: true,
          });
          return;
        }
        message.error(errorMessage);
      }
    },
    [
      applyPreviewResult,
      assignMutation,
      buildScanPayload,
      handleAssignOrGetResponse,
      isPackerMode,
      previewMutation,
      selectedWarehouseId,
    ],
  );

  const handleImportDecoded = useCallback(
    async (text: string) => {
      if (!selectedWarehouseId) {
        message.warning(tQrTabletInbound("selectWarehouseFirst"));
        return;
      }
      try {
        if (isPackerPackForm && preview && isPackingFormReady) {
          if (!itemAnchor) {
            const appended = appendPackDraft();
            if (!appended) {
              return;
            }
          } else {
            const cached = await cachePackingForm();
            if (!cached) {
              return;
            }
            resetPreview();
          }
        }
        await handleScan(text);
      } catch (err) {
        const errorMessage = getApiErrorMessage(err);
        if (isQrTypeLocationConflictError(err)) {
          Modal.error({
            title: tQrTabletInbound("cannotAssignLocationTitle"),
            content: errorMessage,
            centered: true,
          });
          return;
        }
        message.error(errorMessage);
      }
    },
    [
      appendPackDraft,
      cachePackingForm,
      handleScan,
      isPackerPackForm,
      isPackingFormReady,
      itemAnchor,
      preview,
      resetPreview,
      selectedWarehouseId,
    ],
  );

  const renderStaffMultiSelect = (
    label: string,
    value: string[],
    onChange: (val: string[]) => void,
    required = false,
  ) => (
    <Form.Item label={label} required={required}>
      <Select
        className="w-full"
        mode="multiple"
        allowClear
        showSearch
        optionFilterProp="label"
        loading={staffLoading}
        placeholder={
          staffError
            ? tQrTabletInbound("staffLoadError")
            : tQrTabletInbound("staffSearchPlaceholder")
        }
        value={filterKnownStaff(value, staffUsernameSet)}
        options={staffOptions}
        listHeight={280}
        getPopupContainer={(node) => node.parentElement ?? document.body}
        notFoundContent={
          staffLoading
            ? tQrTabletInbound("staffLoading")
            : staffError
              ? tQrTabletInbound("staffListError")
              : tQrTabletInbound("staffNotFound")
        }
        onChange={(val) =>
          onChange(
            Array.isArray(val)
              ? val.filter((item): item is string => typeof item === "string")
              : [],
          )
        }
      />
    </Form.Item>
  );

  const renderStaffSelect = (
    label: string,
    value: string | undefined,
    onChange: (val: string | undefined) => void,
    required = false,
  ) => (
    <Form.Item label={label} required={required}>
      <Select
        className="w-full"
        allowClear
        showSearch
        optionFilterProp="label"
        loading={staffLoading}
        placeholder={
          staffError
            ? tQrTabletInbound("staffLoadError")
            : tQrTabletInbound("staffSearchPlaceholder")
        }
        value={isStaffSelected(value) ? value : undefined}
        options={staffOptions}
        listHeight={280}
        getPopupContainer={(node) => node.parentElement ?? document.body}
        notFoundContent={
          staffLoading
            ? tQrTabletInbound("staffLoading")
            : staffError
              ? tQrTabletInbound("staffListError")
              : tQrTabletInbound("staffNotFound")
        }
        onChange={(val) => onChange(typeof val === "string" ? val : undefined)}
      />
    </Form.Item>
  );

  const renderPackerBatchReview = () => {
    if (!itemBatchPreview) {
      return null;
    }
    const batchUnitName =
      packDrafts[0]?.unit_name ?? itemBatchPreview.unit_name;

    return (
      <div className="space-y-5">
        <div className="overflow-hidden rounded-2xl bg-brand-dark text-white shadow-[0_8px_24px_rgba(15,61,70,0.22)]">
          <div className="border-b border-white/10 px-6 py-5">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-stripe-primary-subdued">
              {tQrTabletInbound("labelPacking")}
            </p>
            <p className="mt-2 text-3xl font-extrabold tracking-tight">
              {workbenchPackingUser}
            </p>
          </div>
        </div>

        <p className="text-sm text-stripe-ink-mute">
          {tQrTabletInbound("packerBatchReviewHint")}
        </p>

        <div className="rounded-2xl border border-stripe-hairline bg-white p-5">
          <p className="mb-4 text-xs font-bold uppercase tracking-[0.14em] text-stripe-ink-mute">
            {tQrTabletInbound("packerBatchReviewItemSection")}
          </p>
          <p className="font-mono text-lg font-bold text-brand-dark">
            {itemBatchPreview.code}
          </p>
          <p className="mt-1 text-base text-stripe-ink-secondary">
            {itemBatchPreview.item_sku}
            {itemBatchPreview.item_name
              ? ` — ${itemBatchPreview.item_name}`
              : null}
          </p>
          {aggregatedBatchPreview ? (
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <PackerStockField
                label={tQrTabletInbound("labelQuantity")}
                value={String(aggregatedBatchPreview.quantity)}
              />
              <PackerStockField
                label={tQrTabletInbound("labelUnit")}
                value={batchUnitName}
              />
              <PackerStockField
                label={tQrTabletInbound("labelLot")}
                value={aggregatedBatchPreview.lot_number}
              />
              <PackerStockField
                label={tQrTabletInbound("labelCavity")}
                value={aggregatedBatchPreview.cavity_number}
              />
              <PackerStockField
                label={tQrTabletInbound("labelManufacturing")}
                value={aggregatedBatchPreview.manufacturing_user}
              />
              <PackerStockField
                label={tQrTabletInbound("labelQc")}
                value={aggregatedBatchPreview.qc_user}
              />
            </div>
          ) : (
            <p className="mt-4 text-sm font-medium text-red-600">
              {packDrafts.length === 0
                ? tQrTabletInbound("packerNoPacksToConfirm")
                : tQrTabletInbound("packerInvalidLot")}
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-stripe-hairline bg-white p-5">
          <p className="mb-4 text-xs font-bold uppercase tracking-[0.14em] text-stripe-ink-mute">
            {tQrTabletInbound("packerBatchReviewPacksSection")} (
            {packDrafts.length})
          </p>
          <div className="max-h-[32vh] space-y-3 overflow-y-auto">
            {packDrafts.map((pack, index) => (
              <div
                key={`${pack.qr_code_id}-${index}`}
                className="rounded-xl border border-stripe-hairline bg-stripe-canvas-soft px-4 py-3"
              >
                <p className="font-mono text-base font-bold text-brand-dark">
                  {pack.qr_code}
                </p>
                <p className="mt-1 text-sm text-stripe-ink-secondary">
                  SL {pack.quantity} {pack.unit_name ?? ""} · Lô {pack.lot_number}
                </p>
              </div>
            ))}
          </div>
        </div>

        {isBatchSending && batchSendProgress ? (
          <div className="space-y-2 rounded-2xl border border-stripe-primary-subdued bg-stripe-primary-subdued/20 p-4">
            <p className="text-center text-base font-semibold text-brand-dark">
              {formatPackerBatchSendProgress(
                batchSendProgress.current,
                batchSendProgress.total,
              )}
            </p>
            <Progress
              percent={Math.round(
                (batchSendProgress.current / batchSendProgress.total) * 100,
              )}
              showInfo={false}
              strokeColor="#0f3d46"
            />
          </div>
        ) : null}

        <Button
          variant="primary"
          className="!h-12 w-full !text-lg"
          loading={isBatchSending}
          disabled={
            isBatchSending ||
            packDrafts.length === 0 ||
            !aggregatedBatchPreview
          }
          onClick={() => {
            void handlePackingBatchSend().catch((err) =>
              message.error(getApiErrorMessage(err)),
            );
          }}
        >
          {isBatchSending && batchSendProgress
            ? formatPackerBatchSendProgress(
                batchSendProgress.current,
                batchSendProgress.total,
              )
            : tQrTabletInbound("packerBatchSendButton")}
        </Button>
      </div>
    );
  };

  const renderPackerList = () => (
    <div className="space-y-5">
      <div className="overflow-hidden rounded-2xl bg-brand-dark text-white shadow-[0_8px_24px_rgba(15,61,70,0.22)]">
        <div className="border-b border-white/10 px-6 py-5">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-stripe-primary-subdued">
            {tQrTabletInbound("labelPacking")}
          </p>
          <p className="mt-2 text-3xl font-extrabold tracking-tight">
            {workbenchPackingUser}
          </p>
        </div>
        <div className="bg-brand-dark/90 px-6 py-3">
          <p className="text-lg font-medium text-white/90">
            {formatPackerListCount(packingCaches.length)}
          </p>
        </div>
      </div>

      <div className="max-h-[58vh] space-y-4 overflow-y-auto overscroll-contain pr-1">
        {packingCaches.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-stripe-primary-subdued bg-stripe-canvas-soft px-6 py-16 text-center">
            <p className="text-xl font-semibold text-stripe-ink-mute">
              {tQrTabletInbound("packerEmptyList")}
            </p>
          </div>
        ) : (
          packingCaches.map((stock, index) => (
            <article
              key={`${stock.qr_code_id}-${stock.code}`}
              className="overflow-hidden rounded-2xl border border-stripe-hairline bg-white shadow-[0_2px_8px_rgba(0,55,112,0.06)]"
            >
              <div className="flex items-start gap-4 border-b border-stripe-hairline bg-gradient-to-r from-stripe-primary-subdued/50 to-white px-5 py-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-dark text-xl font-bold text-white">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-xl font-bold leading-tight text-brand-dark">
                    {stock.code}
                  </p>
                  <p className="mt-1 truncate text-lg font-medium text-stripe-ink-secondary">
                    {stock.item_sku}
                    {stock.item_name ? (
                      <span className="text-stripe-ink-mute"> · {stock.item_name}</span>
                    ) : null}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-3xl font-extrabold tabular-nums leading-none text-brand-dark">
                    {stock.quantity}
                  </p>
                  <p className="mt-1 text-base font-semibold text-brand-primary">
                    {stock.unit_name}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-4 px-5 py-5 sm:grid-cols-4">
                <PackerStockField
                  label={tQrTabletInbound("labelLot")}
                  value={stock.lot_number || stock.lot_number_to}
                />
                <PackerStockField
                  label={tQrTabletInbound("labelCavity")}
                  value={stock.cavity_number}
                />
                <PackerStockField
                  label={tQrTabletInbound("labelManufacturing")}
                  value={stock.manufacturing_user}
                />
                <PackerStockField
                  label={tQrTabletInbound("labelQc")}
                  value={stock.qc_user}
                />
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );

  return (
    <div className="relative flex min-h-[70vh] flex-col items-center justify-center px-4 py-8">
      {isAutoWarehouse && (
        <div className="absolute right-4 top-4 z-10 sm:right-6">
          <InboundScanFlowToggle
            value={scanFlow}
            onChange={handleScanFlowChange}
          />
        </div>
      )}

      <div className="w-full max-w-xl rounded-2xl border border-stripe-hairline bg-white p-6 shadow-sm md:p-8">
        <h1 className="mb-2 text-center text-2xl font-extrabold text-brand-dark md:text-3xl">
          {tQrTabletInbound("pageTitle")}
        </h1>
        <p className="mb-8 text-center text-base text-stripe-ink-mute">
          {tQrTabletInbound("pageSubtitle")}
        </p>
        <div className="flex flex-col gap-3">
          <Button
            variant="primary"
            icon={<ScanOutlined />}
            className="!h-14 w-full !text-lg md:!h-16 md:!text-xl"
            loading={scanPending}
            onClick={() => setScanMode("product")}
          >
            {tQrTabletInbound("startScan")}
          </Button>
          <QrImageImport onDecoded={handleImportDecoded} />
        </div>
      </div>

      {scanMode === "product" && (
        <QrCameraOverlay
          title={tQrTabletInbound("scanQrTitle")}
          onScan={(text) => void handleScan(text)}
          onClose={() => setScanMode("idle")}
        />
      )}

      {scanMode === "location" && (
        <>
          <QrCameraOverlay
            title={tQrTabletInbound("scanLocationTitle")}
            onScan={(text) => void handleScan(text)}
            onClose={() => setScanMode("idle")}
          />
          <div className="fixed inset-x-0 bottom-0 z-[60] border-t border-white/10 bg-brand-dark/95 px-4 py-4">
            <QrImageImport onDecoded={handleImportDecoded} />
          </div>
        </>
      )}

      <Modal
        title={tQrTabletInbound("packerBatchReviewTitle")}
        open={packerBatchReviewOpen}
        onCancel={() => {
          if (isBatchSending) {
            return;
          }
          setPackerBatchReviewOpen(false);
          setItemBatchPreview(null);
        }}
        footer={null}
        centered
        width={920}
        destroyOnHidden
        closable={!isBatchSending}
        maskClosable={!isBatchSending}
      >
        {renderPackerBatchReview()}
      </Modal>

      <Modal
        title={tQrTabletInbound("packerWorkbenchTitle")}
        open={workbenchOpen}
        onCancel={() => setWorkbenchOpen(false)}
        footer={null}
        centered
        width={920}
        destroyOnHidden
      >
        {renderPackerList()}
      </Modal>

      <Modal
        title={tQrTabletInbound("confirmProductTitle")}
        open={!!preview && scanMode !== "location"}
        onCancel={resetPreview}
        footer={null}
        centered
        width={480}
        destroyOnHidden
      >
        {preview && (
          <Form layout="vertical" className="pt-2">
            <Form.Item label={tQrTabletInbound("labelProduct")}>
              <Input
                disabled
                value={`${preview.item_sku}${preview.item_name ? ` — ${preview.item_name}` : ""}`}
              />
            </Form.Item>
            {isPackerItemPicker ? (
              <>
                <p className="mb-4 text-sm text-stripe-ink-mute">
                  {tQrTabletInbound("packerSelectUserHint")}
                </p>
                {renderStaffSelect(
                  tQrTabletInbound("labelPacking"),
                  packingUser,
                  setPackingUser,
                  true,
                )}
                <Button
                  variant="primary"
                  className="!h-12 w-full !text-lg"
                  loading={packingStocksMutation.isPending}
                  disabled={!isStaffSelected(packingUser)}
                  onClick={() => {
                    void handlePackingUserConfirm().catch((err) =>
                      message.error(getApiErrorMessage(err)),
                    );
                  }}
                >
                  {tQrTabletInbound("packerConfirmUserButton")}
                </Button>
              </>
            ) : (
              <>
                {isTransitPreview(preview) && (
                  <p className="mb-4 text-sm text-stripe-ink-mute">
                    {tQrTabletInbound("transitHint")}
                  </p>
                )}
                {qrTypeNeedsQcPacking(preview.qr_type) && (
                  <p className="mb-4 text-sm text-stripe-ink-mute">
                    {tQrTabletInbound("productQcPackingHint")}
                  </p>
                )}
                <div className="mb-6 grid grid-cols-2 gap-4">
                  <Form.Item label={tQrTabletInbound("labelQuantity")} required className="!mb-0">
                    <Input
                      type="number"
                      min={1}
                      value={quantity}
                      onChange={(e) => setQuantity(Number(e.target.value) || 0)}
                    />
                  </Form.Item>
                  <Form.Item label={tQrTabletInbound("labelUnit")} required className="!mb-0">
                    <Select
                      className="w-full"
                      value={unitId}
                      options={unitOptions}
                      onChange={(val) => setUnitId(Number(val))}
                    />
                  </Form.Item>
                </div>
                {requiresCavity && (
                  <Form.Item label={tQrTabletInbound("labelCavity")} required>
                    <Select
                      className="w-full"
                      value={cavityNumber}
                      options={cavityOptions}
                      placeholder={tQrTabletInbound("placeholderCavity")}
                      onChange={(val) =>
                        setCavityNumber(typeof val === "string" ? val : undefined)
                      }
                    />
                  </Form.Item>
                )}
                <Form.Item label={tQrTabletInbound("labelLot")} required>
                  <Input
                    value={lotNumber}
                    onChange={(e) => setLotNumber(e.target.value)}
                  />
                </Form.Item>
                {renderStaffMultiSelect(
                  tQrTabletInbound("labelManufacturing"),
                  manufacturingUsers,
                  setManufacturingUsers,
                  true,
                )}
                {showQcUser &&
                  renderStaffMultiSelect(
                    tQrTabletInbound("labelQc"),
                    qcUsers,
                    setQcUsers,
                    true,
                  )}
                {showPackingUser &&
                  renderStaffSelect(
                    tQrTabletInbound("labelPacking"),
                    packingUser,
                    setPackingUser,
                    true,
                  )}
                <div className="flex flex-col gap-3">
                  {isPackerPackForm ? (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <Button
                          variant="secondary"
                          className="!h-12 w-full !text-lg"
                          loading={packingMutation.isPending}
                          disabled={!isPackingFormReady}
                          onClick={() => handlePackingSubmit("close")}
                        >
                          {tQrTabletInbound("packerCloseButton")}
                        </Button>
                        <Button
                          variant="secondary"
                          className="!h-12 w-full !text-lg"
                          loading={packingMutation.isPending}
                          disabled={!isPackingFormReady}
                          onClick={() => handlePackingSubmit("scanNext")}
                        >
                          {tQrTabletInbound("packerScanNextButton")}
                        </Button>
                      </div>
                      <QrImageImport onDecoded={handleImportDecoded} />
                    </>
                  ) : (
                    <>
                      <Button
                        variant="primary"
                        className="!h-12 w-full !text-lg"
                        loading={scanPending}
                        disabled={!isProductFormReady}
                        onClick={() => setScanMode("location")}
                      >
                        {tQrTabletInbound("scanLocationButton")}
                      </Button>
                      <QrImageImport onDecoded={handleImportDecoded} />
                    </>
                  )}
                </div>
              </>
            )}
          </Form>
        )}
      </Modal>

      <CreateImportModal
        open={formOpen}
        initialGroups={importGroups}
        submitMode="caller"
        lockFromLocation
        warehouseIdOverride={warehouseId ?? selectedWarehouseId}
        onCancel={() => {
          setFormOpen(false);
          setImportGroups(undefined);
        }}
        onSuccess={async (result?: InboundCallerResponse) => {
          setFormOpen(false);
          setImportGroups(undefined);
          if (result) {
            try {
              await sendCallerAddTasks(result);
              message.success(tQrTabletInbound("inboundCompleteWithTasks"));
              return;
            } catch (err) {
              message.error(getApiErrorMessage(err));
              return;
            }
          }
          message.success(tQrTabletInbound("inboundComplete"));
        }}
      />
    </div>
  );
}
