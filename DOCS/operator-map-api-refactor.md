# Kế hoạch Refactor API cho Operator Map

Tài liệu này mô tả chi tiết yêu cầu refactor API cho bản đồ của Operator (hiện đang dùng chung endpoint `/inbound-buffers/view`), nhằm mục đích tối ưu hiệu năng và chia nhỏ dữ liệu tĩnh (layout) và dữ liệu động (status), tương tự như kiến trúc bản đồ của Admin.

## Bối cảnh & Vấn đề

- API hiện tại `GET /api/v1/warehouse-maps/inbound-buffers/view` đang gộp chung cả tọa độ tĩnh (layout) và dữ liệu trạm (points/status) vào một payload duy nhất.
- Mỗi khi Frontend cần cập nhật realtime trạng thái số lượng đơn ở một trạm, toàn bộ cục dữ liệu `MapData` nặng 3-4 MB cũng bị parse lại, gây giật lag và tốn băng thông.

## Đề xuất Giải pháp

Chúng ta sẽ tách làm 2 API độc lập để Frontend có thể lấy tĩnh (cache 1 lần) và lấy động (polling liên tục).
Lưu ý: 1 kho (zone) trong hệ thống được thiết lập chuyên biệt cho Nhập (Inbound) hoặc Xuất (Outbound), nên Backend không cần tham số `location_type` để lọc dữ liệu.

### 1. API Lấy Tọa độ tĩnh (Static Layout)
- **Endpoint:** `GET /api/v1/warehouse-maps/zones/{zone_id}/map-data`
- **Method:** GET
- **Params:** Chỉ cần `zone_id` trên path. Không cần query param `location_type`.
- **Logic Backend:**
  - Lấy tọa độ các trạm thuộc `zone_id` đó.
  - Lấy thêm các điểm lân cận (trong phạm vi radius hoặc bounding box) từ bản đồ nhà kho gốc.
- **Output:** Trả về đối tượng `MapData` (nodes, edges) thuần túy.
- **Lưu ý:** API này sẽ được Frontend gọi 1 lần khi vào màn hình và cache lại (staleTime lớn).

### 2. API Lấy Trạng thái động (Dynamic Status)
- **Endpoint:** `GET /api/v1/warehouse-locations/zones/{zone_id}/for-map`
- **Method:** GET
- **Params:** Chỉ cần `zone_id` trên path. Không cần query param `location_type`.
- **Logic Backend:**
  - Truy vấn các trạm thuộc `zone_id` này.
  - Đếm số lượng task đang active, trạng thái đang bận/rảnh.
  - Thông tin mở rộng như: đây có phải trạm Bypass không (nếu là Inbound).
- **Output:** Trả về mảng danh sách trạng thái ngắn gọn của các trạm.
- **Lưu ý:** API này cực kỳ nhẹ, Frontend sẽ cấu hình Polling (fetch liên tục mỗi 5s) hoặc dùng WebSocket để cập nhật UI.

### 3. Lộ trình Deprecate (Loại bỏ) API cũ
- **Bước 1:** Đội Backend phát triển và deploy 2 API mới.
- **Bước 2:** Đội Frontend tiến hành chuyển đổi sang sử dụng 2 API này (cùng lúc với việc refactor component Frontend).
- **Bước 3:** Đánh dấu deprecated và sau đó xóa hẳn API `GET /api/v1/warehouse-maps/inbound-buffers/view`.
