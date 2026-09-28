import { useEffect, useState } from 'react'
import { LeftOutlined } from '@ant-design/icons'
import { Button, Modal, cn, message } from '@/components/ui'
import {
  OPERATOR_DESKTOP,
  operatorDesktopClass,
} from '@/constants/operatorDesktopSizes'
import {
  useAssignInboundToBuffer,
  useInboundOrderVehicles,
  useInboundVehicleProductDetails,
  useInboundVehicleProducts,
} from '@/hooks/useInbound'
import type {
  InboundVehicleDetailLine,
  InboundVehicleItem,
  InboundVehicleProductItem,
} from '@/types/inbound'
import { toDisplayInteger } from '@/utils/number'

type Step = 'vehicle' | 'product' | 'detail'

type Props = {
  open: boolean
  orderId: number
  locationId: number
  locationCode: string
  onClose: () => void
  onAssigned?: () => void
}

function LocationBanner({ locationCode }: { locationCode: string }) {
  return (
    <div className="rounded-xl border border-brand-primary/20 bg-brand-primary/5 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
        Ô inbound buffer
      </p>
      <p className="mt-1 font-mono text-lg font-bold text-brand-dark">
        {locationCode}
      </p>
    </div>
  )
}

function StepBreadcrumb({
  step,
  vehicleNumber,
  productLabel,
}: {
  step: Step
  vehicleNumber: string | null
  productLabel: string | null
}) {
  const items = [
    { key: 'vehicle', label: 'Xe' },
    { key: 'product', label: 'Loại hàng' },
    { key: 'detail', label: 'Lệnh' },
  ] as const

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-sm">
      {items.map((item, index) => {
        const active =
          (item.key === 'vehicle' && step === 'vehicle') ||
          (item.key === 'product' && step === 'product') ||
          (item.key === 'detail' && step === 'detail')
        const done =
          (item.key === 'vehicle' && vehicleNumber) ||
          (item.key === 'product' && productLabel && step === 'detail')
        return (
          <div key={item.key} className="flex items-center gap-1.5">
            {index > 0 && <span className="text-slate-300">›</span>}
            <span
              className={cn(
                'rounded-md px-2 py-0.5 font-medium',
                active && 'bg-brand-primary/15 text-brand-dark',
                done && !active && 'text-brand-primary',
                !active && !done && 'text-slate-400',
              )}
            >
              {item.label}
              {item.key === 'vehicle' && vehicleNumber ? `: ${vehicleNumber}` : ''}
              {item.key === 'product' && productLabel && step === 'detail'
                ? `: ${productLabel}`
                : ''}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function ChoiceButton({
  active,
  onClick,
  title,
  subtitle,
  meta,
}: {
  active?: boolean
  onClick: () => void
  title: string
  subtitle?: string
  meta?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group w-full rounded-xl border px-4 py-3.5 text-left transition-all duration-150',
        'shadow-sm hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40',
        active
          ? 'border-brand-primary bg-brand-primary/10 ring-1 ring-brand-primary/30'
          : 'border-slate-200 bg-white hover:border-brand-primary/50 hover:bg-slate-50/80',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              'truncate font-mono text-base font-bold',
              active ? 'text-brand-dark' : 'text-slate-800',
            )}
          >
            {title}
          </p>
          {subtitle ? (
            <p className="mt-1 line-clamp-2 text-sm text-slate-600">{subtitle}</p>
          ) : null}
          {meta ? (
            <p className="mt-2 text-xs font-medium text-slate-400">{meta}</p>
          ) : null}
        </div>
        <span
          className={cn(
            'mt-1 h-4 w-4 shrink-0 rounded-full border-2 transition',
            active
              ? 'border-brand-primary bg-brand-primary'
              : 'border-slate-300 bg-white group-hover:border-brand-primary/60',
          )}
        />
      </div>
    </button>
  )
}

export default function AssignInboundBufferModal({
  open,
  orderId,
  locationId,
  locationCode,
  onClose,
  onAssigned,
}: Props) {
  const [step, setStep] = useState<Step>('vehicle')
  const [vehicleNumber, setVehicleNumber] = useState<string | null>(null)
  const [product, setProduct] = useState<InboundVehicleProductItem | null>(null)
  const [selectedDetailId, setSelectedDetailId] = useState<number | null>(null)

  const vehiclesQuery = useInboundOrderVehicles(orderId, open && orderId > 0)
  const productsQuery = useInboundVehicleProducts(
    orderId,
    vehicleNumber,
    open && step !== 'vehicle' && Boolean(vehicleNumber),
  )
  const detailsQuery = useInboundVehicleProductDetails(
    orderId,
    vehicleNumber,
    product?.product_id ?? null,
    open && step === 'detail' && Boolean(vehicleNumber) && Boolean(product),
  )
  const assignMutation = useAssignInboundToBuffer()

  useEffect(() => {
    if (!open) {
      setStep('vehicle')
      setVehicleNumber(null)
      setProduct(null)
      setSelectedDetailId(null)
    }
  }, [open])

  const vehicles = vehiclesQuery.data?.vehicles ?? []
  const products = productsQuery.data?.products ?? []
  const details = detailsQuery.data?.details ?? []

  const productLabel = product
    ? product.product_sku || `SP#${product.product_id}`
    : null

  const handlePickVehicle = (vehicle: InboundVehicleItem) => {
    setVehicleNumber(vehicle.vehicle_number)
    setProduct(null)
    setSelectedDetailId(null)
    setStep('product')
  }

  const handlePickProduct = (item: InboundVehicleProductItem) => {
    setProduct(item)
    setSelectedDetailId(null)
    setStep('detail')
  }

  const handlePickDetail = (line: InboundVehicleDetailLine) => {
    setSelectedDetailId(line.detail_id)
  }

  const handleBack = () => {
    if (step === 'detail') {
      setSelectedDetailId(null)
      setProduct(null)
      setStep('product')
      return
    }
    if (step === 'product') {
      setProduct(null)
      setVehicleNumber(null)
      setStep('vehicle')
    }
  }

  const handleAssign = () => {
    if (!selectedDetailId) {
      message.error('Vui lòng chọn đúng 1 lệnh để gán')
      return
    }
    assignMutation.mutate(
      {
        orderId,
        data: {
          location_id: locationId,
          detail_id: selectedDetailId,
        },
      },
      {
        onSuccess: () => {
          message.success(
            `Đã gán tạm lệnh #${selectedDetailId} vào ô ${locationCode}`,
          )
          onAssigned?.()
          onClose()
        },
        onError: (err) => {
          message.error(
            err.response?.data?.detail ?? 'Không thể gán hàng vào ô buffer',
          )
        },
      },
    )
  }

  const titleByStep =
    step === 'vehicle'
      ? 'Chọn số xe'
      : step === 'product'
        ? 'Chọn loại hàng'
        : 'Chọn lệnh gán'

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={titleByStep}
      width={OPERATOR_DESKTOP.modal.md}
      destroyOnHidden
      footer={
        <div className="flex items-center justify-between gap-3">
          <div>
            {step !== 'vehicle' ? (
              <Button
                variant="secondary"
                icon={<LeftOutlined />}
                onClick={handleBack}
                disabled={assignMutation.isPending}
              >
                Quay lại
              </Button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={onClose}
              disabled={assignMutation.isPending}
            >
              Hủy
            </Button>
            {step === 'detail' ? (
              <Button
                variant="primary"
                onClick={handleAssign}
                loading={assignMutation.isPending}
                disabled={!selectedDetailId}
              >
                Xác nhận gán
              </Button>
            ) : null}
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        <LocationBanner locationCode={locationCode} />
        <StepBreadcrumb
          step={step}
          vehicleNumber={vehicleNumber}
          productLabel={productLabel}
        />

        {step === 'vehicle' && (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">
              Chọn xe còn lệnh chưa gán để đưa vào ô buffer.
            </p>
            {vehiclesQuery.isLoading && (
              <p className="text-sm text-slate-400">Đang tải danh sách xe...</p>
            )}
            {vehiclesQuery.isError && (
              <p className="text-sm text-red-500">
                {vehiclesQuery.error.response?.data?.detail ??
                  'Không tải được danh sách xe'}
              </p>
            )}
            {!vehiclesQuery.isLoading &&
              !vehiclesQuery.isError &&
              vehicles.length === 0 && (
                <p className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">
                  Không còn xe nào có lệnh chưa gán.
                </p>
              )}
            <div
              className={`grid ${operatorDesktopClass.listMax420} gap-3 overflow-y-auto sm:grid-cols-2`}
            >
              {vehicles.map((vehicle) => (
                <ChoiceButton
                  key={vehicle.vehicle_number}
                  title={vehicle.vehicle_number}
                  meta={`${vehicle.pending_line_count} lệnh · ${toDisplayInteger(vehicle.pending_quantity)} SL`}
                  onClick={() => handlePickVehicle(vehicle)}
                />
              ))}
            </div>
          </div>
        )}

        {step === 'product' && (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">
              Chọn loại hàng (SKU) trên xe{' '}
              <span className="font-semibold text-brand-dark">{vehicleNumber}</span>.
            </p>
            {productsQuery.isLoading && (
              <p className="text-sm text-slate-400">Đang tải loại hàng...</p>
            )}
            {productsQuery.isError && (
              <p className="text-sm text-red-500">
                {productsQuery.error.response?.data?.detail ??
                  'Không tải được loại hàng'}
              </p>
            )}
            {!productsQuery.isLoading &&
              !productsQuery.isError &&
              products.length === 0 && (
                <p className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">
                  Xe này không còn loại hàng chưa gán.
                </p>
              )}
            <div className={`grid ${operatorDesktopClass.listMax420} gap-3 overflow-y-auto`}>
              {products.map((item) => (
                <ChoiceButton
                  key={item.product_id}
                  title={item.product_sku || `SP#${item.product_id}`}
                  subtitle={item.product_name || undefined}
                  meta={`SL: ${toDisplayInteger(item.total_quantity)}${
                    Number(item.total_pallet_quantity) > 0
                      ? ` · Pallet: ${toDisplayInteger(item.total_pallet_quantity)}`
                      : ''
                  } · ${item.line_count} lệnh`}
                  onClick={() => handlePickProduct(item)}
                />
              ))}
            </div>
          </div>
        )}

        {step === 'detail' && (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">
              Chọn <span className="font-semibold text-brand-dark">đúng 1 lệnh chưa gán</span>{' '}
              thuộc loại hàng để gán vào ô buffer.
            </p>
            {detailsQuery.isLoading && (
              <p className="text-sm text-slate-400">Đang tải danh sách lệnh...</p>
            )}
            {detailsQuery.isError && (
              <p className="text-sm text-red-500">
                {detailsQuery.error.response?.data?.detail ??
                  'Không tải được danh sách lệnh'}
              </p>
            )}
            {!detailsQuery.isLoading &&
              !detailsQuery.isError &&
              details.length === 0 && (
                <p className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">
                  Không còn lệnh chưa gán cho loại hàng này.
                </p>
              )}
            <div className={`grid ${operatorDesktopClass.listMax420} gap-3 overflow-y-auto`}>
              {details.map((line) => {
                const active = selectedDetailId === line.detail_id
                const lotPart = line.lot_number ? ` · LOT ${line.lot_number}` : ''
                const palletPart =
                  line.pallet_quantity != null && Number(line.pallet_quantity) > 0
                    ? ` · Pallet ${toDisplayInteger(line.pallet_quantity)}`
                    : ''
                const deliveryPart = line.delivery_code
                  ? ` · ${line.delivery_code}`
                  : ''
                return (
                  <ChoiceButton
                    key={line.detail_id}
                    active={active}
                    title={`Lệnh #${line.detail_id}`}
                    subtitle={
                      line.product_name ||
                      line.product_sku ||
                      `SP#${line.product_id}`
                    }
                    meta={`Status: ${line.status} · SL ${toDisplayInteger(line.expected_quantity)}${palletPart}${lotPart}${deliveryPart}`}
                    onClick={() => handlePickDetail(line)}
                  />
                )
              })}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
