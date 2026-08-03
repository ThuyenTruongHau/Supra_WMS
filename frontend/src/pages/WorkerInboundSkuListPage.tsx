import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import { useAppStore } from '@/store/useAppStore';
import { useLogout } from '@/hooks/useAuth';
import { useGetInboundOrders } from '@/hooks/useInboundOrder';
import { InboundOrderItemDetail } from '@/types/inboundOrder';
import { ArrowLeftOutlined, UserOutlined, LogoutOutlined, CheckCircleFilled } from '@ant-design/icons';
import { Button } from '@/components/ui';
import dayjs from 'dayjs';

function SkuCard({ detail, onClick }: { detail: InboundOrderItemDetail; onClick: () => void }) {
  const isDone = detail.status === 'completed';

  return (
    <button
      onClick={isDone ? undefined : onClick}
      disabled={isDone}
      className={`
        group relative w-full h-full min-h-[250px] sm:min-h-[280px] flex flex-col rounded-3xl border p-4 sm:p-6 text-left
        transition-all duration-200 active:scale-[0.97]
        ${isDone
          ? 'border-emerald-100 bg-emerald-50 opacity-60 cursor-not-allowed'
          : 'border-stripe-hairline bg-white hover:shadow-stripe-2 shadow-stripe-1 cursor-pointer'
        }
      `}
    >
      {/* Status badge */}
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono font-extrabold text-2xl sm:text-3xl text-stripe-ink tracking-widest">
          {detail.item_sku}
        </span>
        {isDone && (
          <span className="flex items-center gap-1 sm:gap-1.5 text-sm sm:text-base font-bold text-emerald-600">
            <CheckCircleFilled /> Đã cất
          </span>
        )}
      </div>

      {/* Tên sản phẩm */}
      <p className="text-base font-medium text-stripe-ink-mute leading-snug mb-5 line-clamp-2">
        {detail.item_name}
      </p>

      {/* Thông số */}
      <div className="mt-auto bg-stripe-canvas-soft rounded-2xl p-2 sm:p-3 flex flex-col items-center justify-center">
        <div className="text-2xl sm:text-3xl font-extrabold text-stripe-ink">{parseFloat(String(detail.ordered_quantity))}</div>
        <div className="text-xs sm:text-sm text-stripe-ink-mute font-medium mt-0.5">{detail.item_unit} </div>
      </div>

      {/* LOT + HSD */}
      <div className="flex flex-col sm:flex-row gap-1 sm:gap-4 mt-4 text-xs sm:text-sm text-stripe-ink-mute">
        <span>LOT: <strong className="text-stripe-ink">{detail.item_lot_code}</strong></span>
        <span>HSD: <strong className="text-stripe-ink">{dayjs(detail.item_expire_at).format('DD/MM/YY')}</strong></span>
      </div>
    </button>
  );
}

export default function WorkerInboundSkuListPage() {
  const { vehicleNumber } = useParams<{ vehicleNumber: string }>();
  const navigate = useNavigate();
  const username = useAuthStore(state => state.username);
  const zoneId = useAppStore(state => state.selectedWarehouseId) || 49;
  const logout = useLogout();

  const decoded = vehicleNumber ? decodeURIComponent(vehicleNumber) : '';

  const { data, isLoading, error } = useGetInboundOrders({
    zone_id: zoneId,
    vehicle_number: decoded,
  });

  const allPallets = useMemo(() => {
    return data?.pages.flatMap(page => page.orders).flatMap(order =>
      order.details.map(detail => ({
        ...detail,
        order_code: order.order_code,
      }))
    ) || [];
  }, [data]);

  const pendingPallets = useMemo(() => allPallets.filter(d => d.status !== 'completed'), [allPallets]);
  const completedPallets = useMemo(() => allPallets.filter(d => d.status === 'completed'), [allPallets]);

  return (
    <div className="min-h-[100dvh] bg-stripe-canvas-soft flex flex-col">
      <header className="bg-brand-dark text-white p-4 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-lg shrink-0">
        <div className="flex items-center gap-3 sm:gap-4">
          <button onClick={() => navigate('/worker/vehicles')}
            className="w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center rounded-2xl hover:bg-white/10 transition-colors text-slate-300 hover:text-white"
          >
            <ArrowLeftOutlined className="text-lg sm:text-xl" />
          </button>
          <div>
            <h1 className="text-lg sm:text-xl font-extrabold text-white font-mono tracking-widest leading-none">{decoded}</h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-0.5">{pendingPallets.length} lệnh chờ xử lý</p>
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

      <div className="flex-1 p-4 sm:p-6 max-w-[1920px] w-full mx-auto">
        <h2 className="text-xl sm:text-2xl font-bold text-stripe-ink mb-4 sm:mb-6">Chọn lệnh SKU</h2>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-32 text-brand-primary">
            <div className="w-12 h-12 border-4 border-brand-primary border-t-transparent rounded-full animate-spin mb-4"></div>
            <p className="text-xl font-medium">Đang tải danh sách lệnh...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-32 text-red-500">
            <p className="text-xl font-medium">Lỗi tải dữ liệu. Vui lòng thử lại.</p>
          </div>
        ) : allPallets.length === 0 ? (
          <div className="flex items-center justify-center py-32 text-stripe-ink-mute text-lg sm:text-xl">Không có lệnh nào</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-7 gap-4 sm:gap-5">
            {pendingPallets.map(d => (
              <SkuCard
                key={d.id}
                detail={d}
                onClick={() => navigate(`/worker/vehicles/${vehicleNumber}/skus/${d.id}/pickup`, { state: { detail: d } })}
              />
            ))}
            {completedPallets.map(d => (
              <SkuCard
                key={d.id}
                detail={d}
                onClick={() => { }} // Disabled button, doesn't matter
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
