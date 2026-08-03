import React, { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import { useAppStore } from '@/store/useAppStore';
import { useLogout } from '@/hooks/useAuth';
import { useReceiveInboundOrderDetail, useGetInboundOrders } from '@/hooks/useInboundOrder';
import { useFullLocations } from '@/hooks/useWarehouseMap';
import { InboundOrderItemDetail } from '@/types/inboundOrder';
import { ArrowLeftOutlined, UserOutlined, LogoutOutlined, CheckCircleFilled, StarFilled } from '@ant-design/icons';
import { Button, Select } from '@/components/ui';
import { message } from 'antd';

export default function WorkerInboundConfirmPage() {
  const { vehicleNumber, detailId } = useParams<{ vehicleNumber: string; detailId: string }>();
  const [searchParams] = useSearchParams();
  const entryPoint = searchParams.get('start-location') || '';
  const navigate = useNavigate();
  const locationState = useLocation().state as { detail?: InboundOrderItemDetail };
  const username = useAuthStore(state => state.username);
  const zoneId = useAppStore(state => state.selectedWarehouseId) || 49;
  const logout = useLogout();

  const decoded = vehicleNumber ? decodeURIComponent(vehicleNumber) : '';

  // Fallback: nếu location.state bị mất (ví dụ bấm Back), fetch lại từ API
  const { data: ordersData } = useGetInboundOrders({
    zone_id: zoneId,
    vehicle_number: decoded,
  });

  const detail = useMemo(() => {
    if (locationState?.detail) return locationState.detail;
    const allDetails = ordersData?.pages?.flatMap(p => p.orders).flatMap(o =>
      o.details.map(d => ({ ...d, order_code: o.order_code }))
    ) || [];
    return allDetails.find(d => String(d.id) === detailId);
  }, [locationState?.detail, ordersData, detailId]);

  const { data: fullLocationsData } = useFullLocations(zoneId);

  // Lấy các ô TRỐNG từ map data để làm danh sách dự phòng
  const emptyLocations = useMemo(() => {
    if (!fullLocationsData) return [];

    // Safety check: Backend might return an array directly, or an object with `locations` array
    const locationsArray = Array.isArray(fullLocationsData) ? fullLocationsData : fullLocationsData.locations;

    if (!Array.isArray(locationsArray)) return [];

    return locationsArray.filter(l => (l.item_stock?.length || 0) === 0 && l.location_type === 'STORAGE' && l.is_active);
  }, [fullLocationsData]);

  const suggestedLocation = detail?.location?.location_code || '';
  const fallbackLocation = emptyLocations[0]?.location_code || '';

  const [selectedLocation, setSelectedLocation] = useState<string>(suggestedLocation || fallbackLocation);

  const receiveMutation = useReceiveInboundOrderDetail();

  React.useEffect(() => {
    // Ưu tiên: vị trí đề xuất từ backend > ô trống đầu tiên trong bản đồ
    if (!selectedLocation) {
      if (suggestedLocation) setSelectedLocation(suggestedLocation);
      else if (fallbackLocation) setSelectedLocation(fallbackLocation);
    }
  }, [suggestedLocation, fallbackLocation]); // intentionally omit selectedLocation to avoid loop

  const locationOptions = useMemo(() => {
    const options = emptyLocations.map(l => ({
      value: l.location_code,
      label: `${l.location_code} (${l.zone_name})`,
    }));

    // Đảm bảo vị trí đề xuất (nếu có) luôn nằm trong danh sách chọn (phòng trường hợp nó không nằm trong emptyLocations)
    if (suggestedLocation && !options.find(o => o.value === suggestedLocation)) {
      options.unshift({ value: suggestedLocation, label: `${suggestedLocation} (Đề xuất)` });
    }
    return options;
  }, [emptyLocations, suggestedLocation]);

  const handleConfirm = async () => {
    if (!selectedLocation) {
      message.warning('Vui lòng chọn vị trí đặt hàng!');
      return;
    }

    try {
      await receiveMutation.mutateAsync({
        orderCode: detail?.order_code || '',
        detailId: Number(detailId),
        data: {
          received_quantity: Number(detail?.ordered_quantity) || 0,
          actual_location_code: selectedLocation,
          "start-location": entryPoint,
        }
      });
      message.success('Xác nhận cất hàng thành công!');
      navigate(`/worker/vehicles/${vehicleNumber}/skus`);
    } catch (err: any) {
      const data = err?.response?.data;
      const errorMsg = data?.detail?.detail || data?.detail || err?.message || 'Có lỗi xảy ra!';
      
      // Đảm bảo luôn gửi string lên UI
      message.error(typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg), 5);
    }
  };

  if (!detail) {
    return <div className="min-h-[100dvh] flex items-center justify-center text-stripe-ink-mute text-xl">Không tìm thấy lệnh SKU</div>;
  }



  return (
    <div className="min-h-[100dvh] bg-stripe-canvas-soft flex flex-col">
      {/* Header */}
      <header className="bg-brand-dark text-white p-4 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-lg shrink-0">
        <div className="flex items-center gap-3 sm:gap-4">
          <button
            onClick={() => navigate(`/worker/vehicles/${vehicleNumber}/skus/${detailId}/pickup`)}
            className="w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center rounded-2xl hover:bg-white/10 transition-colors text-slate-300 hover:text-white"
          >
            <ArrowLeftOutlined className="text-lg sm:text-xl" />
          </button>
          <div>
            <h1 className="text-lg sm:text-xl font-extrabold text-white leading-none">Xác nhận cất hàng</h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-0.5">Bước 2 / 2</p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 w-full md:w-auto justify-between md:justify-end">
          <div className="flex items-center gap-2 bg-white/10 px-3 py-2 sm:px-4 rounded-xl border border-white/10">
            <UserOutlined className="text-brand-primary" />
            <span className="text-base font-bold">{username || 'Công nhân'}</span>
          </div>
          <Button variant="ghost" onClick={logout}
            className="text-white hover:text-red-400 border border-white/20 hover:border-red-400 bg-transparent font-bold"
            icon={<LogoutOutlined />}
          >
            Ra
          </Button>
        </div>
      </header>

      <div className="flex-1 max-w-2xl w-full mx-auto p-4 sm:p-6 pb-36 space-y-4 sm:space-y-5">

        {/* Thông tin hàng */}
        <div className="bg-white rounded-3xl p-4 sm:p-6 shadow-stripe-1 border border-stripe-hairline">
          <p className="text-xs sm:text-sm font-semibold text-stripe-ink-mute mb-1">Hàng cần cất</p>
          <p className="text-base sm:text-xl font-extrabold text-stripe-ink leading-snug mb-3">{detail.item_name}</p>
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <div className="bg-stripe-canvas-soft rounded-2xl p-2 sm:p-3 text-center">
              <div className="text-xl sm:text-2xl font-extrabold text-stripe-ink">{parseFloat(String(detail.ordered_quantity))}</div>
              <div className="text-[10px] sm:text-xs text-stripe-ink-mute font-medium mt-0.5">{detail.item_unit} / 1 pallet</div>
            </div>
            <div className="bg-emerald-50 rounded-2xl p-2 sm:p-3 text-center">
              <div className="text-xs sm:text-sm font-extrabold text-emerald-700 font-mono">{entryPoint}</div>
              <div className="text-[10px] sm:text-xs text-stripe-ink-mute font-medium mt-0.5">Cổng lấy</div>
            </div>
          </div>
        </div>

        {/* Đề xuất vị trí tốt nhất */}
        {suggestedLocation ? (
          <div className="bg-brand-primary/5 border border-brand-primary rounded-3xl p-4 sm:p-6 shadow-stripe-1">
            <div className="flex items-center gap-2 mb-2 sm:mb-3">
              <StarFilled className="text-brand-primary text-base sm:text-lg" />
              <p className="text-sm sm:text-base font-extrabold text-brand-primary">Vị trí đề xuất tốt nhất</p>
            </div>
            <div className="font-mono font-extrabold text-3xl sm:text-4xl text-stripe-ink tracking-widest mb-2">
              {suggestedLocation}
            </div>
            <div className="flex flex-col sm:flex-row gap-1 sm:gap-4 text-xs sm:text-sm text-stripe-ink-mute">
              <span className="font-semibold text-emerald-600">✓ Đề xuất từ hệ thống</span>
              {detail?.location?.zone_name && <span>{detail.location.zone_name}</span>}
            </div>
          </div>
        ) : (
          <div className="bg-amber-50 border border-amber-200 rounded-3xl p-4 sm:p-6 text-amber-700 text-sm sm:text-base font-semibold">
            ⚠ Không có vị trí nào được gợi ý
          </div>
        )}

        {/* Chọn vị trí (chỉ ô trống) */}
        <div className="bg-white rounded-3xl p-4 sm:p-6 shadow-stripe-1 border border-stripe-hairline">
          <p className="text-sm sm:text-base font-extrabold text-stripe-ink mb-1">Chọn vị trí đặt hàng</p>
          <p className="text-xs sm:text-sm text-stripe-ink-mute mb-3 sm:mb-4">Chỉ hiện các ô <span className="font-bold text-emerald-600">TRỐNG</span></p>

          <Select
            value={selectedLocation || undefined}
            onChange={(val) => setSelectedLocation(val as string)}
            options={locationOptions}
            placeholder="Chọn vị trí trống..."
            className="w-full text-sm sm:text-base"
            size="large"
          />

          {selectedLocation && (
            <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-2 text-sm sm:text-base font-bold text-stripe-ink bg-stripe-canvas-soft rounded-2xl px-3 py-2 sm:px-4 sm:py-3">
              <div className="flex items-center gap-2"><CheckCircleFilled className="text-emerald-500" /> Đã chọn:</div>
              <span className="font-mono text-brand-primary">{selectedLocation}</span>
            </div>
          )}
        </div>


      </div>

      {/* Fixed CTA */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t border-stripe-hairline p-4 sm:p-5">
        <button
          onClick={handleConfirm}
          disabled={receiveMutation.isPending}
          className={`
            w-full max-w-2xl mx-auto flex items-center justify-center gap-2 sm:gap-3
            py-4 sm:py-5 min-h-[48px] rounded-xl font-extrabold text-base sm:text-xl transition-all duration-200
            ${receiveMutation.isPending
              ? 'bg-stripe-canvas-soft border border-stripe-hairline text-stripe-ink-mute cursor-not-allowed'
              : 'bg-brand-primary text-white hover:bg-stripe-primary-deep shadow-2xl shadow-brand-primary/30 active:scale-[0.98] active:translate-y-[1px]'
            }
          `}
        >
          {receiveMutation.isPending
            ? <><span className="animate-spin w-5 h-5 border-2 border-white/30 border-t-white rounded-full inline-block" /> Đang xử lý...</>
            : <><CheckCircleFilled /> Xác nhận cất hàng</>
          }
        </button>
      </div>
    </div>
  );
}
