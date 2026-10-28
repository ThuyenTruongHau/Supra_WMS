import { RobotOutlined, StopOutlined } from '@ant-design/icons';
import { Button, message } from '@/components/ui';
import { useOutboundAuto } from '@/hooks/useOutboundAuto';
import { useOutboundOperatorAssignees } from '@/store/useOperatorAssigneeStore';
import { getApiErrorMessage } from '@/utils/apiErrorMessage';
import { hasOutboundOperatorAssignees } from '@/utils/operatorSortingPersons';
import { autoCanStart } from '@/utils/outboundAuto';

export default function OutboundAutoControl({ warehouseId, displayZoneId, className }: {
  warehouseId: number; displayZoneId: number; className?: string;
}) {
  const auto = useOutboundAuto(warehouseId, displayZoneId);
  const { usernames } = useOutboundOperatorAssignees(displayZoneId);
  const enabled = auto.data?.enabled ?? false;
  const available = Boolean(auto.data) && !auto.isError;
  const canStart = autoCanStart(warehouseId, hasOutboundOperatorAssignees(usernames), available);
  const toggle = async () => {
    try {
      await auto.toggle.mutateAsync(!enabled);
      // message.success(enabled ? 'Đã dừng phát lệnh tự động' : 'Đã bật gọi tự động cho khu này');
    } catch (error) {
      message.error(getApiErrorMessage(error));
    }
  };
  return (
    <div className="flex min-w-0 flex-col gap-1" aria-live="polite" data-testid={`outbound-auto-${displayZoneId}`}>
      <Button variant={enabled ? 'danger' : 'primary'}
        icon={enabled ? <StopOutlined /> : <RobotOutlined />}
        disabled={enabled ? !available : !canStart}
        loading={auto.toggle.isPending} onClick={() => void toggle()} className={className}
        title={!available ? 'Chưa đọc được trạng thái tự động' : !enabled && !canStart ? 'Chọn người xuất trước khi bật' : undefined}>
        {enabled ? 'Dừng tự động' : 'Gọi tự động'}
      </Button>
    </div>
  );
}
