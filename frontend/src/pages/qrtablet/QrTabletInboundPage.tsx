import { useCallback, useEffect, useMemo, useState } from "react";
import { Form, Input, Modal, Progress, Checkbox } from "antd";
import { ScanOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { Button, Select, message } from "@/components/ui";
import { UnitSearchSelect } from "@/components/shared/UnitSearchSelect";
import { QrCameraOverlay, QrImageImport } from "@/components/qr-scan";
import CreateImportModal, {
  type ImportGroupDraft,
} from "@/pages/components/CreateImportModal";
import {
  useAssignOrGetItemStock,
  useCacheForPackingUser,
  useGetPackingUserStocks,
  useManualInboundScan,
  usePreviewQrCode,
  useAssignPackingToItem,
} from "@/hooks/useInboundOrder";
import { getStaffUsernamesApi } from "@/api/auth";
import { getItemAvailableUnitsApi } from "@/api/itemUnit";
import {
  formatUnitSelectOptions,
  suggestQuantityForUnitOption,
  type UnitSelectOption,
} from "@/utils/itemUnitDisplay";
import { getApiErrorMessage, isQrTypeLocationConflictError } from "@/utils/apiErrorMessage";
import {
  isAssignOrGetAssigned,
  isAssignOrGetLocationStocks,
  isAssignOrGetPendingCached,
  isAssignOrGetPreview,
  isManualInboundCreated,
  isManualInboundLocation,
  type AssignedItemStock,
  type AssignOrGetItemStockRequest,
  type AssignOrGetItemStockResponse,
  type CacheForPackingUserRequest,
  type InboundCallerResponse,
  type QrCodePreviewResponse,
} from "@/types/inboundOrder";
import { sendCallerAddTasks } from "@/utils/sendCallerAddTasks";
import {
  PackAggregateError,
  aggregateAssignedPacks,
  aggregatePreviewLinkedPacks,
} from "@/utils/aggregatePackDrafts";
import { useAppStore } from "@/store/useAppStore";
import {
  formatAssignedProduct,
  formatAssignAggregatedHint,
  formatManualCreatedContent,
  formatManualLocationReceived,
  formatManualPendingLocationLabel,
  formatPackerBatchSendProgress,
  formatPackerPendingItemMismatch,
  formatPendingCached,
  tQrTabletInbound,
} from "@/i18n/qrTabletInbound.vi";
import type { InboundScanFlow } from "@/pages/qrtablet/inboundScanFlow";
import InboundScanFlowToggle from "@/pages/qrtablet/InboundScanFlowToggle";
import PackerLocationImportModal from "@/pages/qrtablet/packer/PackerLocationImportModal";
import { mapLocationStocksToImportGroups } from "@/pages/qrtablet/packer/importMappers";
import { usePackerLocationImport } from "@/pages/qrtablet/packer/usePackerLocationImport";
import {
  buildPackerBatchFetchResult,
  type PackerBatchFetchResult,
  validatePackerBatchForAnchor,
} from "@/pages/qrtablet/packer/packerBatchUtils";

type ScanMode = "idle" | "product" | "location" | "packingAssign";

/** Pack QR gần nhất chờ gán item — chỉ giữ 1 bản trên FE. */
type PendingPackAssign = {
  qr_code: string;
  qr_code_id: number;
};

type PendingLocation = {
  location_id: number;
  location_name: string;
  location_code: string;
};

type ItemBatchAnchor = Pick<
  QrCodePreviewResponse,
  "qr_code_id" | "code" | "item_id" | "item_sku" | "item_name"
>;

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
  return users.filter((user) => staffUsernameSet.has((user ?? "").trim()));
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
  const manualScanMutation = useManualInboundScan();
  const previewMutation = usePreviewQrCode();
  const packingMutation = useCacheForPackingUser();
  const packingStocksMutation = useGetPackingUserStocks();
  const assignPackingToItemMutation = useAssignPackingToItem();
  const showPackingAssignScan = isAutoWarehouse && !isPackerMode;

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
  const [packingAssignScanKey, setPackingAssignScanKey] = useState(0);
  const [pendingLocation, setPendingLocation] = useState<PendingLocation | null>(
    null,
  );
  const [preview, setPreview] = useState<QrCodePreviewResponse | null>(null);
  const [quantity, setQuantity] = useState<number>(1);
  const [unitId, setUnitId] = useState<number | undefined>();
  const [lotNumber, setLotNumber] = useState("");
  const [manufacturingUsers, setManufacturingUsers] = useState<string[]>([]);
  const [qcUsers, setQcUsers] = useState<string[]>([]);
  const [packingUser, setPackingUser] = useState<string | undefined>();
  const [cavityNumber, setCavityNumber] = useState<string | undefined>();
  const [unitOptions, setUnitOptions] = useState<UnitSelectOption[]>([]);
  const [itemBaseQuantity, setItemBaseQuantity] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [importGroups, setImportGroups] = useState<ImportGroupDraft[]>();
  const [warehouseId, setWarehouseId] = useState<number | undefined>();
  const [batchUnlinkedPacks, setBatchUnlinkedPacks] = useState<
    AssignedItemStock[]
  >([]);
  const [batchLinkedPacks, setBatchLinkedPacks] = useState<
    AssignedItemStock[]
  >([]);
  const [existingItemPending, setExistingItemPending] =
    useState<AssignedItemStock | null>(null);
  const [selectedNewPackIds, setSelectedNewPackIds] = useState<number[]>([]);
  const [workbenchPackingUser, setWorkbenchPackingUser] = useState<
    string | undefined
  >();
  const [itemBatchAnchor, setItemBatchAnchor] =
    useState<ItemBatchAnchor | null>(null);
  const [packerBatchReviewOpen, setPackerBatchReviewOpen] = useState(false);
  const [packerItemDirectForm, setPackerItemDirectForm] = useState(false);
  const [batchSendProgress, setBatchSendProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [isBatchSending, setIsBatchSending] = useState(false);
  const [pendingPackAssign, setPendingPackAssign] =
    useState<PendingPackAssign | null>(null);
  const [assignLinkedPacks, setAssignLinkedPacks] = useState<
    AssignedItemStock[]
  >([]);
  const [isAssignAggregatedForm, setIsAssignAggregatedForm] = useState(false);
  const [isSplitProduct, setIsSplitProduct] = useState(false);

  const openImportModal = useCallback(
    ({
      groups,
      warehouseId: nextWarehouseId,
    }: {
      groups: ImportGroupDraft[];
      warehouseId: number | undefined;
    }) => {
      setWarehouseId(nextWarehouseId);
      setImportGroups(groups);
      setFormOpen(true);
    },
    [],
  );

  const {
    locationImportOpen,
    locationContext,
    locationPackingUser,
    setLocationPackingUser,
    beginFromLocationScan,
    confirmPackingUser,
    cancel: cancelLocationImport,
    isConfirming: isLocationImportConfirming,
  } = usePackerLocationImport(
    {
      mutateAsync: packingStocksMutation.mutateAsync,
      isPending: packingStocksMutation.isPending,
    },
    openImportModal,
    selectedWarehouseId,
  );

  useEffect(() => {
    setScanFlow(isAutoWarehouse ? "continuous" : "assign");
    setWorkbenchPackingUser(undefined);
    setBatchUnlinkedPacks([]);
    setBatchLinkedPacks([]);
    setExistingItemPending(null);
    setSelectedNewPackIds([]);
    setItemBatchAnchor(null);
    setPackerBatchReviewOpen(false);
    setPackerItemDirectForm(false);
    setBatchSendProgress(null);
    setIsBatchSending(false);
    setPendingPackAssign(null);
    setAssignLinkedPacks([]);
    setIsAssignAggregatedForm(false);
    cancelLocationImport();
    setPreview(null);
    setPendingLocation(null);
  }, [selectedWarehouseId, isAutoWarehouse, cancelLocationImport]);

  const handleScanFlowChange = useCallback(
    (value: InboundScanFlow) => {
      setScanFlow(value);
      setWorkbenchPackingUser(undefined);
      setBatchUnlinkedPacks([]);
      setBatchLinkedPacks([]);
      setExistingItemPending(null);
      setSelectedNewPackIds([]);
      setItemBatchAnchor(null);
      setPackerBatchReviewOpen(false);
      setPackerItemDirectForm(false);
      setBatchSendProgress(null);
      setIsBatchSending(false);
      cancelLocationImport();
      setPreview(null);
      setPendingLocation(null);
      setQuantity(1);
      setUnitId(undefined);
      setLotNumber("");
      setCavityNumber(undefined);
      setManufacturingUsers([]);
      setQcUsers([]);
      setPackingUser(undefined);
      setUnitOptions([]);
      setPendingPackAssign(null);
      setAssignLinkedPacks([]);
      setIsAssignAggregatedForm(false);
    },
    [cancelLocationImport],
  );

  const scanPending =
    assignMutation.isPending ||
    manualScanMutation.isPending ||
    previewMutation.isPending ||
    packingMutation.isPending ||
    packingStocksMutation.isPending ||
    assignPackingToItemMutation.isPending ||
    isBatchSending;
  const isPackerItemPicker =
    isPackerMode &&
    !!preview?.qr_code_id &&
    isItemQrType(preview.qr_type) &&
    !packerItemDirectForm;
  const isPackerItemCacheForm =
    isPackerMode &&
    !!preview?.qr_code_id &&
    isItemQrType(preview.qr_type) &&
    packerItemDirectForm;
  const isPackerPackForm =
    isPackerMode &&
    !!preview?.qr_code_id &&
    isPackQrType(preview.qr_type);
  const isPackerCacheForm = isPackerPackForm || isPackerItemCacheForm;
  const isPendingPackAssignForm =
    !!pendingPackAssign &&
    !!preview?.qr_code_id &&
    isPackQrType(preview.qr_type);

  const batchNewPacksSelected = useMemo(
    () =>
      batchUnlinkedPacks.filter((stock) =>
        selectedNewPackIds.includes(stock.qr_code_id),
      ),
    [batchUnlinkedPacks, selectedNewPackIds],
  );

  const allPacksForAggregation = useMemo(
    () => [...batchLinkedPacks, ...batchNewPacksSelected],
    [batchLinkedPacks, batchNewPacksSelected],
  );

  const aggregatedBatchPreview = useMemo(() => {
    if (!itemBatchAnchor || allPacksForAggregation.length === 0) {
      return null;
    }
    try {
      return aggregateAssignedPacks(
        allPacksForAggregation,
        itemBatchAnchor.item_id,
      );
    } catch {
      return null;
    }
  }, [allPacksForAggregation, itemBatchAnchor]);

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
  const requiresProductStaffFields = useMemo(() => {
    if (!preview) {
      return false;
    }
    return !(
      isItemQrType(preview.qr_type) || isPackQrType(preview.qr_type)
    );
  }, [preview]);

  const isStaffListReady = useCallback(
    (values: string[]) =>
      values.some((value) => staffUsernameSet.has((value ?? "").trim())),
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
  const lotReady = !!(lotNumber ?? "").trim();

  const isPackingFormReady = useMemo(
    () =>
      !!preview &&
      !!quantity &&
      !!unitId &&
      lotReady &&
      (!requiresCavity || !!cavityNumber?.trim()) &&
      (!requiresProductStaffFields ||
        (manufacturingReady &&
          (!showQcUser || isStaffListReady(qcUsers)) &&
          (!showPackingUser || isStaffSelected(packingUser)))),
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
      requiresProductStaffFields,
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
      (!requiresCavity || !!cavityNumber?.trim()) &&
      (!requiresProductStaffFields ||
        (manufacturingReady &&
          (!showQcUser || isStaffListReady(qcUsers)) &&
          (!showPackingUser ||
            isAssignAggregatedForm ||
            isStaffSelected(packingUser)))),
    [
      cavityNumber,
      isAssignAggregatedForm,
      isStaffListReady,
      isStaffSelected,
      lotReady,
      manufacturingReady,
      manufacturingUsers,
      packingUser,
      qcUsers,
      quantity,
      requiresCavity,
      requiresProductStaffFields,
      showPackingUser,
      showQcUser,
      unitId,
    ],
  );

  const assignAggregatedSubmitFields = useMemo(() => {
    if (!isAssignAggregatedForm || !preview?.item_id || assignLinkedPacks.length === 0) {
      return null;
    }
    try {
      return aggregateAssignedPacks(assignLinkedPacks, preview.item_id);
    } catch {
      return null;
    }
  }, [assignLinkedPacks, isAssignAggregatedForm, preview?.item_id]);

  const openPackingAssignScan = useCallback(() => {
    setScanMode("idle");
    setPackingAssignScanKey((key) => key + 1);
    queueMicrotask(() => setScanMode("packingAssign"));
  }, []);

  const resetPreview = useCallback(() => {
    setScanMode("idle");
    setPreview(null);
    setPendingPackAssign(null);
    setPendingLocation(null);
    setPackerItemDirectForm(false);
    setAssignLinkedPacks([]);
    setIsAssignAggregatedForm(false);
    setIsSplitProduct(false);
    setQuantity(1);
    setUnitId(undefined);
    setLotNumber("");
    setCavityNumber(undefined);
    setManufacturingUsers([]);
    setQcUsers([]);
    setPackingUser(undefined);
    setUnitOptions([]);
    setItemBaseQuantity(1);
  }, []);

  const applyAggregatedPreviewToForm = useCallback(
    (
      result: QrCodePreviewResponse,
      aggregated: ReturnType<typeof aggregatePreviewLinkedPacks>,
    ) => {
      setPreview(result);
      setAssignLinkedPacks(aggregated.linked_packs);
      setIsAssignAggregatedForm(true);
      setIsSplitProduct(Boolean(result.is_split));
      setQuantity(aggregated.quantity);
      setItemBaseQuantity(aggregated.quantity);
      setUnitId(aggregated.unit_id);
      setLotNumber(aggregated.lot_number);
      setCavityNumber(aggregated.cavity_number);
      setManufacturingUsers(
        filterKnownStaff(
          parseStaffList(aggregated.manufacturing_user),
          staffUsernameSet,
        ),
      );
      setQcUsers(
        filterKnownStaff(parseStaffList(aggregated.qc_user), staffUsernameSet),
      );
      setPackingUser(undefined);
      setUnitOptions([
        {
          value: aggregated.unit_id,
          label: aggregated.unit_name,
          unit_name: aggregated.unit_name,
        },
      ]);
    },
    [staffUsernameSet],
  );

  const applyPreviewResult = useCallback(
    async (result: QrCodePreviewResponse) => {
      if (result?.qr_code_id == null || result.item_id == null) {
        message.error(tQrTabletInbound("unhandledResponse"));
        return;
      }
      setPackerBatchReviewOpen(false);
      setPackerItemDirectForm(false);
      if (isItemQrType(result.qr_type)) {
        setItemBatchAnchor(null);
        setBatchUnlinkedPacks([]);
        setBatchLinkedPacks([]);
        setExistingItemPending(null);
        setSelectedNewPackIds([]);
        setWorkbenchPackingUser(undefined);
      }

      const shouldAggregate =
        !isPackerMode &&
        isAutoWarehouse &&
        isItemQrType(result.qr_type) &&
        (result.linked_packs?.length ?? 0) > 0;

      if (shouldAggregate) {
        try {
          const aggregated = aggregatePreviewLinkedPacks(result);
          applyAggregatedPreviewToForm(result, aggregated);
          return;
        } catch (err) {
          if (err instanceof PackAggregateError) {
            message.error(tQrTabletInbound(err.messageKey));
            return;
          }
          throw err;
        }
      }

      setAssignLinkedPacks([]);
      setIsAssignAggregatedForm(false);
      setPreview(result);
      setIsSplitProduct(Boolean(result.is_split));
      const defaultQty = result.quantity ?? 1;
      setQuantity(defaultQty);
      setItemBaseQuantity(defaultQty);
      setUnitId(result.unit_id);
      setLotNumber(result.lot_number ?? "");
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
      setUnitOptions([
        {
          value: result.unit_id,
          label: result.unit_name,
          unit_name: result.unit_name,
        },
      ]);
      try {
        const available = await getItemAvailableUnitsApi(result.item_id);
        setUnitOptions(
          formatUnitSelectOptions(
            available.units,
            available.base_unit_name,
            defaultQty,
          ),
        );
      } catch {
        // keep base unit option
      }
    },
    [applyAggregatedPreviewToForm, isAutoWarehouse, isPackerMode, staffUsernameSet],
  );

  const handleAssignPackToItem = useCallback(
    async (itemPreview: QrCodePreviewResponse) => {
      if (!pendingPackAssign) {
        message.warning(tQrTabletInbound("packingNeedPackFirst"));
        return;
      }
      if (!isProductFormReady || unitId == null) {
        message.warning(tQrTabletInbound("packingFormIncomplete"));
        return;
      }
      const result = await assignPackingToItemMutation.mutateAsync({
        qr_code: pendingPackAssign.qr_code,
        warehouse_id: selectedWarehouseId,
        target_qr_id: String(itemPreview.qr_code_id),
        quantity,
        unit_id: unitId,
        lot_number: (lotNumber ?? "").trim(),
        cavity_number: cavityNumber || undefined,
        manufacturing_user: selectedStaffList(manufacturingUsers),
        qc_user: showQcUser ? selectedStaffList(qcUsers) : undefined,
        packing_user: showPackingUser ? selectedStaff(packingUser) : undefined,
      });
      if (isAssignOrGetPendingCached(result)) {
        resetPreview();
        message.success(tQrTabletInbound("packingAssignSuccess"));
        return;
      }
      message.error(tQrTabletInbound("unhandledResponse"));
    },
    [
      assignPackingToItemMutation,
      cavityNumber,
      isProductFormReady,
      lotNumber,
      manufacturingUsers,
      packingUser,
      pendingPackAssign,
      qcUsers,
      quantity,
      resetPreview,
      selectedStaff,
      selectedStaffList,
      selectedWarehouseId,
      showPackingUser,
      showQcUser,
      unitId,
    ],
  );

  const handlePackingAssignScan = useCallback(
    async (scanned: string) => {
      setScanMode("idle");
      if (!selectedWarehouseId) {
        message.warning(tQrTabletInbound("selectWarehouseFirst"));
        return;
      }
      try {
        const lookup = await previewMutation.mutateAsync({
          qr_code: scanned,
          warehouse_id: selectedWarehouseId,
        });
        if (!isAssignOrGetPreview(lookup) || !lookup.preview) {
          message.error(tQrTabletInbound("unhandledResponse"));
          return;
        }

        if (isItemQrType(lookup.preview.qr_type)) {
          await handleAssignPackToItem(lookup.preview);
          return;
        }

        if (!isPackQrType(lookup.preview.qr_type)) {
          message.warning(tQrTabletInbound("packingWrongQrType"));
          return;
        }

        const packPreview = await assignPackingToItemMutation.mutateAsync({
          qr_code: scanned,
          warehouse_id: selectedWarehouseId,
        });
        if (!isAssignOrGetPreview(packPreview) || !packPreview.preview) {
          message.error(tQrTabletInbound("unhandledResponse"));
          return;
        }
        await applyPreviewResult(packPreview.preview);
        setPendingPackAssign({
          qr_code: packPreview.preview.code,
          qr_code_id: packPreview.preview.qr_code_id,
        });
      } catch (err) {
        message.error(getApiErrorMessage(err));
      }
    },
    [
      applyPreviewResult,
      assignPackingToItemMutation,
      handleAssignPackToItem,
      previewMutation,
      selectedWarehouseId,
    ],
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
        setImportGroups(mapLocationStocksToImportGroups(stocks));
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

  const handleManualScanResponse = useCallback(
    async (result: AssignOrGetItemStockResponse) => {
      if (isAssignOrGetPreview(result)) {
        await applyPreviewResult(result.preview);
        return;
      }
      if (isManualInboundLocation(result)) {
        const locationLabel =
          result.location_name ?? result.location_code ?? String(result.location_id);
        setPendingLocation({
          location_id: result.location_id,
          location_name: result.location_name ?? locationLabel,
          location_code: result.location_code ?? locationLabel,
        });
        message.info(formatManualLocationReceived(locationLabel));
        setScanMode("location");
        return;
      }
      if (isManualInboundCreated(result)) {
        resetPreview();
        Modal.success({
          title: tQrTabletInbound("manualCreatedTitle"),
          content: formatManualCreatedContent(result.order_code),
        });
        return;
      }
      message.error(tQrTabletInbound("unhandledResponse"));
    },
    [applyPreviewResult, resetPreview],
  );

  const buildPackingCachePayload = useCallback((): CacheForPackingUserRequest => {
    if (!preview) {
      throw new Error("Missing preview for packing cache");
    }
    const payload: CacheForPackingUserRequest = {
      qr_code: preview.code,
      warehouse_id: selectedWarehouseId,
      quantity,
      unit_id: unitId!,
      lot_number: (lotNumber ?? "").trim(),
      cavity_number: cavityNumber || undefined,
      manufacturing_user: selectedStaffList(manufacturingUsers),
      qc_user: showQcUser ? selectedStaffList(qcUsers) : undefined,
      packing_user: selectedStaff(packingUser),
    };
    return payload;
  }, [
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
    showQcUser,
    unitId,
  ]);

  const fetchPackerBatchSnapshot = useCallback(
    async (
      packingUser: string,
      anchor: ItemBatchAnchor,
    ): Promise<PackerBatchFetchResult> => {
      const [unlinkedResult, linkedResult, itemAnchorsResult] = await Promise.all([
        packingStocksMutation.mutateAsync({
          packingUser,
          linked: false,
        }),
        packingStocksMutation.mutateAsync({
          packingUser,
          linked: true,
        }),
        packingStocksMutation.mutateAsync({
          packingUser,
          pendingRole: "item",
        }),
      ]);
      return buildPackerBatchFetchResult(
        anchor,
        unlinkedResult.items,
        linkedResult.items,
        itemAnchorsResult.items,
      );
    },
    [packingStocksMutation],
  );

  const cachePackingForm = useCallback(async () => {
    if (!isPackingFormReady) {
      return false;
    }
    const result = await packingMutation.mutateAsync(buildPackingCachePayload());
    await handleAssignOrGetResponse(result);
    return true;
  }, [
    buildPackingCachePayload,
    handleAssignOrGetResponse,
    isPackingFormReady,
    packingMutation,
  ]);

  const submitPackingCache = useCallback(
    async (afterSuccess: "close" | "scanNext") => {
      try {
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
    [cachePackingForm, resetPreview],
  );

  const handlePackingUserConfirm = useCallback(async () => {
    const user = selectedStaff(packingUser);
    if (!user || !preview || !isItemQrType(preview.qr_type)) {
      return;
    }

    const anchor: ItemBatchAnchor = {
      qr_code_id: preview.qr_code_id,
      code: preview.code,
      item_id: preview.item_id,
      item_sku: preview.item_sku,
      item_name: preview.item_name,
    };

    try {
      const fetchResult = await fetchPackerBatchSnapshot(user, anchor);
      const validation = validatePackerBatchForAnchor(anchor, fetchResult);

      if (!validation.ok) {
        if (validation.reason === "item_mismatch") {
          message.error(
            formatPackerPendingItemMismatch(
              user,
              validation.pendingStock.item_sku ||
                String(validation.pendingStock.item_id),
              anchor.item_sku || String(anchor.item_id),
            ),
          );
        } else if (validation.reason === "no_pending") {
          setPackerItemDirectForm(true);
        } else {
          message.warning(tQrTabletInbound("packerNoPacksForAnchor"));
        }
        return;
      }

      const { snapshot } = fetchResult;
      setWorkbenchPackingUser(user);
      setBatchUnlinkedPacks(snapshot.unlinkedForItem);
      setBatchLinkedPacks(snapshot.linkedForAnchor);
      setExistingItemPending(snapshot.existingItemPending);
      setSelectedNewPackIds(
        snapshot.unlinkedForItem.map((pack) => pack.qr_code_id),
      );
      setItemBatchAnchor(anchor);
      resetPreview();
      setPackerBatchReviewOpen(true);
    } catch (err) {
      message.error(getApiErrorMessage(err));
    }
  }, [fetchPackerBatchSnapshot, packingUser, preview, resetPreview, selectedStaff]);

  const handlePackingBatchSend = useCallback(async () => {
    const user = workbenchPackingUser;
    if (!user || !itemBatchAnchor) {
      return;
    }

    const fetchResult = await fetchPackerBatchSnapshot(user, itemBatchAnchor);
    const validation = validatePackerBatchForAnchor(itemBatchAnchor, fetchResult);

    if (!validation.ok) {
      if (validation.reason === "item_mismatch") {
        message.error(
          formatPackerPendingItemMismatch(
            user,
            validation.pendingStock.item_sku ||
              String(validation.pendingStock.item_id),
            itemBatchAnchor.item_sku || String(itemBatchAnchor.item_id),
          ),
        );
      } else {
        message.warning(tQrTabletInbound("packerNoPacksForAnchor"));
      }
      return;
    }

    const snapshot = fetchResult.snapshot;
    const packsToLink = snapshot.unlinkedForItem.filter((stock) =>
      selectedNewPackIds.includes(stock.qr_code_id),
    );
    const allPacksToAggregate = [...snapshot.linkedForAnchor, ...packsToLink];

    if (allPacksToAggregate.length === 0) {
      message.warning(tQrTabletInbound("packerNoPacksSelected"));
      return;
    }

    const totalSteps = 1 + packsToLink.length;
    setIsBatchSending(true);
    setBatchSendProgress({ current: 0, total: totalSteps });

    try {
      const aggregated = aggregateAssignedPacks(
        allPacksToAggregate,
        itemBatchAnchor.item_id,
      );

      setBatchSendProgress({ current: 1, total: totalSteps });
      await packingMutation.mutateAsync({
        qr_code: itemBatchAnchor.code,
        warehouse_id: selectedWarehouseId,
        quantity: aggregated.quantity,
        unit_id: aggregated.unit_id,
        lot_number: aggregated.lot_number,
        cavity_number: aggregated.cavity_number,
        manufacturing_user: aggregated.manufacturing_user,
        qc_user: aggregated.qc_user,
        packing_user: user,
      });

      for (let index = 0; index < packsToLink.length; index += 1) {
        const pack = packsToLink[index];
        const lot = (pack.lot_number || pack.lot_number_to || "").trim();
        await packingMutation.mutateAsync({
          qr_code: pack.code,
          warehouse_id: selectedWarehouseId,
          quantity: pack.quantity,
          unit_id: pack.unit_id,
          lot_number: lot,
          cavity_number: pack.cavity_number || undefined,
          manufacturing_user: pack.manufacturing_user!,
          qc_user: pack.qc_user || undefined,
          packing_user: user,
          relation: itemBatchAnchor.qr_code_id,
        });
        setBatchSendProgress({
          current: index + 2,
          total: totalSteps,
        });
      }

      setBatchUnlinkedPacks([]);
      setBatchLinkedPacks([]);
      setExistingItemPending(null);
      setSelectedNewPackIds([]);
      setWorkbenchPackingUser(undefined);
      setItemBatchAnchor(null);
      setPackerBatchReviewOpen(false);
      Modal.success({
        title: tQrTabletInbound("packerBatchSendComplete"),
        centered: true,
      });
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
    fetchPackerBatchSnapshot,
    itemBatchAnchor,
    packingMutation,
    selectedNewPackIds,
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
    (
      scanned: string,
      locationCodeOverride?: string,
    ): AssignOrGetItemStockRequest => {
      if (preview) {
        return {
          qr_code: preview.code,
          raw: locationCodeOverride ?? scanned,
          warehouse_id: selectedWarehouseId,
          quantity,
          unit_id: unitId,
          lot_number: (lotNumber ?? "").trim() || undefined,
          cavity_number: cavityNumber || undefined,
          manufacturing_user: selectedStaffList(manufacturingUsers),
          qc_user: showQcUser ? selectedStaffList(qcUsers) : undefined,
          packing_user: isAssignAggregatedForm
            ? assignAggregatedSubmitFields?.packing_user
            : showPackingUser
              ? selectedStaff(packingUser)
              : undefined,
          is_split: isSplitProduct || undefined,
        };
      }
      return {
        qr_code: scanned,
        warehouse_id: selectedWarehouseId,
      };
    },
    [
      assignAggregatedSubmitFields,
      cavityNumber,
      isAssignAggregatedForm,
      isSplitProduct,
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

  const handleScan = useCallback(
    async (scanned: string) => {
      setScanMode("idle");
      if (!selectedWarehouseId) {
        message.warning(tQrTabletInbound("selectWarehouseFirst"));
        return;
      }
      try {
        if (isPackerMode) {
          const result = await previewMutation.mutateAsync({
            qr_code: scanned,
            warehouse_id: selectedWarehouseId,
          });
          if (isAssignOrGetLocationStocks(result)) {
            resetPreview();
            beginFromLocationScan(result);
            return;
          }
          if (isAssignOrGetPreview(result)) {
            await applyPreviewResult(result.preview);
            return;
          }
          message.error(tQrTabletInbound("unhandledResponse"));
          return;
        }
        if (!isAutoWarehouse) {
          const result = await manualScanMutation.mutateAsync(
            buildScanPayload(scanned),
          );
          await handleManualScanResponse(result);
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
      handleManualScanResponse,
      isAutoWarehouse,
      isPackerMode,
      beginFromLocationScan,
      manualScanMutation,
      previewMutation,
      resetPreview,
      selectedWarehouseId,
    ],
  );

  const handleManualConfirm = useCallback(async () => {
    if (!pendingLocation || !preview || !isProductFormReady) {
      return;
    }
    if (!selectedWarehouseId) {
      message.warning(tQrTabletInbound("selectWarehouseFirst"));
      return;
    }
    try {
      const result = await manualScanMutation.mutateAsync(
        buildScanPayload(
          pendingLocation.location_code,
          pendingLocation.location_code,
        ),
      );
      await handleManualScanResponse(result);
    } catch (err) {
      message.error(getApiErrorMessage(err));
    }
  }, [
    buildScanPayload,
    handleManualScanResponse,
    isProductFormReady,
    manualScanMutation,
    pendingLocation,
    preview,
    selectedWarehouseId,
  ]);

  const handleImportDecoded = useCallback(
    async (text: string) => {
      if (!selectedWarehouseId) {
        message.warning(tQrTabletInbound("selectWarehouseFirst"));
        return;
      }
      try {
        if (isPackerCacheForm && preview && isPackingFormReady) {
          const cached = await cachePackingForm();
          if (!cached) {
            return;
          }
          resetPreview();
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
      cachePackingForm,
      handleScan,
      isPackerCacheForm,
      isPackingFormReady,
      preview,
      resetPreview,
      selectedWarehouseId,
    ],
  );

  const handlePackingAssignImportDecoded = useCallback(
    async (text: string) => {
      if (!selectedWarehouseId) {
        message.warning(tQrTabletInbound("selectWarehouseFirst"));
        return;
      }
      try {
        await handlePackingAssignScan(text);
      } catch (err) {
        message.error(getApiErrorMessage(err));
      }
    },
    [handlePackingAssignScan, selectedWarehouseId],
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

  const renderBatchPackRow = (
    pack: AssignedItemStock,
    index: number,
    options?: { selectable?: boolean; checked?: boolean },
  ) => {
    const content = (
      <>
        <p className="font-mono text-base font-bold text-brand-dark">
          {pack.code}
        </p>
        <p className="mt-1 text-sm text-stripe-ink-secondary">
          SL {pack.quantity} {pack.unit_name} · Lô{" "}
          {pack.lot_number || pack.lot_number_to}
        </p>
      </>
    );

    if (options?.selectable) {
      return (
        <label
          key={`${pack.qr_code_id}-${index}`}
          className="flex cursor-pointer items-start gap-3 rounded-xl border border-stripe-hairline bg-stripe-canvas-soft px-4 py-3 has-[:checked]:border-brand-primary has-[:checked]:bg-stripe-primary-subdued/30"
        >
          <Checkbox
            className="!mt-1"
            checked={options.checked}
            disabled={isBatchSending}
            onChange={(event) => {
              const packId = pack.qr_code_id;
              setSelectedNewPackIds((prev) =>
                event.target.checked
                  ? prev.includes(packId)
                    ? prev
                    : [...prev, packId]
                  : prev.filter((id) => id !== packId),
              );
            }}
          />
          <div className="min-w-0 flex-1">{content}</div>
        </label>
      );
    }

    return (
      <div
        key={`${pack.qr_code_id}-${index}`}
        className="rounded-xl border border-stripe-hairline bg-stripe-canvas-soft px-4 py-3"
      >
        {content}
      </div>
    );
  };

  const assignAggregatedUnitName =
    unitOptions.find((option) => option.value === unitId)?.unit_name ??
    assignLinkedPacks[0]?.unit_name ??
    preview?.unit_name ??
    "—";

  const showSplitProductToggle =
    isAutoWarehouse &&
    !isPackerMode &&
    !isPackerItemPicker &&
    !isPackerCacheForm &&
    !isPendingPackAssignForm;

  const renderSplitProductToggle = () =>
    showSplitProductToggle ? (
      <Form.Item className="!mb-4">
        <Checkbox
          checked={isSplitProduct}
          onChange={(event) => setIsSplitProduct(event.target.checked)}
        >
          {tQrTabletInbound("splitProductLabel")}
        </Checkbox>
        <p className="mt-1 text-xs text-stripe-ink-mute">
          {tQrTabletInbound("splitProductHint")}
        </p>
      </Form.Item>
    ) : null;

  const renderAssignAggregatedForm = () => (
    <>
      <p className="mb-4 text-sm text-stripe-ink-mute">
        {formatAssignAggregatedHint(assignLinkedPacks.length)}
      </p>
      <div className="mb-5 rounded-2xl border border-stripe-hairline bg-stripe-canvas-soft p-5">
        <p className="mb-4 text-xs font-bold uppercase tracking-[0.14em] text-stripe-ink-mute">
          {tQrTabletInbound("assignAggregatedSummarySection")}
        </p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <PackerStockField
            label={tQrTabletInbound("labelQuantity")}
            value={String(quantity)}
          />
          <PackerStockField
            label={tQrTabletInbound("labelUnit")}
            value={assignAggregatedUnitName}
          />
          <PackerStockField
            label={tQrTabletInbound("labelLot")}
            value={lotNumber}
          />
          {requiresCavity ? (
            <PackerStockField
              label={tQrTabletInbound("labelCavity")}
              value={cavityNumber}
            />
          ) : null}
          <PackerStockField
            label={tQrTabletInbound("labelManufacturing")}
            value={serializeStaffList(manufacturingUsers)}
          />
          {showQcUser ? (
            <PackerStockField
              label={tQrTabletInbound("labelQc")}
              value={serializeStaffList(qcUsers)}
            />
          ) : null}
        </div>
      </div>
      <div className="mb-5 rounded-2xl border border-stripe-hairline bg-white p-5">
        <p className="mb-4 text-xs font-bold uppercase tracking-[0.14em] text-stripe-ink-mute">
          {tQrTabletInbound("assignAggregatedPacksSection")}
        </p>
        <div className="space-y-3">
          {assignLinkedPacks.map((pack, index) =>
            renderBatchPackRow(pack, index),
          )}
        </div>
      </div>
      {renderSplitProductToggle()}
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
  );

  const renderPackerBatchReview = () => {
    if (!itemBatchAnchor) {
      return null;
    }
    const batchUnitName =
      allPacksForAggregation[0]?.unit_name ??
      batchLinkedPacks[0]?.unit_name ??
      batchUnlinkedPacks[0]?.unit_name ??
      "—";

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

        {existingItemPending ? (
          <div className="rounded-2xl border border-stripe-hairline bg-stripe-canvas-soft p-5">
            <p className="mb-4 text-xs font-bold uppercase tracking-[0.14em] text-stripe-ink-mute">
              {tQrTabletInbound("packerBatchReviewExistingItemSection")}
            </p>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <PackerStockField
                label={tQrTabletInbound("labelQuantity")}
                value={String(existingItemPending.quantity)}
              />
              <PackerStockField
                label={tQrTabletInbound("labelUnit")}
                value={existingItemPending.unit_name}
              />
              <PackerStockField
                label={tQrTabletInbound("labelLot")}
                value={
                  existingItemPending.lot_number ||
                  existingItemPending.lot_number_to
                }
              />
              <PackerStockField
                label={tQrTabletInbound("labelCavity")}
                value={existingItemPending.cavity_number}
              />
            </div>
          </div>
        ) : null}

        <div className="rounded-2xl border border-stripe-hairline bg-white p-5">
          <p className="mb-4 text-xs font-bold uppercase tracking-[0.14em] text-stripe-ink-mute">
            {tQrTabletInbound("packerBatchReviewItemSection")}
          </p>
          <p className="font-mono text-lg font-bold text-brand-dark">
            {itemBatchAnchor.code}
          </p>
          <p className="mt-1 text-base text-stripe-ink-secondary">
            {itemBatchAnchor.item_sku}
            {itemBatchAnchor.item_name
              ? ` — ${itemBatchAnchor.item_name}`
              : null}
          </p>
          <p className="mt-4 text-xs font-bold uppercase tracking-[0.14em] text-stripe-ink-mute">
            {tQrTabletInbound("packerBatchReviewAggregatedSection")}
          </p>
          {aggregatedBatchPreview ? (
            <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
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
            <p className="mt-3 text-sm font-medium text-red-600">
              {allPacksForAggregation.length === 0
                ? tQrTabletInbound("packerNoPacksSelected")
                : tQrTabletInbound("packerInvalidLot")}
            </p>
          )}
        </div>

        {batchLinkedPacks.length > 0 ? (
          <div className="rounded-2xl border border-stripe-hairline bg-white p-5">
            <p className="mb-4 text-xs font-bold uppercase tracking-[0.14em] text-stripe-ink-mute">
              {tQrTabletInbound("packerBatchReviewExistingPacksSection")} (
              {batchLinkedPacks.length})
            </p>
            <div className="max-h-[28vh] space-y-3 overflow-y-auto">
              {batchLinkedPacks.map((pack, index) =>
                renderBatchPackRow(pack, index),
              )}
            </div>
          </div>
        ) : null}

        <div className="rounded-2xl border border-stripe-hairline bg-white p-5">
          <p className="mb-4 text-xs font-bold uppercase tracking-[0.14em] text-stripe-ink-mute">
            {tQrTabletInbound("packerBatchReviewNewPacksSection")} (
            {batchNewPacksSelected.length}/{batchUnlinkedPacks.length})
          </p>
          {batchUnlinkedPacks.length === 0 ? (
            <p className="text-sm text-stripe-ink-mute">
              {tQrTabletInbound("packerNoPacksToConfirm")}
            </p>
          ) : (
            <div className="max-h-[28vh] space-y-3 overflow-y-auto">
              {batchUnlinkedPacks.map((pack, index) =>
                renderBatchPackRow(pack, index, {
                  selectable: true,
                  checked: selectedNewPackIds.includes(pack.qr_code_id),
                }),
              )}
            </div>
          )}
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
            allPacksForAggregation.length === 0 ||
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
          <div
            className={
              showPackingAssignScan
                ? "grid grid-cols-1 gap-3 sm:grid-cols-2"
                : "flex flex-col gap-3"
            }
          >
            <Button
              variant="primary"
              icon={<ScanOutlined />}
              className="!h-14 w-full !text-lg md:!h-16 md:!text-xl"
              loading={scanPending}
              onClick={() => setScanMode("product")}
            >
              {tQrTabletInbound("startScan")}
            </Button>
            {showPackingAssignScan && (
              <Button
                variant="secondary"
                icon={<ScanOutlined />}
                className="!h-14 w-full !border-amber-400 !bg-amber-400 !text-lg !text-amber-950 hover:!border-amber-500 hover:!bg-amber-500 hover:!text-amber-950 md:!h-16 md:!text-xl"
                loading={scanPending}
                onClick={openPackingAssignScan}
              >
                {tQrTabletInbound("startPackingScan")}
              </Button>
            )}
          </div>
          {showPackingAssignScan ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <QrImageImport
                label={tQrTabletInbound("importQrTestNormal")}
                onDecoded={handleImportDecoded}
              />
              <QrImageImport
                label={tQrTabletInbound("importQrTestPacking")}
                className="!border-amber-400 !bg-amber-400 !text-amber-950 hover:!border-amber-500 hover:!bg-amber-500 hover:!text-amber-950"
                onDecoded={handlePackingAssignImportDecoded}
              />
            </div>
          ) : (
            <QrImageImport onDecoded={handleImportDecoded} />
          )}
        </div>
      </div>

      {scanMode === "product" && (
        <QrCameraOverlay
          title={tQrTabletInbound("scanQrTitle")}
          onScan={(text) => void handleScan(text)}
          onClose={() => setScanMode("idle")}
        />
      )}

      {scanMode === "packingAssign" && (
        <QrCameraOverlay
          key={packingAssignScanKey}
          title={tQrTabletInbound("packingScanTitle")}
          onScan={(text) => void handlePackingAssignScan(text)}
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
          setItemBatchAnchor(null);
          setWorkbenchPackingUser(undefined);
          setBatchUnlinkedPacks([]);
          setBatchLinkedPacks([]);
          setExistingItemPending(null);
          setSelectedNewPackIds([]);
        }}
        footer={null}
        centered
        width={920}
        destroyOnHidden
        closable={!isBatchSending}
        mask={{ closable: !isBatchSending }}
      >
        {renderPackerBatchReview()}
      </Modal>

      <Modal
        title={tQrTabletInbound("confirmProductTitle")}
        open={!!preview?.qr_code_id && scanMode === "idle"}
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
            ) : isAssignAggregatedForm ? (
              renderAssignAggregatedForm()
            ) : (
              <>
                {isTransitPreview(preview) && (
                  <p className="mb-4 text-sm text-stripe-ink-mute">
                    {tQrTabletInbound("transitHint")}
                  </p>
                )}
                {isPackerItemCacheForm && (
                  <p className="mb-4 text-sm text-stripe-ink-mute">
                    {tQrTabletInbound("packerItemDirectFormHint")}
                  </p>
                )}
                {requiresProductStaffFields && !isPackerItemCacheForm && (
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
                    <UnitSearchSelect
                      placeholder="Gõ 1–2 ký tự để gợi ý đơn vị"
                      value={unitId}
                      options={unitOptions}
                      onChange={(val, option) => {
                        setUnitId(val);
                        const suggested = suggestQuantityForUnitOption(
                          val,
                          unitOptions,
                          itemBaseQuantity,
                        );
                        if (option?.suggested_quantity) {
                          setQuantity(suggested);
                        }
                      }}
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
                  requiresProductStaffFields,
                )}
                {showQcUser &&
                  renderStaffMultiSelect(
                    tQrTabletInbound("labelQc"),
                    qcUsers,
                    setQcUsers,
                    requiresProductStaffFields,
                  )}
                {showPackingUser &&
                  renderStaffSelect(
                    tQrTabletInbound("labelPacking"),
                    packingUser,
                    setPackingUser,
                    requiresProductStaffFields,
                  )}
                {renderSplitProductToggle()}
                <div className="flex flex-col gap-3">
                  {isPackerCacheForm ? (
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
                  ) : isPendingPackAssignForm ? (
                    <>
                      <Button
                        variant="secondary"
                        className="!h-12 w-full !border-amber-400 !bg-amber-400 !text-lg !text-amber-950 hover:!border-amber-500 hover:!bg-amber-500 hover:!text-amber-950"
                        loading={scanPending}
                        onClick={openPackingAssignScan}
                      >
                        {tQrTabletInbound("packerScanNextButton")}
                      </Button>
                      <QrImageImport
                        label={tQrTabletInbound("importQrTestPacking")}
                        className="!border-amber-400 !bg-amber-400 !text-amber-950 hover:!border-amber-500 hover:!bg-amber-500 hover:!text-amber-950"
                        onDecoded={handlePackingAssignImportDecoded}
                      />
                    </>
                  ) : (
                    <>
                      {!isAutoWarehouse && pendingLocation && (
                        <p className="rounded-lg bg-brand-primary/10 px-3 py-2 text-sm text-brand-dark">
                          {formatManualPendingLocationLabel(
                            pendingLocation.location_name,
                          )}
                        </p>
                      )}
                      <Button
                        variant="primary"
                        className="!h-12 w-full !text-lg"
                        loading={scanPending}
                        disabled={!isProductFormReady}
                        onClick={() => setScanMode("location")}
                      >
                        {tQrTabletInbound("scanLocationButton")}
                      </Button>
                      {!isAutoWarehouse && pendingLocation && (
                        <Button
                          variant="secondary"
                          className="!h-12 w-full !text-lg"
                          loading={manualScanMutation.isPending}
                          disabled={!isProductFormReady}
                          onClick={() => void handleManualConfirm()}
                        >
                          {tQrTabletInbound("manualConfirmButton")}
                        </Button>
                      )}
                      <QrImageImport onDecoded={handleImportDecoded} />
                    </>
                  )}
                </div>
              </>
            )}
          </Form>
        )}
      </Modal>

      <PackerLocationImportModal
        open={locationImportOpen}
        locationContext={locationContext}
        packingUser={locationPackingUser}
        onPackingUserChange={setLocationPackingUser}
        staffOptions={staffOptions}
        staffLoading={staffLoading}
        staffError={staffError}
        isStaffSelected={isStaffSelected}
        confirming={isLocationImportConfirming}
        onConfirm={() => {
          void confirmPackingUser().catch((err) =>
            message.error(getApiErrorMessage(err)),
          );
        }}
        onCancel={cancelLocationImport}
      />

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
