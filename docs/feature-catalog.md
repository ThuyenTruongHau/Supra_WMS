# Danh mục chức năng và mức độ khảo sát

Ngày đối chiếu: **2026-10-14**.

- **Chi tiết:** đã đọc luồng lấy dữ liệu và cách tính từ source; chưa kiểm chứng runtime.
- **Bản đồ:** đã nhận diện màn hình/module/điểm vào; chưa xác minh đầy đủ nghiệp vụ, API và ngoại lệ.

| Phân hệ | Route UI chính | Backend trong `app/modules/` | Mức độ |
|---|---|---|---|
| Báo cáo và biểu đồ | `/report` | `warehouse/dashboard/` | Chi tiết; xu hướng/Top cập nhật 2026-10-16, bốn nhóm tuổi tồn 2026-10-19; xem [reporting](reporting/overview.md) |
| Bản đồ kho | `/dashboard` | `warehouse/location_map/`, `warehouse/warehouse_zone/` | Bản đồ |
| Hàng hóa và tồn | `/items`, `/items/:id` | `warehouse/item/`, `warehouse/item_stock/` | Bản đồ; đọc sâu phần dữ liệu phục vụ reporting |
| Nhập kho | `/import`, `/import/:id`, `/qrtablet/import` | `warehouse/inbound_order/` | Bản đồ; đã đọc hàm đếm và nguồn dữ liệu reporting |
| Xuất kho | `/export`, `/export/:orderId`, `/qrtablet/export` | `warehouse/outbound_order/` | Bản đồ; đã đọc hàm đếm và nguồn dữ liệu reporting |
| Kiểm kê | `/inventory`, `/inventory/:id`, `/qrtablet/inventory` | `warehouse/stocktake/` | Bản đồ |
| Backlog | `/backlog` | Cần lần tiếp từ frontend để xác định API/service chính xác | Bản đồ UI |
| Thông báo | `/notification` | `warehouse/notificcation/` | Bản đồ; đọc hàm đếm cảnh báo chưa xử lý |
| Kho/khu vực/vị trí | `/setting/warehouse`, `/zones` | `warehouse/warehouse_zone/`, `warehouse/location_map/` | Bản đồ |
| Đơn vị, QR và in | `/setting/units`, `/setting/qr-codes`, `/qrtablet/print-qr` | `warehouse/unit/`, `warehouse/item/`, module liên quan | Bản đồ |
| Người dùng và quyền | `/login`, `/setting/users` | `auth/`, `core/dependencies.py` | Bản đồ; đã đọc guard và quyền reporting |
| Robot/AMR | Không xác nhận một route UI độc lập | `robot/` | Bản đồ tích hợp |
| Import/export định dạng riêng | Nằm trong các luồng nhập/xuất | `masan/` | Bản đồ; chưa suy diễn đối tượng triển khai từ tên module |
| Lịch sử giao dịch | Cần khảo sát điểm sử dụng UI | `warehouse/transaction_history/` | Bản đồ |
| Demo offline | Cùng route, đổi Axios adapter | `frontend/src/snapshot/` | Bản đồ |

Nguồn route: [routes](../frontend/src/routes/index.tsx). Nguồn đăng ký API: [main](../backend/app/main.py). Các route dưới layout chính hiện qua `AdminRoute`; QR tablet qua `ProtectedRoute`.

## Cách bổ sung một phân hệ

Khi có nhiệm vụ ngoài reporting, đọc source liên quan rồi tạo `docs/modules/<phan-he>.md` nếu nội dung đủ lớn. Ghi mục đích, người dùng, luồng, API, dữ liệu, chuyển trạng thái, ngoại lệ, kiểm chứng và câu hỏi còn mở. Sau đó cập nhật mức độ khảo sát ở bảng trên; không đánh dấu hoàn tất chỉ vì đã liệt kê file.
