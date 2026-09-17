import { useCallback, useEffect, useMemo, useState } from "react";
import { Form, Input, Modal, Progress, Checkbox } from "antd";
import { ScanOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Button, Select, message } from "@/components/ui";
import { UnitSearchSelect } from "@/components/shared/UnitSearchSelect";
import { QrCameraOverlay, QrImageImport } from "@/components/qr-scan";
import CreateImportModal, {
  type ImportGroupDraft,
} from "@/pages/components/CreateImportModal";
import CreateOutboundModal, {
  type OutboundItemDraft,
} from "@/pages/components/CreateOutboundModal";
import { getStockSplitApi } from "@/api/itemStock";
import type { ItemStockResponse } from "@/types/itemStock";
import {
  useAssignOrGetItemStock,
  useCacheForPackingUser,
  useGetPackingUserStocks,
  useManualInboundScan,
  usePreviewQrCode,
  useAssignPackingToItem,
} from "@/hooks/useInboundOrder";
import { getStaffUsernamesApi } from "@/api/auth";
import { useInboundBufferLocations } from "@/hooks/useWarehouseMap";
import { convertQuantityApi, getItemAvailableUnitsApi } from "@/api/itemUnit";
import { formatQuantity } from "@/utils/formatQuantity";
import {
  formatUnitSelectOptions,
  isCaiUnitName,
  shouldEnableSplitProduct,
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
  type AssignPackingToItemRequest,
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
  formatFeBatchAdded,
  formatFeBatchDuplicate,
  formatFeBatchSendComplete,
  formatFeBatchSendPartial,
  formatFeBatchSendProgress,
  formatFeBatchSubmitHint,
  formatManualLocationReceived,
  formatPackerBatchSendProgress,
  formatPackerPendingItemMismatch,
  formatPendingCached,
  tQrTabletInbound,
} from "@/i18n/qrTabletInbound.vi";
import { executeFeBatchSubmit } from "@/pages/qrtablet/feBatchScan/executeFeBatchSubmit";
import {
  countBatchSubmitTargets,
  entryFromPreview,
  kindForPreview,
  resolveBatchTargets,
  totalQueueCount,
} from "@/pages/qrtablet/feBatchScan/feBatchScanUtils";
import { useFeBatchScanQueue } from "@/pages/qrtablet/feBatchScan/useFeBatchScanQueue";
import type { InboundScanFlow } from "@/pages/qrtablet/inboundScanFlow";
import InboundScanFlowToggle from "@/pages/qrtablet/InboundScanFlowToggle";
import FeBatchCollectToggle from "@/pages/qrtablet/FeBatchCollectToggle";
import PackerLocationImportModal from "@/pages/qrtablet/packer/PackerLocationImportModal";
import { mapLocationStocksToImportGroups } from "@/pages/qrtablet/packer/importMappers";
import { usePackerLocationImport } from "@/pages/qrtablet/packer/usePackerLocationImport";
import SplitStockPreviewModal from "@/pages/qrtablet/SplitStockPreviewModal";
import {
  buildPackerBatchFetchResult,
  type PackerBatchFetchResult,
  validatePackerBatchForAnchor,
} from "@/pages/qrtablet/packer/packerBatchUtils";
import {
  shouldRunSplitStockGate,
  shouldShowSplitProductToggle,
  splitProductSubmitFlag,
} from "@/config/splitProductConfig";
import { resolveInboundLotValidation } from "@/config/warehouseMode";
import {
  LOT_NUMBER_LEGACY_HINT,
  validateLotNumber,
} from "@/utils/lotNumberValidation";

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

