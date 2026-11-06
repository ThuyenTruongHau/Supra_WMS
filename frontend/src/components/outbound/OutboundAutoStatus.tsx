import type { ReactNode } from 'react';

type OutboundAutoStatusProps = {
  warehouseId: number;
  displayZoneId: number;
  renderToolbar?: () => ReactNode;
};

export default function OutboundAutoStatus({
  warehouseId,
  displayZoneId,
  renderToolbar,
}: OutboundAutoStatusProps) {
  if (!renderToolbar) return null;
  return (
    <div
      key={`${warehouseId}-${displayZoneId}`}
      className="w-full min-w-0 max-w-full"
      data-testid={`outbound-auto-status-${displayZoneId}`}
    >
      {renderToolbar()}
    </div>
  );
}
