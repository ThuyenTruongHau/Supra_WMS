import React from 'react';
import { CompressOutlined } from '@ant-design/icons';

interface WarehouseMapZoomControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  /** Đưa map về khung nhìn vừa toàn bộ các ô. */
  onFit?: () => void;
  disabled?: boolean;
}

const ZoomButton: React.FC<{
  ariaLabel: string;
  title?: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}> = ({ ariaLabel, title, onClick, disabled, children }) => (
  <button
    type="button"
    aria-label={ariaLabel}
    title={title}
    disabled={disabled}
    onClick={onClick}
    className="flex h-9 w-9 items-center justify-center border border-slate-200 bg-white/95 text-lg font-medium leading-none text-slate-700 shadow-sm transition hover:bg-slate-50 active:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
  >
    {children}
  </button>
);

const WarehouseMapZoomControls: React.FC<WarehouseMapZoomControlsProps> = ({
  onZoomIn,
  onZoomOut,
  onFit,
  disabled = false,
}) => {
  return (
    <div className="absolute bottom-3 left-3 z-20 flex flex-col overflow-hidden rounded-lg border border-slate-200 shadow-md backdrop-blur-sm">
      <ZoomButton ariaLabel="Zoom in" onClick={onZoomIn} disabled={disabled}>
        +
      </ZoomButton>
      <ZoomButton ariaLabel="Zoom out" onClick={onZoomOut} disabled={disabled}>
        −
      </ZoomButton>
      {onFit && (
        <ZoomButton ariaLabel="Vừa khung" title="Vừa khung" onClick={onFit} disabled={disabled}>
          <CompressOutlined className="text-base" />
        </ZoomButton>
      )}
    </div>
  );
};

export default WarehouseMapZoomControls;
