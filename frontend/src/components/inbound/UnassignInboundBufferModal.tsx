import { useEffect, useState } from 'react'
import { Button, Modal, cn, message } from '@/components/ui'
import {
  OPERATOR_DESKTOP,
  operatorDesktopClass,
} from '@/constants/operatorDesktopSizes'
import { useUnassignInboundFromBuffer } from '@/hooks/useInbound'
import type { InboundBufferAssignment } from '@/types/inbound'
import { toDisplayInteger } from '@/utils/number'

type Props = {
  open: boolean
  assignment: InboundBufferAssignment | null
  onClose: () => void
  onUnassigned?: () => void
}

export default function UnassignInboundBufferModal({
  open,
  assignment,
  onClose,
  onUnassigned,
}: Props) {
  const [selectedDetailId, setSelectedDetailId] = useState<number | null>(null)
  const unassignMutation = useUnassignInboundFromBuffer()

  const details = assignment?.details ?? []

  useEffect(() => {
    if (!open) {
      setSelectedDetailId(null)
      return
    }
    if (details.length === 1) {
      setSelectedDetailId(details[0].detail_id)
    } else {
      setSelectedDetailId(null)
    }
  }, [open, assignment?.location_id, details])

  const handleConfirm = () => {
    if (!assignment?.inbound_order_id) {
      message.error('Không xác định được đơn của lệnh đang gán')
      return
    }
    if (!selectedDetailId) {
      message.error('Vui lòng chọn đúng 1 lệnh để hủy gán')
      return
    }
    unassignMutation.mutate(
      {
        orderId: assignment.inbound_order_id,
        data: {
          location_id: assignment.location_id,
          detail_id: selectedDetailId,
        },
      },
      {
        onSuccess: () => {
          message.success(
            `Đã hủy gán lệnh #${selectedDetailId} khỏi ô ${assignment.location_code}`,
          )
          onUnassigned?.()
          onClose()
        },
        onError: (err) => {
          message.error(
            err.response?.data?.detail ?? 'Không thể hủy gán ô buffer',
          )
        },
      },
    )
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title="Hủy gán vị trí buffer"
      width={OPERATOR_DESKTOP.modal.sm}
      destroyOnHidden
      footer={
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={unassignMutation.isPending}
          >
            Đóng
          </Button>
          <Button
            variant="danger"
            onClick={handleConfirm}
            loading={unassignMutation.isPending}
            disabled={!assignment?.inbound_order_id || !selectedDetailId}
          >
            Xác nhận hủy gán
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-warning-200 bg-warning-50 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-warning-700/70">
            Ô đang gán
          </p>
          <p className="mt-1 font-mono text-lg font-bold text-brand-dark">
            {assignment?.location_code ?? '—'}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Đơn:{' '}
            <span className="font-semibold text-brand-dark">
              {assignment?.order_code ?? `#${assignment?.inbound_order_id ?? '—'}`}
            </span>
          </p>
        </div>

        <p className="text-sm text-slate-600">
          Chọn <span className="font-semibold">đúng 1 lệnh</span> đang gán trên ô
          để hủy. Hệ thống sẽ trừ tồn buffer, đưa ô về trống, xóa điểm lấy;
          vị trí gợi ý (điểm trả) vẫn giữ nguyên.
        </p>

        {details.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-400">
            Không có lệnh gán trên ô này.
          </p>
        ) : (
          <div className={`${operatorDesktopClass.listMax56} space-y-2 overflow-y-auto`}>
            {details.map((line) => {
              const active = selectedDetailId === line.detail_id
              return (
                <button
                  key={line.detail_id}
                  type="button"
                  onClick={() => setSelectedDetailId(line.detail_id)}
                  className={cn(
                    'w-full rounded-lg border px-3 py-2.5 text-left transition',
                    active
                      ? 'border-brand-primary bg-brand-primary/10 ring-1 ring-brand-primary/30'
                      : 'border-slate-200 bg-white hover:border-brand-primary/50',
                  )}
                >
                  <p className="font-mono text-sm font-bold text-brand-dark">
                    Lệnh #{line.detail_id}
                    {line.product_sku ? ` · ${line.product_sku}` : ''}
                  </p>
                  <p className="text-xs text-slate-500">
                    {line.product_name || '—'} · SL{' '}
                    {toDisplayInteger(line.expected_quantity)} · {line.status}
                    {line.vehicle_number ? ` · ${line.vehicle_number}` : ''}
                  </p>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </Modal>
  )
}
