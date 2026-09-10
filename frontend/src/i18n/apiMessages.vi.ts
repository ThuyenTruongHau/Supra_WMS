/**
 * Bản dịch message lỗi API (tiếng Anh từ backend) → tiếng Việt trên UI.
 * Key phải khớp prefix/câu backend trả về.
 */
import { translateQrType } from "@/i18n/qrTypeLabels.vi";

const CALLER_PREFIX = /^Error calling inbound order:\s*/i;

const QR_TYPE_LOCATION_CONFLICT =
  /^Location already has QR type '(\w+)', cannot assign QR type '(\w+)'$/;

const PACKING_USER_PENDING_ITEM_CONFLICT =
  /^Packing user already has pending stock for item '([^']+)', cannot cache a different item$/;

const PACK_ALREADY_LINKED =
  /^Pack QR is already linked to an item and cannot be modified$/;

const PACK_ALREADY_ASSIGNED_OTHER_ITEM =
  /^Pack QR is already assigned to a different item anchor and cannot be reassigned$/;

const ONLY_ITEM_QR_LOCATION_ASSIGN =
  /^Only item QR codes can be assigned to a location, got '(\w+)'$/;

const PACK_ITEM_ANCHOR_MISMATCH =
  /^Pack QR item does not match item anchor product '([^']+)'$/;

const ANCHOR_PACK_ITEM_MISMATCH =
  /^Item anchor already has packs for item '([^']+)', cannot assign a pack for a different item$/;

const UNIT_NOT_FOUND = /^Unit not found:\s*(.+)$/;
const ITEM_NOT_FOUND = /^Item not found:\s*(.+)$/;
const INVALID_CAVITY = /^Invalid cavity_number:\s*(.+)$/;

/** @deprecated legacy backend message — remove after deploy */
const QR_TYPE_LOCATION_CONFLICT_LEGACY =
  /^Vị trí đã có QR loại '(\w+)', không thể gán QR loại '(\w+)'$/;

