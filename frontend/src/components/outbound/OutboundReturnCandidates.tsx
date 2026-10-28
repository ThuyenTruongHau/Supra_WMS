import { useState } from 'react';
import { Button, Modal, TextArea, message } from '@/components/ui';
import { useOutboundAuto } from '@/hooks/useOutboundAuto';
import { getApiErrorMessage } from '@/utils/apiErrorMessage';

export default function OutboundReturnCandidates({ warehouseId, displayZoneId }: {
  warehouseId: number; displayZoneId: number;
}) {
  const auto = useOutboundAuto(warehouseId, displayZoneId);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const candidates = auto.data?.return_candidates ?? [];
  const selected = candidates.find((item) => item.task_id === selectedId);
  const verify = async () => {
    if (!selected?.can_verify || auto.manualBlocked || !note.trim()) return;
    try {
      await auto.verifyUnsent.mutateAsync({ taskId: selected.task_id, note: note.trim() });
      setSelectedId(null);
      setNote('');
      message.success('Đã ghi nhận đối soát. Return sẽ được xét tiếp quản khi bật tự động.');
    } catch (error) { message.error(getApiErrorMessage(error)); }
  };
  return <>
    <div className="mt-2 space-y-2" data-testid={`outbound-return-candidates-${displayZoneId}`}>
      {candidates.map((item) => <div key={item.task_id} className="rounded border p-2" data-testid={`return-candidate-${item.task_id}`}>
        <p><strong>{item.name}</strong> · {item.order_id} · {item.quantity}</p>
        <p>{item.message}</p>
        {item.can_verify && !auto.data?.enabled && <Button size="small" className="mt-1"
          disabled={auto.manualBlocked} onClick={() => { setSelectedId(item.task_id); setNote(''); }}>
          Xác nhận chưa gửi ICS
        </Button>}
        {item.can_verify && auto.data?.enabled && <p>Dừng tự động để đối soát lệnh này.</p>}
      </div>)}
    </div>
    <Modal title="Xác nhận chưa gửi ICS" open={selectedId !== null}
      onCancel={() => { if (!auto.verifyUnsent.isPending) setSelectedId(null); }}
      onOk={() => void verify()} okText="Xác nhận chưa gửi" cancelText="Hủy"
      confirmLoading={auto.verifyUnsent.isPending}
      okButtonProps={{ disabled: auto.manualBlocked || !selected?.can_verify || !note.trim() }}>
      <p>Đối chiếu mã {selected?.order_id} trên ICS và chỉ xác nhận khi ICS chưa nhận lệnh này.</p>
      <p>Thao tác chỉ ghi nhận đối soát; bật Gọi tự động để hệ thống xét gửi return.</p>
      <TextArea className="mt-3" aria-label="Ghi chú đối soát ICS" value={note} maxLength={2000}
        onChange={(event) => setNote(event.target.value)} placeholder="Ghi kết quả đối soát ICS" rows={3} />
    </Modal>
  </>;
}
