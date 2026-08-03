import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import { useAppStore } from '@/store/useAppStore';
import { useLogout } from '@/hooks/useAuth';
import { useGetInboundVehicles } from '@/hooks/useInboundOrder';
import { useZone } from '@/hooks/useZone';
import { InboundVehicle } from '@/types/inboundOrder';
import { TruckOutlined, UserOutlined, LogoutOutlined, WarningOutlined } from '@ant-design/icons';
import { Button, Select } from '@/components/ui';

function VehicleCard({ vehicle, onClick }: { vehicle: InboundVehicle; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group relative w-full h-full min-h-[180px] sm:min-h-[220px] flex flex-col rounded-3xl border p-4 sm:p-6 md:p-8 text-left transition-all duration-200 active:scale-[0.97] border-stripe-hairline bg-white hover:shadow-stripe-2 shadow-stripe-1"
    >
      {/* Icon */}
      <div className="mb-4 sm:mb-5 w-12 h-12 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center bg-brand-primary/10 group-hover:bg-brand-primary/20 transition-colors">
        <TruckOutlined className="text-3xl sm:text-4xl text-brand-primary" />
      </div>

      {/* Biển số xe – RẤT LỚN */}
      <div className="font-mono font-extrabold text-3xl sm:text-4xl md:text-5xl text-stripe-ink tracking-widest mb-2 leading-none">
        {vehicle.vehicle_number}
      </div>

      {/* Còn lại */}
      <div className="mt-auto pt-4 text-lg sm:text-xl font-bold text-stripe-ink-mute">
        Đang chờ xử lý
      </div>
    </button>
  );
}

export default function WorkerInboundVehicleListPage() {
  const navigate = useNavigate();
  const username = useAuthStore(state => state.username);
  const zoneId = useAppStore(state => state.selectedWarehouseId);
  const setSelectedWarehouseId = useAppStore(state => state.setSelectedWarehouseId);
  const logout = useLogout();

  const { data: zones = [] } = useZone();
  const { data: vehicles = [], isLoading, error } = useGetInboundVehicles(zoneId);

  return (
    <div className="min-h-[100dvh] bg-stripe-canvas-soft flex flex-col">
      {/* Header */}
      <header className="bg-brand-dark text-white p-4 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-lg shrink-0">
        <div>
          <h1 className="text-lg sm:text-xl font-extrabold text-white tracking-wide">NHẬP KHO</h1>
          <p className="text-sm text-slate-400 mt-0.5">Chọn xe để bắt đầu</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full md:w-auto justify-between md:justify-end">

          <div className="bg-white rounded-xl">
            <Select
              value={zoneId || undefined}
              onChange={(val) => setSelectedWarehouseId(val as number)}
              options={zones.map(z => ({ value: z.id, label: z.name }))}
              placeholder="Chọn Kho làm việc..."
              className="w-48 sm:w-56"
            />
          </div>

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

      {/* Grid xe */}
      <div className="flex-1 p-4 sm:p-6 max-w-[1920px] w-full mx-auto flex flex-col">
        {!zoneId ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
            <WarningOutlined className="text-6xl text-amber-500 mb-4" />
            <h2 className="text-2xl font-bold text-stripe-ink mb-2">Chưa chọn Kho làm việc</h2>
            <p className="text-stripe-ink-mute text-lg">Vui lòng chọn Kho ở góc trên bên phải để tải danh sách xe.</p>
          </div>
        ) : (
          <>
            <h2 className="text-xl sm:text-2xl font-bold text-stripe-ink mb-4 sm:mb-6">Chọn biển số xe</h2>

            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-32 text-brand-primary">
                <div className="w-12 h-12 border-4 border-brand-primary border-t-transparent rounded-full animate-spin mb-4"></div>
                <p className="text-xl font-medium">Đang tải danh sách xe...</p>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-32 text-red-500">
                <p className="text-xl font-medium">Lỗi tải dữ liệu. Vui lòng thử lại.</p>
              </div>
            ) : vehicles.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-32 text-stripe-ink-mute">
                <TruckOutlined className="text-7xl mb-4 opacity-30" />
                <p className="text-xl font-medium">Không có xe nào đang chờ cất hàng</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-7 gap-4 sm:gap-5">
                {vehicles.map(v => (
                  <VehicleCard
                    key={v.vehicle_number}
                    vehicle={v}
                    onClick={() => navigate(`/worker/vehicles/${encodeURIComponent(v.vehicle_number)}/skus`)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
