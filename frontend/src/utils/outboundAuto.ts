export const OUTBOUND_AUTO_PHASE_LABELS: Record<string, string> = {
  idle: 'Chưa có lượt',
  supplying: 'Đang cấp hàng',
  awaiting_confirmation: 'Chờ chia CC',
  ready_to_return: 'Chờ return',
  returning: 'Đang return',
  completed: 'Hoàn tất',
  error: 'Cần đối soát',
};

export function autoCanStart(warehouseId: number, hasAssignees: boolean, stateAvailable: boolean) {
  return warehouseId > 0 && hasAssignees && stateAvailable;
}

export function autoCanReturn(enabled: boolean, phase: string) {
  return !enabled && phase === 'ready_to_return';
}