type SplitGatePending = {
  preview: QrCodePreviewResponse;
  onContinue: () => Promise<void>;
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
  const navigate = useNavigate();
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
    collectMode,
    setCollectMode,
    queues: feBatchQueues,
    addToQueue: addFeBatchEntry,
    removeSucceededFromQueue: removeFeBatchSucceeded,
    sendProgress: feBatchSendProgress,
    isSending: isFeBatchSending,
    beginSending: beginFeBatchSending,
    updateSendProgress: updateFeBatchSendProgress,
    finishSending: finishFeBatchSending,
  } = useFeBatchScanQueue(selectedWarehouseId);
  const feBatchTotalCount = totalQueueCount(feBatchQueues);

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
  const [manufacturingMachine, setManufacturingMachine] = useState<
    string | undefined
  >();
  const {
    data: inboundBufferData,
    isLoading: inboundBufferLoading,
  } = useInboundBufferLocations(selectedWarehouseId ?? 0, !!preview);
  const manufacturingMachineOptions = useMemo(
    () =>
      (inboundBufferData?.items ?? []).map((loc) => ({
        value: loc.location_name ?? loc.location_code,
        label: `${loc.location_code}${loc.location_name ? ` — ${loc.location_name}` : ""}`,
      })),
    [inboundBufferData],
  );
  const [qcUsers, setQcUsers] = useState<string[]>([]);
  const [packingUser, setPackingUser] = useState<string | undefined>();
  const [cavityNumber, setCavityNumber] = useState<string | undefined>();
  const [unitOptions, setUnitOptions] = useState<UnitSelectOption[]>([]);
  const [itemBaseQuantity, setItemBaseQuantity] = useState(1);
  const [convertedQuantity, setConvertedQuantity] = useState<number | undefined>();
  const [convertedUnitName, setConvertedUnitName] = useState<string | undefined>();
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
  const [splitPreviewOpen, setSplitPreviewOpen] = useState(false);
  const [splitStocks, setSplitStocks] = useState<ItemStockResponse[]>([]);
  const [splitGatePending, setSplitGatePending] =
    useState<SplitGatePending | null>(null);
  const [splitOutboundOpen, setSplitOutboundOpen] = useState(false);

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
    setSplitPreviewOpen(false);
    setSplitStocks([]);
    setSplitGatePending(null);
    setSplitOutboundOpen(false);
    setConvertedQuantity(undefined);
    setConvertedUnitName(undefined);
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
      setManufacturingMachine(undefined);
      setQcUsers([]);
      setPackingUser(undefined);
      setUnitOptions([]);
      setPendingPackAssign(null);
      setAssignLinkedPacks([]);
      setIsAssignAggregatedForm(false);
      setConvertedQuantity(undefined);
      setConvertedUnitName(undefined);
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
    isBatchSending ||
    isFeBatchSending;
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

  const splitProductToggleContext = useMemo(
    () => ({
      inboundType,
      previewQrType: preview?.qr_type,
      isPackerItemPicker,
    }),
    [inboundType, isPackerItemPicker, preview?.qr_type],
  );

  const showSplitProductToggle = shouldShowSplitProductToggle(
    splitProductToggleContext,
  );

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
  const lotValidation = useMemo(
    () => resolveInboundLotValidation(selectedWarehouseId ?? 0),
    [selectedWarehouseId],
  );
  const lotValidationResult = useMemo(
    () => validateLotNumber(lotNumber, lotValidation),
    [lotNumber, lotValidation],
  );
  const lotReady = lotValidationResult.valid;

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
    setManufacturingMachine(undefined);
    setQcUsers([]);
    setPackingUser(undefined);
      setUnitOptions([]);
      setItemBaseQuantity(1);
      setConvertedQuantity(undefined);
      setConvertedUnitName(undefined);
  }, []);

  const refreshConvertedQuantity = useCallback(
    async (itemId: number, nextUnitId: number, nextQuantity: number) => {
      if (!itemId || !nextUnitId || nextQuantity <= 0) {
        setConvertedQuantity(undefined);
        setConvertedUnitName(undefined);
        return;
      }
      try {
        const converted = await convertQuantityApi({
          item_id: itemId,
          unit_id: nextUnitId,
          quantity: nextQuantity,
        });
        setConvertedQuantity(Number(converted.converted_quantity));
        setConvertedUnitName(converted.base_unit_name);
      } catch (err) {
        setConvertedQuantity(undefined);
        setConvertedUnitName(undefined);
        message.error(getApiErrorMessage(err));
      }
    },
    [],
  );

  useEffect(() => {
    if (!preview?.item_id || unitId == null || quantity <= 0) {
      setConvertedQuantity(undefined);
      setConvertedUnitName(undefined);
      return;
    }
    void refreshConvertedQuantity(preview.item_id, unitId, quantity);
  }, [preview?.item_id, unitId, quantity, refreshConvertedQuantity]);

  const convertedQuantityLabel = useMemo(() => {
    if (convertedQuantity != null && convertedUnitName) {
      return `${formatQuantity(convertedQuantity)} ${convertedUnitName}`;
    }
    return "—";
  }, [convertedQuantity, convertedUnitName]);

  const applyAggregatedPreviewToForm = useCallback(
    (
      result: QrCodePreviewResponse,
      aggregated: ReturnType<typeof aggregatePreviewLinkedPacks>,
    ) => {
      setPreview(result);
      setAssignLinkedPacks(aggregated.linked_packs);
      setIsAssignAggregatedForm(true);
      setIsSplitProduct(isCaiUnitName(aggregated.unit_name));
      setQuantity(aggregated.quantity);
      setItemBaseQuantity(aggregated.quantity);
      setUnitId(aggregated.unit_id);
      setLotNumber(aggregated.lot_number);
      setCavityNumber(aggregated.cavity_number);
      setManufacturingMachine(aggregated.manufacturing_machine ?? undefined);
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
        feBatchQueues.product.length === 0 &&
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
      const defaultQty = result.quantity ?? 1;
      setQuantity(defaultQty);
      setItemBaseQuantity(defaultQty);
      setUnitId(result.unit_id);
      setLotNumber(result.lot_number ?? "");
      setCavityNumber(result.cavity_number ?? result.cavity_numbers?.[0]);
      setManufacturingMachine(result.manufacturing_machine ?? undefined);
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
      const initialUnitOptions: UnitSelectOption[] = [
        {
          value: result.unit_id,
          label: result.unit_name,
          unit_name: result.unit_name,
        },
      ];
      setUnitOptions(initialUnitOptions);
      setIsSplitProduct(
        shouldEnableSplitProduct(result.unit_id, initialUnitOptions),
      );
      try {
        const available = await getItemAvailableUnitsApi(result.item_id);
        const nextUnitOptions = formatUnitSelectOptions(
          available.units,
          available.base_unit_name,
          defaultQty,
        );
        setUnitOptions(nextUnitOptions);
        setIsSplitProduct(
          shouldEnableSplitProduct(result.unit_id, nextUnitOptions),
        );
      } catch {
        // keep base unit option
      }
    },
    [
      applyAggregatedPreviewToForm,
      feBatchQueues.product.length,
      isAutoWarehouse,
      isPackerMode,
      staffUsernameSet,
    ],
  );

  const handlePreviewWithSplitGate = useCallback(
    async (
      previewResult: QrCodePreviewResponse,
      continueAssignFlow: () => Promise<void>,
    ) => {
      if (!shouldRunSplitStockGate(inboundType, previewResult)) {
        await continueAssignFlow();
        return;
      }
      try {
        const split = await getStockSplitApi(previewResult.item_id);
        if (split.total > 0) {
          setSplitGatePending({
            preview: previewResult,
            onContinue: continueAssignFlow,
          });
          setSplitStocks(split.items);
          setSplitPreviewOpen(true);
          return;
        }
      } catch (err) {
        message.error(getApiErrorMessage(err));
      }
      await continueAssignFlow();
    },
    [inboundType],
  );

  const handleSplitStockClose = useCallback(async () => {
    const pending = splitGatePending;
    setSplitPreviewOpen(false);
    setSplitGatePending(null);
    setSplitStocks([]);
    if (pending) {
      await pending.onContinue();
    }
  }, [splitGatePending]);

  const handleSplitStockExport = useCallback(() => {
    setSplitPreviewOpen(false);
    setSplitOutboundOpen(true);
  }, []);

  const handleSplitOutboundSuccess = useCallback(
    (created?: { id: number }) => {
      setSplitOutboundOpen(false);
      setSplitPreviewOpen(false);
      setSplitGatePending(null);
      setSplitStocks([]);
      resetPreview();
      if (created?.id) {
        navigate(`/qrtablet/export/${created.id}`);
      }
    },
    [navigate, resetPreview],
  );

  const handleSplitOutboundCancel = useCallback(() => {
    setSplitOutboundOpen(false);
    setSplitPreviewOpen(true);
  }, []);

  const splitOutboundPrefill = useMemo((): {
    initialDetails: Record<string, unknown>;
    initialItems: OutboundItemDraft[];
  } | null => {
    const previewResult = splitGatePending?.preview;
    if (!previewResult?.item_id || previewResult.unit_id == null) {
      return null;
    }
    return {
      initialDetails: { type: "Lấy lẻ" },
      initialItems: [
        {
          key: "split-prefill",
          item_id: previewResult.item_id,
          sku: previewResult.item_sku ?? undefined,
          item_name: previewResult.item_name ?? undefined,
          unit_id: previewResult.unit_id,
          quantity: 1,
        },
      ],
    };
  }, [splitGatePending?.preview]);

  const showFeBatchSubmitOutcome = useCallback(
    (
      result: { succeeded: string[]; failed: { code: string; error: string }[] },
      onAllSuccess?: () => void,
    ) => {
      const total = result.succeeded.length + result.failed.length;
      if (result.failed.length === 0) {
        Modal.success({
          title: formatFeBatchSendComplete(result.succeeded.length),
          centered: true,
          onOk: onAllSuccess,
        });
        return;
      }
      const details = result.failed
        .map((item) => `${item.code}: ${item.error}`)
        .join("; ");
      Modal.warning({
        title: tQrTabletInbound("feBatchSendPartial"),
        content: formatFeBatchSendPartial(
          result.succeeded.length,
          total,
          result.failed.length,
          details,
        ),
        centered: true,
      });
    },
    [],
  );

  const handleFeBatchCollectScan = useCallback(
    async (scanned: string, resumeScanMode: ScanMode) => {
      try {
        const result = await previewMutation.mutateAsync({
          qr_code: scanned,
          warehouse_id: selectedWarehouseId,
        });
        if (isAssignOrGetLocationStocks(result)) {
          message.warning(tQrTabletInbound("feBatchLocationRejected"));
          return;
        }
        if (!isAssignOrGetPreview(result) || !result.preview) {
          message.error(tQrTabletInbound("unhandledResponse"));
          return;
        }
        const kind = kindForPreview(result.preview);
        if (kind === "transit") {
          message.warning(tQrTabletInbound("feBatchTransitRejected"));
          return;
        }
        if (kind === "unsupported") {
          message.warning(tQrTabletInbound("feBatchUnsupportedRejected"));
          return;
        }
        const { added, duplicate, newCount } = addFeBatchEntry(
          kind,
          entryFromPreview(result.preview),
        );
        if (duplicate) {
          message.info(formatFeBatchDuplicate(result.preview.code));
        } else if (added) {
          message.success(formatFeBatchAdded(result.preview.code, newCount));
        }
      } catch (err) {
        message.error(getApiErrorMessage(err));
      } finally {
        setScanMode(resumeScanMode);
      }
    },
    [addFeBatchEntry, previewMutation, selectedWarehouseId],
  );

  const buildSharedAssignFields = useCallback(() => {
    return {
      warehouse_id: selectedWarehouseId,
      quantity,
      unit_id: unitId,
      lot_number: (lotNumber ?? "").trim() || undefined,
      cavity_number: cavityNumber || undefined,
      manufacturing_user: selectedStaffList(manufacturingUsers),
      manufacturing_machine: manufacturingMachine || undefined,
      qc_user: showQcUser ? selectedStaffList(qcUsers) : undefined,
      packing_user: isAssignAggregatedForm
        ? assignAggregatedSubmitFields?.packing_user
        : showPackingUser
          ? selectedStaff(packingUser)
          : undefined,
      is_split: splitProductSubmitFlag(
        splitProductToggleContext,
        isSplitProduct,
      ),
    };
  }, [
    assignAggregatedSubmitFields,
    cavityNumber,
    isAssignAggregatedForm,
    isSplitProduct,
    lotNumber,
    manufacturingMachine,
    manufacturingUsers,
    packingUser,
    qcUsers,
    quantity,
    selectedStaff,
    selectedStaffList,
    selectedWarehouseId,
    showPackingUser,
    showQcUser,
    splitProductToggleContext,
    unitId,
  ]);

  const buildScanPayloadForQr = useCallback(
    (qrCode: string, locationRaw: string): AssignOrGetItemStockRequest => ({
      qr_code: qrCode,
      raw: locationRaw,
      ...buildSharedAssignFields(),
    }),
    [buildSharedAssignFields],
  );

  const buildManualCachePayload = useCallback(
    (productCode: string): AssignOrGetItemStockRequest => ({
      raw: productCode,
      ...buildSharedAssignFields(),
    }),
    [buildSharedAssignFields],
  );

  const buildPackingCachePayloadForQr = useCallback(
    (qrCode: string): CacheForPackingUserRequest => ({
      qr_code: qrCode,
      quantity: quantity,
      unit_id: unitId!,
      lot_number: (lotNumber ?? "").trim(),
      cavity_number: cavityNumber || undefined,
      manufacturing_user: selectedStaffList(manufacturingUsers),
      manufacturing_machine: manufacturingMachine || undefined,
      qc_user: showQcUser ? selectedStaffList(qcUsers) : undefined,
      packing_user: selectedStaff(packingUser),
      is_split: splitProductSubmitFlag(
        splitProductToggleContext,
        isSplitProduct,
      ),
      warehouse_id: selectedWarehouseId,
    }),
    [
      cavityNumber,
      isSplitProduct,
      lotNumber,
      manufacturingMachine,
      manufacturingUsers,
      packingUser,
      qcUsers,
      quantity,
      selectedStaff,
      selectedStaffList,
      selectedWarehouseId,
      showQcUser,
      splitProductToggleContext,
      unitId,
    ],
  );

  const buildAssignPackToItemPayloadForQr = useCallback(
    (packCode: string, targetQrId: string): AssignPackingToItemRequest => ({
      qr_code: packCode,
      warehouse_id: selectedWarehouseId,
      target_qr_id: targetQrId,
      quantity,
      unit_id: unitId!,
      lot_number: (lotNumber ?? "").trim(),
      cavity_number: cavityNumber || undefined,
      manufacturing_user: selectedStaffList(manufacturingUsers),
      manufacturing_machine: manufacturingMachine || undefined,
      qc_user: showQcUser ? selectedStaffList(qcUsers) : undefined,
      packing_user: showPackingUser ? selectedStaff(packingUser) : undefined,
      is_split: splitProductSubmitFlag(
        splitProductToggleContext,
        isSplitProduct,
      ),
    }),
    [
      cavityNumber,
      isSplitProduct,
      lotNumber,
      manufacturingMachine,
      manufacturingUsers,
      packingUser,
      qcUsers,
      quantity,
      selectedStaff,
      selectedStaffList,
      selectedWarehouseId,
      showPackingUser,
      showQcUser,
      splitProductToggleContext,
      unitId,
    ],
  );

  const feBatchSubmitHint = useMemo(() => {
    if (!preview) {
      return null;
    }
    const kind = kindForPreview(preview);
    if (kind !== "product" && kind !== "pack") {
      return null;
    }
    const queue = feBatchQueues[kind];
    const total = countBatchSubmitTargets(queue, preview.code);
    if (total <= 1 && queue.length === 0) {
      return null;
    }
    return formatFeBatchSubmitHint(total, queue.length);
  }, [feBatchQueues, preview]);

  const manualCacheTargetCount = useMemo(
    () => countBatchSubmitTargets(feBatchQueues.product, preview?.code),
    [feBatchQueues.product, preview?.code],
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
      const targetQrId = String(itemPreview.qr_code_id);
      const targets = resolveBatchTargets(
        feBatchQueues.pack,
        pendingPackAssign.qr_code,
      );

      if (targets.length <= 1) {
        const result = await assignPackingToItemMutation.mutateAsync(
          buildAssignPackToItemPayloadForQr(pendingPackAssign.qr_code, targetQrId),
        );
        if (isAssignOrGetPendingCached(result)) {
          resetPreview();
          setPendingPackAssign(null);
          message.success(tQrTabletInbound("packingAssignSuccess"));
          return;
        }
        message.error(tQrTabletInbound("unhandledResponse"));
        return;
      }

      beginFeBatchSending(targets.length);
      try {
        const batchResult = await executeFeBatchSubmit({
          targets,
          buildPayload: (packCode) =>
            buildAssignPackToItemPayloadForQr(packCode, targetQrId),
          mutate: (payload) => assignPackingToItemMutation.mutateAsync(payload),
          onProgress: updateFeBatchSendProgress,
        });
        removeFeBatchSucceeded("pack", batchResult.succeeded);
        showFeBatchSubmitOutcome(batchResult, () => {
          resetPreview();
          setPendingPackAssign(null);
        });
        if (batchResult.failed.length === 0) {
          resetPreview();
          setPendingPackAssign(null);
        }
      } finally {
        finishFeBatchSending();
      }
    },
    [
      assignPackingToItemMutation,
      beginFeBatchSending,
      buildAssignPackToItemPayloadForQr,
      feBatchQueues.pack,
      finishFeBatchSending,
      isProductFormReady,
      pendingPackAssign,
      removeFeBatchSucceeded,
      resetPreview,
      showFeBatchSubmitOutcome,
      unitId,
      updateFeBatchSendProgress,
    ],
  );

  const handlePackingAssignScan = useCallback(
    async (scanned: string) => {
      const shouldResumeCollectScan = collectMode && !pendingPackAssign;
      setScanMode("idle");
      if (splitPreviewOpen || splitOutboundOpen) {
        message.warning(tQrTabletInbound("splitStockScanBlocked"));
        if (shouldResumeCollectScan) {
          setScanMode("packingAssign");
        }
        return;
      }
      if (!selectedWarehouseId) {
        message.warning(tQrTabletInbound("selectWarehouseFirst"));
        if (shouldResumeCollectScan) {
          setScanMode("packingAssign");
        }
        return;
      }
      try {
        if (shouldResumeCollectScan) {
          await handleFeBatchCollectScan(scanned, "packingAssign");
          return;
        }
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
        await handlePreviewWithSplitGate(packPreview.preview, async () => {
          await applyPreviewResult(packPreview.preview);
          setPendingPackAssign({
            qr_code: packPreview.preview.code,
            qr_code_id: packPreview.preview.qr_code_id,
          });
        });
      } catch (err) {
        message.error(getApiErrorMessage(err));
        if (shouldResumeCollectScan) {
          setScanMode("packingAssign");
        }
      }
    },
    [
      applyPreviewResult,
      assignPackingToItemMutation,
      collectMode,
      handleAssignPackToItem,
      handleFeBatchCollectScan,
      handlePreviewWithSplitGate,
      pendingPackAssign,
      previewMutation,
      selectedWarehouseId,
      splitOutboundOpen,
      splitPreviewOpen,
    ],
  );

  const handleAssignOrGetResponse = useCallback(
    async (result: AssignOrGetItemStockResponse) => {
      if (isAssignOrGetPreview(result)) {
        await handlePreviewWithSplitGate(result.preview, () =>
          applyPreviewResult(result.preview),
        );
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
    [applyPreviewResult, handlePreviewWithSplitGate, resetPreview],
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
        setPendingLocation(null);
        Modal.success({
          title: tQrTabletInbound("manualCreatedTitle"),
          content: result.message,
        });
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
    if (!isPackingFormReady || !preview) {
      return false;
    }
    const kind = kindForPreview(preview);
    if (kind !== "product" && kind !== "pack") {
      return false;
    }
    const queue = feBatchQueues[kind];
    const targets = resolveBatchTargets(queue, preview.code);

    if (targets.length <= 1) {
      const result = await packingMutation.mutateAsync(
        buildPackingCachePayloadForQr(preview.code),
      );
      await handleAssignOrGetResponse(result);
      return true;
    }

    beginFeBatchSending(targets.length);
    try {
      const batchResult = await executeFeBatchSubmit({
        targets,
        buildPayload: buildPackingCachePayloadForQr,
        mutate: (payload) => packingMutation.mutateAsync(payload),
        onProgress: updateFeBatchSendProgress,
      });
      removeFeBatchSucceeded(kind, batchResult.succeeded);
      showFeBatchSubmitOutcome(batchResult, () => resetPreview());
      if (batchResult.failed.length === 0) {
        resetPreview();
      } else if (batchResult.succeeded.length > 0) {
        message.success(
          formatFeBatchSendComplete(batchResult.succeeded.length),
        );
      }
      return batchResult.failed.length === 0;
    } finally {
      finishFeBatchSending();
    }
  }, [
    beginFeBatchSending,
    buildPackingCachePayloadForQr,
    feBatchQueues,
    finishFeBatchSending,
    handleAssignOrGetResponse,
    isPackingFormReady,
    packingMutation,
    preview,
    removeFeBatchSucceeded,
    resetPreview,
    showFeBatchSubmitOutcome,
    updateFeBatchSendProgress,
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
        manufacturing_machine: aggregated.manufacturing_machine,
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
          manufacturing_machine: pack.manufacturing_machine || undefined,
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
        return buildScanPayloadForQr(
          preview.code,
          locationCodeOverride ?? scanned,
        );
      }
      return {
        qr_code: scanned,
        warehouse_id: selectedWarehouseId,
      };
    },
    [buildScanPayloadForQr, preview, selectedWarehouseId],
  );

  const submitAutoAssignBatch = useCallback(
    async (locationRaw: string) => {
      if (!preview) {
        return;
      }
      const targets = resolveBatchTargets(
        feBatchQueues.product,
        preview.code,
      );
      beginFeBatchSending(targets.length);
      try {
        const batchResult = await executeFeBatchSubmit({
          targets,
          buildPayload: (qrCode) => buildScanPayloadForQr(qrCode, locationRaw),
          mutate: (payload) => assignMutation.mutateAsync(payload),
          onProgress: updateFeBatchSendProgress,
        });
        removeFeBatchSucceeded("product", batchResult.succeeded);
        showFeBatchSubmitOutcome(batchResult, () => resetPreview());
        if (batchResult.failed.length === 0) {
          resetPreview();
        }
      } finally {
        finishFeBatchSending();
      }
    },
    [
      assignMutation,
      beginFeBatchSending,
      buildScanPayloadForQr,
      feBatchQueues.product,
      finishFeBatchSending,
      preview,
      removeFeBatchSucceeded,
      resetPreview,
      showFeBatchSubmitOutcome,
      updateFeBatchSendProgress,
    ],
  );

  const submitManualInboundBatch = useCallback(
    async (locationCode: string) => {
      const targets = resolveBatchTargets(
        feBatchQueues.product,
        preview?.code,
      );
      if (targets.length === 0) {
        return;
      }
      beginFeBatchSending(targets.length);
      try {
        const batchResult = await executeFeBatchSubmit({
          targets,
          buildPayload: (qrCode) => buildScanPayloadForQr(qrCode, locationCode),
          mutate: (payload) => manualScanMutation.mutateAsync(payload),
          onProgress: updateFeBatchSendProgress,
        });
        removeFeBatchSucceeded("product", batchResult.succeeded);
        if (batchResult.failed.length === 0) {
          resetPreview();
          setPendingLocation(null);
          Modal.success({
            title: tQrTabletInbound("manualCreatedTitle"),
            content: formatFeBatchSendComplete(batchResult.succeeded.length),
          });
          return;
        }
        const details = batchResult.failed
          .map((item) => `${item.code}: ${item.error}`)
          .join("; ");
        Modal.warning({
          title: tQrTabletInbound("feBatchSendPartial"),
          content: formatFeBatchSendPartial(
            batchResult.succeeded.length,
            targets.length,
            batchResult.failed.length,
            details,
          ),
          centered: true,
        });
      } finally {
        finishFeBatchSending();
      }
    },
    [
      beginFeBatchSending,
      buildScanPayloadForQr,
      feBatchQueues.product,
      finishFeBatchSending,
      manualScanMutation,
      preview,
      removeFeBatchSucceeded,
      resetPreview,
      updateFeBatchSendProgress,
    ],
  );

  const handleManualClose = useCallback(async () => {
    if (!isProductFormReady || !selectedWarehouseId) {
      return;
    }
    const targets = resolveBatchTargets(
      feBatchQueues.product,
      preview?.code,
    );
    if (targets.length === 0) {
      return;
    }
    beginFeBatchSending(targets.length);
    try {
      const batchResult = await executeFeBatchSubmit({
        targets,
        buildPayload: buildManualCachePayload,
        mutate: (payload) => manualScanMutation.mutateAsync(payload),
        onProgress: updateFeBatchSendProgress,
      });
      removeFeBatchSucceeded("product", batchResult.succeeded);
      if (batchResult.failed.length === 0) {
        resetPreview();
        Modal.success({
          title: formatFeBatchSendComplete(batchResult.succeeded.length),
          centered: true,
        });
        return;
      }
      const details = batchResult.failed
        .map((item) => `${item.code}: ${item.error}`)
        .join("; ");
      Modal.warning({
        title: tQrTabletInbound("feBatchSendPartial"),
        content: formatFeBatchSendPartial(
          batchResult.succeeded.length,
          targets.length,
          batchResult.failed.length,
          details,
        ),
        centered: true,
      });
    } catch (err) {
      message.error(getApiErrorMessage(err));
    } finally {
      finishFeBatchSending();
    }
  }, [
    beginFeBatchSending,
    buildManualCachePayload,
    feBatchQueues.product,
    finishFeBatchSending,
    isProductFormReady,
    manualScanMutation,
    preview?.code,
    removeFeBatchSucceeded,
    resetPreview,
    selectedWarehouseId,
    updateFeBatchSendProgress,
  ]);

  const handleScan = useCallback(
    async (scanned: string) => {
      const currentScanMode = scanMode;
      const shouldResumeCollectScan =
        collectMode && currentScanMode !== "location";
      const collectResumeScanMode: ScanMode =
        currentScanMode === "packingAssign" ? "packingAssign" : "product";
      setScanMode("idle");
      if (splitPreviewOpen || splitOutboundOpen) {
        message.warning(tQrTabletInbound("splitStockScanBlocked"));
        if (shouldResumeCollectScan) {
          setScanMode(collectResumeScanMode);
        }
        return;
      }
      if (!selectedWarehouseId) {
        message.warning(tQrTabletInbound("selectWarehouseFirst"));
        return;
      }
      try {
        if (shouldResumeCollectScan) {
          await handleFeBatchCollectScan(scanned, collectResumeScanMode);
          return;
        }
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
            await handlePreviewWithSplitGate(result.preview, () =>
              applyPreviewResult(result.preview),
            );
            return;
          }
          message.error(tQrTabletInbound("unhandledResponse"));
          return;
        }
        if (!isAutoWarehouse) {
          if (currentScanMode === "location" && isProductFormReady) {
            const batchTargets = resolveBatchTargets(
              feBatchQueues.product,
              preview?.code,
            );
            if (batchTargets.length > 1) {
              await submitManualInboundBatch(scanned);
              return;
            }
            if (preview) {
              const result = await manualScanMutation.mutateAsync(
                buildScanPayloadForQr(preview.code, scanned),
              );
              await handleManualScanResponse(result);
              return;
            }
          }
          const result = await manualScanMutation.mutateAsync(
            buildScanPayload(scanned),
          );
          await handleManualScanResponse(result);
          return;
        }
        if (
          preview &&
          isItemQrType(preview.qr_type) &&
          resolveBatchTargets(feBatchQueues.product, preview.code).length > 1
        ) {
          await submitAutoAssignBatch(scanned);
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
        } else {
          message.error(errorMessage);
        }
        if (shouldResumeCollectScan) {
          setScanMode(collectResumeScanMode);
        }
      }
    },
    [
      applyPreviewResult,
      assignMutation,
      buildScanPayload,
      buildScanPayloadForQr,
      collectMode,
      feBatchQueues.product,
      handleAssignOrGetResponse,
      handleFeBatchCollectScan,
      handleManualScanResponse,
      handlePreviewWithSplitGate,
      isAutoWarehouse,
      isPackerMode,
      isProductFormReady,
      beginFromLocationScan,
      manualScanMutation,
      preview,
      previewMutation,
      resetPreview,
      selectedWarehouseId,
      splitOutboundOpen,
      scanMode,
      splitPreviewOpen,
      submitAutoAssignBatch,
      submitManualInboundBatch,
    ],
  );

  const handleImportDecoded = useCallback(
    async (text: string) => {
      if (!selectedWarehouseId) {
        message.warning(tQrTabletInbound("selectWarehouseFirst"));
        return;
      }
      try {
        if (collectMode && scanMode !== "location") {
          const resumeScanMode: ScanMode =
            scanMode === "packingAssign" ? "packingAssign" : "product";
          await handleFeBatchCollectScan(text, resumeScanMode);
          return;
        }
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
      collectMode,
      handleFeBatchCollectScan,
      handleScan,
      isPackerCacheForm,
      isPackingFormReady,
      preview,
      resetPreview,
      scanMode,
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
        if (collectMode && !pendingPackAssign) {
          await handleFeBatchCollectScan(text, "packingAssign");
          return;
        }
        await handlePackingAssignScan(text);
      } catch (err) {
        message.error(getApiErrorMessage(err));
      }
    },
    [
      collectMode,
      handleFeBatchCollectScan,
      handlePackingAssignScan,
      pendingPackAssign,
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
            label={tQrTabletInbound("labelConvertedQuantity")}
            value={convertedQuantityLabel}
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
          <PackerStockField
            label={tQrTabletInbound("labelManufacturingMachine")}
            value={manufacturingMachine}
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
                label={tQrTabletInbound("labelManufacturingMachine")}
                value={aggregatedBatchPreview.manufacturing_machine}
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
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-1 pb-8 pt-1 md:gap-5">
      <div className="sticky top-0 z-10 flex flex-row flex-wrap items-center justify-end gap-x-5 gap-y-2 rounded-xl border border-stripe-hairline bg-white px-4 py-3 shadow-sm">
        <FeBatchCollectToggle
          value={collectMode}
          queueCount={feBatchTotalCount}
          disabled={isFeBatchSending}
          onChange={setCollectMode}
        />
        {isAutoWarehouse ? (
          <InboundScanFlowToggle
            value={scanFlow}
            onChange={handleScanFlowChange}
          />
        ) : null}
      </div>
      {isFeBatchSending && feBatchSendProgress ? (
        <div className="rounded-xl border border-stripe-hairline bg-white px-4 py-3 shadow-sm">
          <p className="mb-2 text-sm text-stripe-ink-mute">
            {formatFeBatchSendProgress(
              feBatchSendProgress.current,
              feBatchSendProgress.total,
            )}
          </p>
          <Progress
            percent={Math.round(
              (feBatchSendProgress.current / feBatchSendProgress.total) * 100,
            )}
            showInfo={false}
          />
        </div>
      ) : null}

      <div className="w-full rounded-2xl border border-stripe-hairline bg-white p-6 shadow-sm md:p-8">
        <h1 className="mb-2 text-center text-2xl font-extrabold text-brand-dark md:text-3xl">
          {tQrTabletInbound("pageTitle")}
        </h1>
        <p className="mb-8 text-center text-base text-stripe-ink-mute">
          {tQrTabletInbound("pageSubtitle")}
        </p>
        {collectMode ? (
          <p className="mb-4 rounded-lg bg-brand-primary/10 px-3 py-2 text-center text-sm text-brand-dark">
            {isAutoWarehouse
              ? tQrTabletInbound("feBatchCollectHint")
              : tQrTabletInbound("manualFeBatchCollectHint")}
          </p>
        ) : null}
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
              {showPackingAssignScan
                ? tQrTabletInbound("assignFinishedProductScan")
                : tQrTabletInbound("startScan")}
            </Button>
            {showPackingAssignScan && (
              <Button
                variant="secondary"
                icon={<ScanOutlined />}
                className="!h-14 w-full !border-amber-400 !bg-amber-400 !text-lg !text-amber-950 hover:!border-amber-500 hover:!bg-amber-500 hover:!text-amber-950 md:!h-16 md:!text-xl"
                loading={scanPending}
                onClick={openPackingAssignScan}
              >
                {tQrTabletInbound("assignPackingSlipScan")}
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
            {feBatchSubmitHint ? (
              <p className="mb-4 rounded-lg bg-brand-primary/10 px-3 py-2 text-sm text-brand-dark">
                {feBatchSubmitHint}
              </p>
            ) : null}
            <Form.Item label={tQrTabletInbound("labelProduct")} required>
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
                        setIsSplitProduct(shouldEnableSplitProduct(val, unitOptions));
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
                  <Form.Item
                    label={tQrTabletInbound("labelConvertedQuantity")}
                    className="!mb-0 col-span-2"
                  >
                    <Input disabled value={convertedQuantityLabel} />
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
                <Form.Item
                  label={tQrTabletInbound("labelLot")}
                  required
                  validateStatus={
                    (lotNumber ?? "").trim() && !lotValidationResult.valid
                      ? "error"
                      : undefined
                  }
                  help={
                    (lotNumber ?? "").trim() && !lotValidationResult.valid
                      ? lotValidationResult.message
                      : isAutoWarehouse
                        ? LOT_NUMBER_LEGACY_HINT
                        : undefined
                  }
                >
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
                <Form.Item label={tQrTabletInbound("labelManufacturingMachine")}>
                  <Select
                    showSearch
                    allowClear
                    className="w-full"
                    loading={inboundBufferLoading}
                    options={manufacturingMachineOptions}
                    placeholder={tQrTabletInbound("placeholderManufacturingMachine")}
                    value={manufacturingMachine}
                    onChange={(val) =>
                      setManufacturingMachine(
                        typeof val === "string" ? val : undefined,
                      )
                    }
                  />
                </Form.Item>
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
                  ) : !isAutoWarehouse ? (
                    <>
                      <div className="flex gap-3">
                        <Button
                          variant="secondary"
                          className="!h-12 flex-1 !text-lg"
                          loading={isFeBatchSending}
                          disabled={
                            !isProductFormReady || manualCacheTargetCount === 0
                          }
                          onClick={() => void handleManualClose()}
                        >
                          {tQrTabletInbound("manualCloseButton")}
                        </Button>
                        <Button
                          variant="primary"
                          className="!h-12 flex-1 !text-lg"
                          loading={scanPending}
                          disabled={!isProductFormReady}
                          onClick={() => setScanMode("location")}
                        >
                          {tQrTabletInbound("scanLocationButton")}
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

      <SplitStockPreviewModal
        open={splitPreviewOpen}
        preview={splitGatePending?.preview ?? null}
        stocks={splitStocks}
        onClose={() => {
          void handleSplitStockClose().catch((err) =>
            message.error(getApiErrorMessage(err)),
          );
        }}
        onExportSplit={handleSplitStockExport}
      />

      {splitOutboundPrefill && (
        <CreateOutboundModal
          open={splitOutboundOpen}
          initialDetails={splitOutboundPrefill.initialDetails}
          initialItems={splitOutboundPrefill.initialItems}
          onCancel={handleSplitOutboundCancel}
          onSuccess={handleSplitOutboundSuccess}
        />
      )}
    </div>
  );
}
