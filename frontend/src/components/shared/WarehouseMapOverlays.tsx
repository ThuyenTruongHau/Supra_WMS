import React from 'react';
import { Loading, Alert } from '@/components/ui';

interface WarehouseMapOverlaysProps {
  isLoading: boolean;
  isError: boolean;
  hasData: boolean;
  errorMessage: string | null;
  isAdmin: boolean;
}

const WarehouseMapOverlays: React.FC<WarehouseMapOverlaysProps> = ({
  isLoading,
  isError,
  hasData,
  errorMessage,
  isAdmin,
}) => {
  return (
    <>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/60 backdrop-blur-[2px] z-10">
          <Loading text="Đang tải bản đồ..." className="h-auto!" />
        </div>
      )}
      {isError && !isLoading && (
        <div className="absolute inset-0 flex items-center justify-center p-8 z-10">
          <Alert variant="error" className="max-w-md text-center">
            <p className="font-semibold mb-1">Không thể tải bản đồ</p>
            <p className="text-xs opacity-80">{errorMessage}</p>
          </Alert>
        </div>
      )}
      {!hasData && !isLoading && !isError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 pointer-events-none select-none">
          <div className="w-20 h-20 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#4a6fa5" strokeWidth="1.5">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
            </svg>
          </div>
          <div className="text-center">
            <p className="text-slate-500 font-medium text-sm">Chưa có dữ liệu bản đồ</p>
            <p className="text-slate-400 text-xs mt-1">
              {isAdmin
                ? 'Nhấn "Import Map" để tải file bản đồ cho zone này'
                : 'Zone này chưa có bản đồ. Liên hệ admin để import.'}
            </p>
          </div>
        </div>
      )}
    </>
  );
};

export default WarehouseMapOverlays;