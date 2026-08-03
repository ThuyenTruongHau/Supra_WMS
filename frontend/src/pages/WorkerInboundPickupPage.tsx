import { useMemo } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import { useAppStore } from '@/store/useAppStore';
import { useLogout } from '@/hooks/useAuth';
import { useGetEntryPoints } from '@/hooks/useEntryPoint';
import { useGetInboundOrders } from '@/hooks/useInboundOrder';
import { EntryPoint } from '@/types/entryPoint';
import { InboundOrderItemDetail } from '@/types/inboundOrder';
import { ArrowLeftOutlined, UserOutlined, LogoutOutlined, EnvironmentOutlined } from '@ant-design/icons';
import { Button } from '@/components/ui';

function EntryPointCard({ ep, onClick }: { ep: EntryPoint; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="relative w-full h-full min-h-[110px] sm:min-h-[130px] flex flex-col justify-center rounded-3xl border border-stripe-hairline bg-white hover:border-brand-primary hover:shadow-stripe-2 shadow-stripe-1 p-4 sm:p-6 text-left transition-all duration-200 active:scale-[0.97]"
    >
      <div className="flex items-center gap-3 sm:gap-4 mb-2 sm:mb-3">
        <span className="font-mono font-extrabold text-2xl sm:text-3xl text-stripe-ink tracking-widest">{ep.code}</span>
      </div>
      <div className="flex items-start gap-2 text-sm sm:text-base text-stripe-ink-mute">
        <EnvironmentOutlined className="text-brand-primary mt-0.5 flex-shrink-0" />
        <span className="font-medium">{ep.description}</span>
      </div>
    </button>
  );
}

export default function WorkerInboundPickupPage() {
  const { vehicleNumber, detailId } = useParams<{ vehicleNumber: string; detailId: string }>();
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
    // Tìm detail theo detailId từ dữ liệu API
    const allDetails = ordersData?.pages?.flatMap(p => p.orders).flatMap(o =>
      o.details.map(d => ({ ...d, order_code: o.order_code }))
    ) || [];
    return allDetails.find(d => String(d.id) === detailId);
  }, [locationState?.detail, ordersData, detailId]);

  const { data: entryPoints = [], isLoading, error } = useGetEntryPoints(zoneId);
  const activeEntryPoints = entryPoints.filter(ep => ep.is_active !== false);

  const handleSelect = (code: string) => {
    navigate(`/worker/vehicles/${vehicleNumber}/skus/${detailId}/confirm?start-location=${encodeURIComponent(code)}`, { state: { detail } });
  };

  if (!detail) return <div className="min-h-[100dvh] flex items-center justify-center text-xl text-stripe-ink-mute">Đang tải dữ liệu...</div>;

  return (
    <div className="min-h-[100dvh] bg-stripe-canvas-soft flex flex-col">
      <header className="bg-brand-dark text-white p-4 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-lg shrink-0">
        <div className="flex items-center gap-3 sm:gap-4">
          <button onClick={() => navigate(`/worker/vehicles/${vehicleNumber}/skus`)}
            className="w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center rounded-2xl hover:bg-white/10 transition-colors text-slate-300 hover:text-white"
          >
            <ArrowLeftOutlined className="text-lg sm:text-xl" />
          </button>
          <div>
            <h1 className="text-lg sm:text-xl font-extrabold text-white leading-none">Chọn điểm Start-point</h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-0.5">Bước 1 / 2</p>
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

      <div className="flex-1 flex flex-col max-w-[1920px] w-full mx-auto p-4 sm:p-6 pb-8">
        {/* SKU info */}
        <div className="bg-white rounded-3xl p-4 sm:p-6 shadow-stripe-1 border border-stripe-hairline mb-4 sm:mb-6">
          <p className="text-xs sm:text-sm text-stripe-ink-mute font-semibold mb-1">{detail.item_sku}</p>
          <p className="text-base sm:text-xl font-extrabold text-stripe-ink leading-snug">{detail.item_name}</p>
          <p className="text-sm sm:text-base text-stripe-ink-mute mt-2">{parseFloat(String(detail.ordered_quantity))} {detail.item_unit} / 1 pallet</p>
        </div>

        <h2 className="text-lg sm:text-xl font-bold text-stripe-ink mb-3 sm:mb-4">
          Xe <span className="font-mono">{detail?.vehicle_number}</span> hạ hàng ở đâu?
        </h2>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-brand-primary">
            <div className="w-10 h-10 border-4 border-brand-primary border-t-transparent rounded-full animate-spin mb-4"></div>
            <p className="text-lg font-medium">Đang tải danh sách điểm xuất phát...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 text-red-500">
            <p className="text-lg font-medium">Lỗi tải dữ liệu.</p>
          </div>
        ) : activeEntryPoints.length === 0 ? (
          <div className="flex items-center justify-center py-20 text-stripe-ink-mute text-lg">Chưa có điểm xuất phát nào được cấu hình</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-7 grid-rows-2 gap-4 flex-1">
            {activeEntryPoints.map(ep => (
              <EntryPointCard key={ep.code} ep={ep} onClick={() => handleSelect(ep.code)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
