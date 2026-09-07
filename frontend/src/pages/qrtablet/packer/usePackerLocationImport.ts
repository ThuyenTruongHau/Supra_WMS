import { useCallback, useState } from "react";
import { message } from "antd";

import type { ImportGroupDraft } from "@/pages/components/CreateImportModal";
import {
  locationContextFromScanResponse,
  mapPendingItemsToImportGroups,
  type LocationImportContext,
} from "@/pages/qrtablet/packer/importMappers";
import { tQrTabletInbound } from "@/i18n/qrTabletInbound.vi";
import type {
  AssignedItemStock,
  AssignOrGetItemStockResponse,
} from "@/types/inboundOrder";

export type OpenImportModalFn = (payload: {
  groups: ImportGroupDraft[];
  warehouseId: number | undefined;
}) => void;

type PackingStocksMutation = {
  mutateAsync: (args: {
    packingUser: string;
    linked?: boolean;
    pendingRole?: "item" | "pack";
  }) => Promise<{ items: AssignedItemStock[] }>;
  isPending: boolean;
};

export function usePackerLocationImport(
  packingStocksMutation: PackingStocksMutation,
  openImportModal: OpenImportModalFn,
  fallbackWarehouseId: number | undefined,
) {
  const [locationImportOpen, setLocationImportOpen] = useState(false);
  const [locationContext, setLocationContext] =
    useState<LocationImportContext | null>(null);
  const [locationPackingUser, setLocationPackingUser] = useState<
    string | undefined
  >();

  const cancel = useCallback(() => {
    setLocationImportOpen(false);
    setLocationContext(null);
    setLocationPackingUser(undefined);
  }, []);

  const beginFromLocationScan = useCallback(
    (scanResponse: AssignOrGetItemStockResponse) => {
      const context = locationContextFromScanResponse(scanResponse);
      if (!context) {
        message.warning(tQrTabletInbound("unhandledResponse"));
        return;
      }
      setLocationContext(context);
      setLocationPackingUser(undefined);
      setLocationImportOpen(true);
    },
    [],
  );

  const confirmPackingUser = useCallback(async () => {
    const user = locationPackingUser?.trim();
    if (!user || !locationContext) {
      return;
    }
    const result = await packingStocksMutation.mutateAsync({
      packingUser: user,
      pendingRole: "item",
    });
    if (result.items.length === 0) {
      message.warning(tQrTabletInbound("packerLocationNoPendingItems"));
      return;
    }
    openImportModal({
      groups: mapPendingItemsToImportGroups(result.items, locationContext),
      warehouseId: locationContext.warehouse_id ?? fallbackWarehouseId,
    });
    cancel();
  }, [
    cancel,
    fallbackWarehouseId,
    locationContext,
    locationPackingUser,
    openImportModal,
    packingStocksMutation,
  ]);

  return {
    locationImportOpen,
    locationContext,
    locationPackingUser,
    setLocationPackingUser,
    beginFromLocationScan,
    confirmPackingUser,
    cancel,
    isConfirming: packingStocksMutation.isPending,
  };
}