export const API_MESSAGES_VI: Record<string, string> = {
  "Warehouse not found": "Không tìm thấy kho",
  "Warehouse id not found": "Không tìm thấy kho",
  "No stock found for the selected product codes":
    "Không có sản phẩm nào với mã sản phẩm đó",
  "Selected locations have no stock": "Tồn tại vị trí không có hàng",
  "No stock found for the selected lots": "Không có sản phẩm nào trong lô đó",
  "No stock found in this warehouse": "Không có tồn kho nào trong kho này",
  "Invalid lot number format": "Số lô không hợp lệ",
  "Database conflict": "Xung đột dữ liệu, vui lòng thử lại",
  "No suitable item stocks found": "Không tìm thấy tồn kho phù hợp",
  "Stocktake not found": "Không tìm thấy phiếu kiểm kê",

  "QR code is expired": "Mã QR đã hết hạn (không phải ngày hôm nay)",
  "QR code is already assigned to an item stock":
    "Mã QR đã được nhập kho",
  "QR code already exists": "Mã QR đã tồn tại",
  "QR code": "Không tìm thấy mã QR",
  "quantity and unit_id are required when assigning a QR code to a location":
    "Cần số lượng và đơn vị khi gán mã QR vào vị trí",
  "Invalid QR code or location not found":
    "Mã QR không hợp lệ hoặc không tìm thấy vị trí",
  "Only item or pack QR codes can be cached for packing":
    "Chỉ mã QR loại sản phẩm hoặc đóng gói mới được lưu tạm ở chế độ người đóng gói",
  "Only pack QR codes can be previewed in this flow":
    "Chỉ mã QR loại đóng gói (pack) mới được xem trước trong luồng này",
  "Only pack QR codes can be assigned to an item anchor":
    "Chỉ mã QR pack mới được gán vào item",
  "target_qr_id is required when assigning pack to item":
    "Cần mã item đích khi gán pack",
  "quantity and unit_id are required when assigning pack to item":
    "Cần số lượng và đơn vị khi gán pack vào item",
  "lot_number is required when assigning pack to item":
    "Cần số lô khi gán pack vào item",
  "manufacturing_user is required when assigning pack to item":
    "Cần người sản xuất khi gán pack vào item",
  "Invalid QR code": "Mã QR không hợp lệ",
  "Transit QR codes cannot be cached for packing":
    "Mã QR di chuyển không thể lưu tạm ở chế độ người đóng gói",
  "Pack QR is already linked to an item and cannot be modified":
    "Pack QR đã được gán cho item, không thể quét lại hoặc sửa",
  "Pack QR is already assigned to a different item anchor and cannot be reassigned":
    "Pack đã được gán cho item khác, không thể gán sang item mới",
  "Pack QR codes cannot be assigned in this flow":
    "Không thể quét mã pack trong luồng gán vị trí — chỉ dùng mã item",
  "Transit QR codes cannot be assigned to a location":
    "Không thể gán mã QR di chuyển vào vị trí",
  "relation cannot reference the same QR code":
    "Pack không thể liên kết với chính mã QR đó",
  "relation must point to a cached item QR":
    "Cần quét và lưu tạm item trước khi gán pack",
  "relation must point to an item QR":
    "Pack chỉ có thể liên kết với mã QR loại sản phẩm (item)",
  "relation item belongs to a different packing user":
    "Item này thuộc người đóng gói khác, không thể gán pack",
  "packing_user is required": "Cần chọn người đóng gói",
  "qc_user is required for item or pack QR":
    "Cần chọn người kiểm tra cho mã QR sản phẩm/đóng gói",
  "packing_user is required for item or pack QR":
    "Cần chọn người đóng gói cho mã QR sản phẩm/đóng gói",
  /** @deprecated legacy backend key */
  "Mã QR không hợp lệ hoặc không tìm thấy vị trí":
    "Mã QR không hợp lệ hoặc không tìm thấy vị trí",
  "lot_number is required when assigning a QR code to a location":
    "Cần số lô khi gán mã QR vào vị trí",
  "cavity_number is required for this item":
    "Sản phẩm này yêu cầu chọn số cavity",
  "Invalid cavity_number": "Số cavity không hợp lệ",
  "manufacturing_user is required when assigning a QR code to a location":
    "Cần chọn người sản xuất khi gán mã QR vào vị trí",
  "From or to location not found": "Không tìm thấy vị trí nguồn hoặc đích",
  "Unit not found": "Không tìm thấy đơn vị",
  "Item not found": "Không tìm thấy sản phẩm",
  "Item id not found": "Không tìm thấy sản phẩm",
  "qr_ids length must match quantity":
    "Số mã QR phải khớp với số lượng in",
  "qr_ids must be unique": "Danh sách mã QR không được trùng",
  "qr_ids must not exceed 50 characters":
    "Mã QR không được vượt quá 50 ký tự",
  "display_codes length must match quantity":
    "Số mã hiển thị phải khớp với số lượng in",

  "Allocation requires item_id": "Dòng hàng thiếu mã sản phẩm",
  "Allocation requires unit_id": "Dòng hàng thiếu đơn vị",
  "Allocation requires quantity": "Dòng hàng thiếu số lượng",
  "Allocation requires lot_number_from and lot_number_to":
    "Dòng hàng thiếu số lô",
  "lot_number_from and lot_number_to are required": "Thiếu số lô",
  "lot number must not be blank": "Số lô không được để trống",
  "Detail requires from_location_id to create stock":
    "Thiếu điểm cấp để tạo tồn kho",
  "Inbound order not found": "Không tìm thấy đơn nhập",
  "Inbound order must have at least one detail":
    "Đơn nhập phải có ít nhất một nhóm hàng",
  "Inbound detail must have at least one allocation":
    "Nhóm hàng phải có ít nhất một sản phẩm",
  "Inbound detail": "Không tìm thấy nhóm hàng",
  "Inbound allocation": "Không tìm thấy dòng phân bổ",
  "Only initialize order can be deleted":
    "Chỉ xóa được đơn ở trạng thái khởi tạo",
  "Only initialize order can be updated":
    "Chỉ sửa được đơn ở trạng thái khởi tạo",
  "New line item requires from_location_id": "Dòng mới thiếu điểm cấp",
  "New line item requires to_location_id": "Dòng mới thiếu vị trí đích",
  "New line item requires at least one allocation":
    "Dòng mới phải có ít nhất một sản phẩm",
  "Detail not found": "Không tìm thấy nhóm hàng",
  "From location is required before accepting task":
    "Cần điểm cấp trước khi nhận task",
  "To location is required before accepting task":
    "Cần vị trí đích trước khi nhận task",

  "Item stock has no location; robot task cannot be dispatched":
    "Tồn kho chưa có vị trí, không thể gửi lệnh robot",
  "Pick location does not match the pallet's actual location. Stock may have been moved by another outbound order.":
    "Vị trí lấy hàng không khớp vị trí thực của pallet. Hàng có thể đã được chuyển bởi đơn xuất khác.",

  /** @deprecated legacy backend message — remove after deploy */
  "Item stock chưa có vị trí, không thể gửi lệnh robot":
    "Tồn kho chưa có vị trí, không thể gửi lệnh robot",
  /** @deprecated legacy backend message — remove after deploy */
  "Vị trí lấy hàng không khớp vị trí thực của pallet. Hàng có thể đã được chuyển bởi đơn xuất khác.":
    "Vị trí lấy hàng không khớp vị trí thực của pallet. Hàng có thể đã được chuyển bởi đơn xuất khác.",
};

const API_MESSAGE_ENTRIES = Object.entries(API_MESSAGES_VI).sort(
  (a, b) => b[0].length - a[0].length,
);

