/** Phần tử sân khấu operator. Modal gắn vào đây để cùng tỷ lệ với khung desktop. */
export const operatorStageEl: { current: HTMLElement | null } = {
  current: null,
};

export function operatorPopupContainer(): HTMLElement {
  return operatorStageEl.current ?? document.body;
}
