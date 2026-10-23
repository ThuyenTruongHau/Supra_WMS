# Chức năng và điểm vào

Mức bằng chứng: **đọc route và các module liên quan** tại mốc 20/10/2026. “Có route”
không đồng nghĩa đã nghiệm thu đầy đủ, đã triển khai hoặc mọi tài khoản đều được
quyền gọi API tương ứng.

## Màn hình chính

Nguồn: [routes/index.tsx](../frontend/src/routes/index.tsx).

| Route | Component/nhóm chức năng |
| --- | --- |
| `/login` | `LoginPage`: đăng nhập |
| `/overview` | Admin chuyển `/report`; operator dùng `ReportPage` |
| `/dashboard` | `DashboardPage`: bản đồ kho |
| `/import` | Admin `ImportPage`; operator `OperatorInboundPage` |
| `/import/:id` | `ImportDetailPage`: chi tiết nhập |
| `/export` | Admin `OutboundPage`; operator `OperatorOutboundPage` |
| `/export/zone/:zoneId` | `OperatorOutboundDetailPage`: luồng theo vùng hiển thị |
| `/export/:orderId` | `OutboundDetailPage`: chi tiết đơn xuất |
| `/export/sorting-waves` | Operator `OperatorSortingWavePage`; nhánh admin hiện là thông báo chưa hoàn thiện |
| `/monitor`, `/monitor/zone/:zoneId` | Operator monitor và chi tiết khu; click CC xác nhận lấy hàng theo ô đó. Admin ở `/monitor` chuyển `/report` |
| `/control-tower` | `OperatorControlTowerPage`; admin chuyển `/report` |
| `/inventory`, `/inventory/:id` | `StocktakePage`, `StocktakeDetailPage` |
| `/items`, `/items/:id` | Danh sách và chi tiết hàng |
| `/backlog` | `BacklogPage` |
| `/report`, `/notification` | Báo cáo, thông báo |
| `/zones` | `ZoneSettingPage` |
| `/setting/users`, `/setting/warehouse`, `/setting/units`, `/setting/qr-codes` | Quản trị dữ liệu tương ứng |
| `/setting` | Hiện là placeholder trong router |
| `/print-qr` | `QrTabletPrintQrPage` |

Một số route setting cũ hiện redirect. Page có trong thư mục nhưng không xuất
hiện ở bảng phải đối chiếu router trước khi sửa với giả định “đây là màn hình đang dùng”.

## Luồng QR tablet

Các route con `/qrtablet/import`, `/qrtablet/export`, `/qrtablet/export/:orderId`,
`/qrtablet/inventory`, `/qrtablet/print-qr` sử dụng các page dưới
[pages/qrtablet](../frontend/src/pages/qrtablet).

Luồng gửi task của tablet có helper
[sendCallerAddTasks.ts](../frontend/src/utils/sendCallerAddTasks.ts) đi qua
`/task/add-task` hoặc `VITE_TASK_ADD_URL`. Khi xử lý vấn đề robot ở tablet cần
kiểm tra helper này và nơi gọi, thay vì mặc định giống đường gửi ICS từ backend
ở màn hình nhập operator. Xem [tích hợp robot](flows/robot.md).

## Các miền nghiệp vụ backend

| Miền | Điểm vào backend | Dữ liệu/hành vi chính cần lần theo |
| --- | --- | --- |
| Tài khoản | `modules/auth` | User, role, access summary, token và refresh |
| Kho/zone | `warehouse/warehouse_zone` | Kho, khu và các vị trí liên quan |
| Map/vị trí | `warehouse/location_map` | Map, vị trí, trạng thái ô, chi tiết tồn, import/export map và nhãn; [tính tuyến đường A*](flows/map-route.md) |
| Hàng/đơn vị/tồn | `warehouse/item`, `unit`, `item_stock` | SKU, QR, đơn vị, tồn kho, lot và quantity |
| Nhập | `warehouse/inbound_order`, `masan` | Đơn/dòng nhập, phân bổ, Excel, buffer, task robot |
| Xuất/chia chọn | `warehouse/outbound_order`, `masan` | Đơn/dòng xuất, allocation, zone CC/VT, thiếu hàng và task |
| Kiểm kê | `warehouse/stocktake` | Phiên kiểm kê, số mong muốn/thực tế; hỗ trợ vị trí trống, thêm hàng tìm thấy và xác nhận tồn — [luồng kiểm kê](flows/stocktake.md) |
| Lịch sử/thông báo/báo cáo | `transaction_history`, `notificcation`, `dashboard` | Transaction/history, cảnh báo và thống kê |
| Robot | `modules/robot` | Telemetry, RobotTask, TaskStatus và callback |

Tên `notificcation` là tên thư mục đang có trong source. Không đổi tên chỉ để
khớp cách viết thông thường khi đang làm một tác vụ khác.

## Những quy tắc cần đọc kỹ trước khi thay đổi

- `warehouse_id` và `zone_id` là các ID khác nhau. Một số tên biến/param FE hiện
  không nói đủ ý nghĩa; đọc URL và backend nhận tham số.
- Có nhiều lớp “manual/auto”: kho cấu hình manual, kiểu dòng DB, chế độ chọn ô UI.
- Lot có xử lý riêng trong `warehouse/lot_number_utils.py`, đồng thời có validation
  và hiển thị ở FE. Không thay mỗi nhãn hiển thị rồi coi như đã đổi hợp đồng dữ liệu.
- Trạng thái order/detail/location có biểu thức SQL và quan hệ; đọc model cùng service.
- Luồng xuất/chia chọn có nhiều bước và vùng hiển thị, không chỉ là một request tạo đơn.

Các quy tắc nghiệp vụ mong muốn chưa được chủ dự án chốt trong lần dựng tài liệu
này được ghi tại [questions.md](questions.md). Mô tả sâu hiện có cho
[nhập operator](flows/inbound.md), [xuất kho BE](flows/outbound.md),
[thao tác xuất kho FE](guides/outbound-fe.md) và [robot](flows/robot.md); những miền khác mới
được lập bản đồ điểm vào, chưa được xác nhận đầy đủ mọi tình huống.

## Xuất kho: tài liệu chi tiết

- [Luồng backend outbound](flows/outbound.md): tạo/import, quy tắc loại đơn,
  allocation và tồn khả dụng, gán CC, dispatch theo VT/SKU, JSON RCS, callback,
  xác nhận lượng lấy, QR/manual, return, cache và báo cáo.
- [Hướng dẫn frontend outbound](guides/outbound-fe.md): thao tác operator,
  admin và QR tablet; bảng nút → API, trạng thái và tra lỗi.
- Mốc source hiện tại: **Gọi lệnh** trên operator đã nối API dispatch;
  **Gọi robot xuất** cuối bảng và **Chia lại** trong popup CC còn handler
  console/placeholder. Không suy ra chức năng từ nhãn nút.
