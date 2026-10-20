import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { message } from "@/components/ui";
import { masanSortingOutboundDispatchApi } from "@/api/masan";
import {
  outboundCcBucketZoneCodeFor,
  outboundVtSortingZoneCodeFor,
} from "@/constants/outboundMapZones";
import { masanSortingZoneRobotTasksQueryKey } from "@/hooks/useMasanSortingZoneRobotTasks";
import { masanSortingItemsNeededQueryKey } from "@/hooks/useMasanSortingItemsNeeded";
import { masanSortingZoneCcLocationsQueryKey } from "@/hooks/useMasanSortingZoneCcLocations";
import {
  operatorRecentLackedQueryKey,
} from "@/hooks/useOutbound";
import { outboundTasksByWaveQueryKey } from "@/hooks/useOutboundTask";
import type { MasanSortingItemNeededRow } from "@/types/masan";
import { getApiErrorDetail } from "@/types/apiError";

export function useMasanVtSortingDispatch(
  displayZoneId: number,
  warehouseId: number,
) {
  const queryClient = useQueryClient();
  const ccBucketZoneCode =
    outboundCcBucketZoneCodeFor(displayZoneId)?.trim() ?? "";
  const sortingZoneCode =
    outboundVtSortingZoneCodeFor(displayZoneId)?.trim() ?? "";

  return useCallback(
    async (picked: MasanSortingItemNeededRow[], toLocationId: number) => {
      const row = picked[0];
      if (!row) return;
      if (warehouseId <= 0 || !ccBucketZoneCode) {
        message.error("Thiếu thông tin kho hoặc zone chia chọn");
        return;
      }
      if (toLocationId <= 0) {
        message.error("Không xác định được vị trí VT");
        return;
      }

      let result;
      try {
        result = await masanSortingOutboundDispatchApi({
          warehouse_id: warehouseId,
          zone: ccBucketZoneCode,
          item_id: row.item_id,
          to_location_id: toLocationId,
        });
      } catch (err: unknown) {
        message.error(getApiErrorDetail(err, "Không gửi được lệnh xuất"));
        throw err;
      }

      if (result.lacked.length > 0) {
        message.warning(
          `Đã gửi lệnh xuất ${row.sku}; còn thiếu ${result.lacked.length} dòng sau calculate`,
        );
      } else {
        message.success(`Đã gửi lệnh xuất mã ${row.sku}`);
      }

      void queryClient.invalidateQueries({
        queryKey: masanSortingItemsNeededQueryKey(
          warehouseId,
          ccBucketZoneCode,
        ),
      });
      void queryClient.invalidateQueries({
        queryKey: masanSortingZoneCcLocationsQueryKey(
          warehouseId,
          ccBucketZoneCode,
        ),
      });
      void queryClient.invalidateQueries({ queryKey: ["warehouseMap"] });
      void queryClient.invalidateQueries({
        queryKey: outboundTasksByWaveQueryKey(displayZoneId),
      });
      void queryClient.invalidateQueries({ queryKey: ["outboundOrders"] });
      void queryClient.invalidateQueries({
        queryKey: ["outbound_operator_board_orders"],
      });
      void queryClient.invalidateQueries({
        queryKey: operatorRecentLackedQueryKey(warehouseId),
      });
      if (sortingZoneCode) {
        void queryClient.invalidateQueries({
          queryKey: masanSortingZoneRobotTasksQueryKey(sortingZoneCode),
        });
      }
    },
    [
      ccBucketZoneCode,
      displayZoneId,
      queryClient,
      sortingZoneCode,
      warehouseId,
    ],
  );
}
