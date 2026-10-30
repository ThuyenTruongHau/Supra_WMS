import { useState } from 'react';
import { PauseCircleOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { Input, Popover } from 'antd';
import { Button, Modal, message } from '@/components/ui';
import type { useInboundDispatch } from '@/hooks/useInboundDispatch';
import { getApiErrorMessage } from '@/utils/apiErrorMessage';
import { INBOUND_ROBOTS } from '@/utils/robotStatus';
import { operatorPopupContainer } from '@/components/layout/operatorStage';

export default function InboundDispatchControl({ dispatch, className }: {
  dispatch: ReturnType<typeof useInboundDispatch>;
  className?: string;
}) {
  const [commandId, setCommandId] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const status = dispatch.data;
  const pausing = dispatch.toggle.isPending && dispatch.toggle.variables === false;
  const toggle = async () => {
    try { await dispatch.toggle.mutateAsync(!status?.enabled); }
    catch (error) { message.error(getApiErrorMessage(error)); }
  };
  const details = (
    <div className="flex max-w-sm flex-col gap-2" data-testid="inbound-dispatch-details">
      <div className="text-sm">
        {!status || dispatch.isError ? 'Chưa đọc được trạng thái gửi nhập' : pausing ? 'Đang Dừng phiên…' : (
          <>
            <strong>{status.enabled ? 'Đang cho phép gửi nhập' : 'Đã ngừng gửi nhập'}</strong>
            <span> — còn {status.issued_count} lệnh nhập đã phát, {status.waiting_count} lệnh chờ</span>
            {status.batch_code && <div>Đợt {status.batch_code}{status.sorting_persons ? ` · Người nhập: ${status.sorting_persons}` : ''}</div>}
            {status.batch_id != null && <div>Robot: {status.assign_robot_id
              ? INBOUND_ROBOTS.find(robot => robot.deviceCode === status.assign_robot_id)?.name ?? status.assign_robot_id
              : 'RCS phân công'}</div>}
            {status.message && <div>{status.message}</div>}
          </>
        )}
      </div>
      {status?.problems.map(problem => (
        <div className="break-words text-sm text-red-700" key={problem.command_id}>
          <div>{problem.order_id || `Dòng ${problem.detail_id}`}: {problem.message || 'Cần đối soát'}</div>
          {problem.state === 'unknown' && <Button variant="secondary" size="small" onClick={() => { setCommandId(problem.command_id); setNote(''); }}>
            Xác minh RCS chưa nhận lệnh
          </Button>}
        </div>
      ))}
    </div>
  );
  return (
    <div className="inline-flex shrink-0" aria-live="polite" data-testid="inbound-dispatch-control">
      <Popover content={details} placement="bottomLeft" trigger="hover" destroyOnHidden getPopupContainer={operatorPopupContainer}>
        <span className="inline-flex">
          <Button variant={status?.enabled ? 'secondary' : 'primary'}
            className={className}
            aria-label={pausing ? 'Đang tạm dừng' : status?.enabled ? 'Dừng phiên' : 'Tiếp tục phiên'}
            icon={status?.enabled ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
            loading={dispatch.toggle.isPending}
            disabled={!status || dispatch.isError || dispatch.toggle.isPending || status.problems.some(p => p.state === 'unknown' || p.state === 'sending')}
            onClick={() => void toggle()}>
            {pausing ? 'Đang tạm dừng…' : status?.enabled ? 'Dừng phiên' : 'Tiếp tục phiên'}
          </Button>
        </span>
      </Popover>
      <Modal open={commandId != null} title="Xác minh lệnh chưa được RCS tiếp nhận" okText="Xác nhận chưa gửi" cancelText="Hủy"
        confirmLoading={dispatch.verify.isPending} okButtonProps={{ disabled: !note.trim() }} onCancel={() => setCommandId(null)}
        onOk={async () => {
          if (commandId == null) return;
          try { await dispatch.verify.mutateAsync({ commandId, note: note.trim() }); setCommandId(null); }
          catch (error) { message.error(getApiErrorMessage(error)); }
        }}>
        <p>Đối chiếu mã lệnh trên RCS trước khi xác nhận. Nếu RCS đã nhận lệnh, hãy cập nhật kết quả từ RCS.</p>
        <Input.TextArea value={note} onChange={event => setNote(event.target.value)} maxLength={2000} placeholder="Ghi nhận kết quả đối soát trên RCS" />
      </Modal>
    </div>
  );
}
