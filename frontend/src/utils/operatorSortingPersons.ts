/** Gộp danh sách username operator thành chuỗi gửi BE (`sorting_persons`). */
export function formatOperatorSortingPersons(
  usernames: string[] | null | undefined,
): string {
  if (!Array.isArray(usernames)) {
    return "";
  }
  return usernames
    .map((name) => String(name ?? "").trim())
    .filter(Boolean)
    .join(", ");
}

export function hasInboundOperatorAssignee(username: string | undefined): boolean {
  return Boolean(username?.trim());
}

export function hasOutboundOperatorAssignees(
  usernames: string[] | null | undefined,
): boolean {
  return formatOperatorSortingPersons(usernames).length > 0;
}

export const OPERATOR_ASSIGNEE_REQUIRED_INBOUND =
  "Chọn người nhập trước khi gọi robot";

export const OPERATOR_ASSIGNEE_REQUIRED_OUTBOUND =
  "Chọn người xuất trước khi gọi lệnh hoặc gọi robot";