function applyDictionary(message: string): string {
  const exact = API_MESSAGES_VI[message];
  if (exact) return exact;
  for (const [en, vi] of API_MESSAGE_ENTRIES) {
    if (message === en) return vi;
    if (message.startsWith(en)) {
      const rest = message.slice(en.length).replace(/^[:\s]+/, "");
      return rest ? `${vi}: ${rest}` : vi;
    }
  }
  return message;
}

function translatePackingUserPendingItemConflict(message: string): string | null {
  const match = message.match(PACKING_USER_PENDING_ITEM_CONFLICT);
  if (!match) return null;
  const [, existingSku] = match;
  return (
    `Người đóng gói đã có hàng tạm của sản phẩm ${existingSku}. ` +
    "Không thể lưu tạm sản phẩm khác."
  );
}

function translatePackAlreadyLinked(message: string): string | null {
  if (!PACK_ALREADY_LINKED.test(message)) return null;
  return "Pack QR đã được gán cho item, không thể quét lại hoặc sửa";
}

function translatePackAlreadyAssignedOtherItem(message: string): string | null {
  if (!PACK_ALREADY_ASSIGNED_OTHER_ITEM.test(message)) return null;
  return "Pack đã được gán cho item khác, không thể gán sang item mới";
}

function translateOnlyItemQrLocationAssign(message: string): string | null {
  const match = message.match(ONLY_ITEM_QR_LOCATION_ASSIGN);
  if (!match) return null;
  const [, qrType] = match;
  return (
    `Chỉ mã QR loại sản phẩm (item) mới được gán vị trí, không phải ${translateQrType(qrType)}`
  );
}

function translatePackItemAnchorMismatch(message: string): string | null {
  const match = message.match(PACK_ITEM_ANCHOR_MISMATCH);
  if (!match) return null;
  const [, anchorSku] = match;
  return `Pack không cùng sản phẩm với item đích (${anchorSku})`;
}

function translateAnchorPackItemMismatch(message: string): string | null {
  const match = message.match(ANCHOR_PACK_ITEM_MISMATCH);
  if (!match) return null;
  const [, existingSku] = match;
  return (
    `Item đích đã có pack của sản phẩm ${existingSku}, ` +
    "không thể gán pack sản phẩm khác"
  );
}

function translateUnitNotFound(message: string): string | null {
  const match = message.match(UNIT_NOT_FOUND);
  if (!match) return null;
  return `Không tìm thấy đơn vị: ${match[1]}`;
}

function translateItemNotFound(message: string): string | null {
  const match = message.match(ITEM_NOT_FOUND);
  if (!match) return null;
  return `Không tìm thấy sản phẩm: ${match[1]}`;
}

function translateInvalidCavity(message: string): string | null {
  const match = message.match(INVALID_CAVITY);
  if (!match) return null;
  return `Số cavity không hợp lệ: ${match[1]}`;
}

function translateQrTypeLocationConflict(message: string): string | null {
  const match =
    message.match(QR_TYPE_LOCATION_CONFLICT) ??
    message.match(QR_TYPE_LOCATION_CONFLICT_LEGACY);
  if (!match) return null;
  const [, existingType, incomingType] = match;
  return (
    `Vị trí này đang có ${translateQrType(existingType)}. ` +
    `Không thể gán ${translateQrType(incomingType)} vào cùng vị trí.`
  );
}

export function isQrTypeLocationConflictMessage(message: string): boolean {
  const trimmed = message.trim();
  return (
    QR_TYPE_LOCATION_CONFLICT.test(trimmed) ||
    QR_TYPE_LOCATION_CONFLICT_LEGACY.test(trimmed)
  );
}

export function translateApiMessage(message: string): string {
  const trimmed = message.trim();
  if (!trimmed) return trimmed;
  const inner = trimmed.replace(CALLER_PREFIX, "").trim();
  const target = inner || trimmed;

  const packLinked = translatePackAlreadyLinked(target);
  if (packLinked) return packLinked;

  const packAssignedOtherItem = translatePackAlreadyAssignedOtherItem(target);
  if (packAssignedOtherItem) return packAssignedOtherItem;

  const onlyItemQrAssign = translateOnlyItemQrLocationAssign(target);
  if (onlyItemQrAssign) return onlyItemQrAssign;

  const packItemAnchorMismatch = translatePackItemAnchorMismatch(target);
  if (packItemAnchorMismatch) return packItemAnchorMismatch;

  const anchorPackItemMismatch = translateAnchorPackItemMismatch(target);
  if (anchorPackItemMismatch) return anchorPackItemMismatch;

  const pendingItemConflict = translatePackingUserPendingItemConflict(target);
  if (pendingItemConflict) return pendingItemConflict;

  const qrConflict = translateQrTypeLocationConflict(target);
  if (qrConflict) return qrConflict;

  const unitNotFound = translateUnitNotFound(target);
  if (unitNotFound) return unitNotFound;

  const itemNotFound = translateItemNotFound(target);
  if (itemNotFound) return itemNotFound;

  const invalidCavity = translateInvalidCavity(target);
  if (invalidCavity) return invalidCavity;

  return applyDictionary(target);
}
