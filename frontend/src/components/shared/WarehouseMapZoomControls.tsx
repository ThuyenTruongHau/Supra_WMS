import React from 'react';

interface WarehouseMapZoomControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  disabled?: boolean;
}

const ZoomButton: React.FC<{
  label: string;
  onClick: () => void;
  disabled?: boolean;
}> = ({ label, onClick, disabled }) => (
  <button
    type="button"
    aria-label={label === '+' ? 'Zoom in' : 'Zoom out'}
    disabled={disabled}
    onClick={onClick}
    className="flex h-9 w-9 items-center justify-center border border-slate-200 bg-white/95 text-lg font-medium leading-none text-slate-700 shadow-sm transition hover:bg-slate-50 active:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
  >
    {label}
  </button>
);

const WarehouseMapZoomControls: React.FC<WarehouseMapZoomControlsProps> = ({
  onZoomIn,
  onZoomOut,
  disabled = false,
}) => {
  return (
    <div className="absolute bottom-3 left-3 z-20 flex flex-col overflow-hidden rounded-lg border border-slate-200 shadow-md backdrop-blur-sm">
      <ZoomButton label="+" onClick={onZoomIn} disabled={disabled} />
      <ZoomButton label="−" onClick={onZoomOut} disabled={disabled} />
    </div>
  );
};

export default WarehouseMapZoomControls;
