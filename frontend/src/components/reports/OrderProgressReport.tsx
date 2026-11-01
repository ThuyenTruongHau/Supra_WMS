import InboundProgressCard from './InboundProgressCard'
import OutboundProgressCard from './OutboundProgressCard'

export default function OrderProgressReport({ warehouseId }: { warehouseId: number }) {
  return (
    <div className="grid items-stretch gap-6 lg:grid-cols-2">
      <InboundProgressCard key={`in-${warehouseId}`} warehouseId={warehouseId} />
      <OutboundProgressCard key={`out-${warehouseId}`} warehouseId={warehouseId} />
    </div>
  )
}
