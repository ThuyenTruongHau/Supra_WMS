/**
 * Bản dịch message lỗi API (tiếng Anh từ backend) → tiếng Việt trên UI.
 * Key phải khớp prefix/câu backend trả về.
 */
const CALLER_PREFIX = /^Error calling inbound order:\s*/i;

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
  "Mã QR không hợp lệ hoặc không tìm thấy vị trí":
    "Mã QR không hợp lệ hoặc không tìm thấy vị trí",
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

export function translateApiMessage(message: string): string {
  const trimmed = message.trim();
  if (!trimmed) return trimmed;
  const inner = trimmed.replace(CALLER_PREFIX, "").trim();
  return applyDictionary(inner || trimmed);
}
