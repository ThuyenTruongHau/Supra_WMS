# Tìm đúng file để sửa

Mức bằng chứng: đọc các entrypoint và những điểm nối chính trong code ngày
20/10/2026. Trang này giải thích vai trò; chỉ mục tự sinh liệt kê toàn bộ file
trong phạm vi quét, kể cả file chưa được route/import sử dụng.

## Thư mục

| Đường dẫn | Nội dung và khi nào cần đọc |
| --- | --- |
| `frontend/src/pages` | Các màn hình theo route; bắt đầu từ đây khi sửa hành vi màn hình |
| `frontend/src/components` | Khối UI, dialog, bản đồ, bảng và layout dùng lại |
| `frontend/src/api` | URL, request/response HTTP; xem trước khi đổi hợp đồng API |
| `frontend/src/hooks` | Lấy dữ liệu, mutation, query key, websocket và nghiệp vụ FE được tách ra |
| `frontend/src/store` | Phiên đăng nhập, kho và trạng thái dùng chung |
| `frontend/src/types` | Kiểu dữ liệu FE; đối chiếu với schema backend |
| `frontend/src/utils` | Chuyển đổi dữ liệu, render map, export/in, helper nghiệp vụ |
| `frontend/src/constants`, `config` | Cấu hình zone, kích thước operator, chế độ kho |
| `frontend/src/data` | Dữ liệu/metadata, bao gồm các file có tên mock; đọc nơi sử dụng để xác định vai trò thực tế |
| `backend/app/core` | Hạ tầng ứng dụng và dependency |
| `backend/app/modules/auth` | Đăng nhập, user, role, access summary |
| `backend/app/modules/warehouse` | Các miền quản lý kho |
| `backend/app/modules/masan` | Excel và các luồng nghiệp vụ Masan nhập/xuất/chia chọn |
| `backend/app/modules/robot` | Gửi ICS, telemetry và callback |
| `backend/app/socket` | WebSocket, event và phát qua Redis |
| `backend/alembic` | Migration; cần đối chiếu khi đổi model/schema DB |
| `backend/test`, `backend/tests`, `frontend/tests` | Các nhóm kiểm thử hiện có; cách chạy không hoàn toàn giống nhau |
| `opt/monitoring` | Cấu hình Prometheus/Grafana; không khẳng định dịch vụ đang chạy |
| `linhtinh` | Tệp phụ trợ ngoài các entrypoint ứng dụng đã khảo sát; không mặc định là cấu hình đang được sử dụng |

Các thư mục dữ liệu tĩnh, file Excel/ZIP/PDF, asset, log và môi trường ảo không
được diễn giải như source nghiệp vụ trong chỉ mục.

## Những file cần nhớ

| File | Vai trò cụ thể |
| --- | --- |
| [frontend/src/routes/index.tsx](../frontend/src/routes/index.tsx) | Route và màn hình admin/operator/QR tablet |
| [frontend/src/App.tsx](../frontend/src/App.tsx) | React Query, BrowserRouter, khởi tạo phiên |
| [frontend/src/api/axiosInstance.ts](../frontend/src/api/axiosInstance.ts) | Base URL, token, refresh, multipart và timeout chung |
| [frontend/src/store/useAuthStore.ts](../frontend/src/store/useAuthStore.ts) | Trạng thái phiên và thông tin user/access |
| [frontend/src/store/useAppStore.ts](../frontend/src/store/useAppStore.ts) | Kho đang chọn và chế độ nhập/xuất |
| [frontend/src/config/warehouseMode.ts](../frontend/src/config/warehouseMode.ts) | Chế độ kho theo biến VITE và quy tắc in/lot liên quan |
| [frontend/src/components/layout/MainLayout.tsx](../frontend/src/components/layout/MainLayout.tsx) | Chọn shell admin/operator |
| [frontend/src/components/layout/UserLayout.tsx](../frontend/src/components/layout/UserLayout.tsx) | Bố cục operator, bao gồm cơ chế stage/tablet |
| [frontend/src/pages/OperatorInboundPage.tsx](../frontend/src/pages/OperatorInboundPage.tsx) | Điều phối màn hình nhập operator, chọn ô, preview, gọi robot |
| [frontend/src/components/warehouse/OperatorMapCanvas.tsx](../frontend/src/components/warehouse/OperatorMapCanvas.tsx) | Vẽ và xử lý tương tác sơ đồ operator |
| [frontend/src/components/shared/WarehouseMapCanvas.tsx](../frontend/src/components/shared/WarehouseMapCanvas.tsx) | Map kho tổng quát, zoom/pan/drawer/import/export và readOnly |
| [frontend/src/components/inbound/WarehouseViewModal.tsx](../frontend/src/components/inbound/WarehouseViewModal.tsx) | Popup viewer dùng map readOnly, portal vào body |
| [frontend/src/components/inbound/AssignedRobotCallButton.tsx](../frontend/src/components/inbound/AssignedRobotCallButton.tsx) | Dropdown chọn robot cho lệnh nhập |
| [frontend/src/utils/robotStatus.ts](../frontend/src/utils/robotStatus.ts) | Danh sách robot cố định và ánh xạ trạng thái hiển thị |
| [frontend/src/constants/outboundMapZones.ts](../frontend/src/constants/outboundMapZones.ts) | Ánh xạ vùng hiển thị và zone cho luồng xuất/chia chọn |
| [frontend/src/utils/sendCallerAddTasks.ts](../frontend/src/utils/sendCallerAddTasks.ts) | Payload và gửi task sang orchestrator trong luồng QR tablet |
| [backend/app/main.py](../backend/app/main.py) | FastAPI, đăng ký router, vòng đời và metrics |
| [backend/app/core/config.py](../backend/app/core/config.py) | Schema và cách đọc settings |
| [backend/app/core/database.py](../backend/app/core/database.py) | Engine và session DB |
| [backend/app/core/cache.py](../backend/app/core/cache.py) | Redis, prefix, serialization và TTL |
| [backend/app/core/dependencies.py](../backend/app/core/dependencies.py) | Xác thực/quyền và helper tích hợp |
| [backend/app/core/celery_app.py](../backend/app/core/celery_app.py) | Queue, routing, beat và helper thực thi |
| [backend/app/modules/masan/masan_inbound_service.py](../backend/app/modules/masan/masan_inbound_service.py) | Import/preview/dữ liệu nhập Masan và điều phối đợt gọi robot |
| [backend/app/modules/warehouse/inbound_order/inbound_order_service.py](../backend/app/modules/warehouse/inbound_order/inbound_order_service.py) | Nghiệp vụ đơn nhập, allocation và tạo task nhập |
| [backend/app/modules/warehouse/outbound_order/outbound_order_service.py](../backend/app/modules/warehouse/outbound_order/outbound_order_service.py) | Tạo/sửa/xóa xuất, chọn tồn, allocation, execute, settle và QR |
| [backend/app/modules/masan/masan_outbound_service.py](../backend/app/modules/masan/masan_outbound_service.py) | BM.04, gán CC, nhu cầu SKU, dispatch VT, pending-stock và xác nhận |
| [backend/app/modules/masan/masan_sorting_return_service.py](../backend/app/modules/masan/masan_sorting_return_service.py) | Lệnh return sẵn sàng theo kho/VT và tồn, độc lập assignment CC |
| [backend/app/modules/masan/masan_picking_list_service.py](../backend/app/modules/masan/masan_picking_list_service.py) | Lượt in extracted và PDF picking list theo xe/CC |
| [backend/app/modules/robot/robot_service.py](../backend/app/modules/robot/robot_service.py) | Gửi ICS, nhận trạng thái và cập nhật luồng liên quan |
| [backend/app/modules/robot/robot_telemetry_service.py](../backend/app/modules/robot/robot_telemetry_service.py) | Snapshot telemetry Redis có TTL |
| [backend/app/modules/warehouse/location_map/location_service.py](../backend/app/modules/warehouse/location_map/location_service.py) | Đọc/nhập map, vị trí, chi tiết tồn và in nhãn vị trí |
| [backend/app/modules/warehouse/location_map/location_access.py](../backend/app/modules/warehouse/location_map/location_access.py) | Quyền đọc viewer kho dành cho inbound |
| [backend/app/modules/warehouse/location_map/map_graph_service.py](../backend/app/modules/warehouse/location_map/map_graph_service.py) | Đồ thị map trong RAM theo kho; [luồng tuyến đường](flows/map-route.md) |
| [backend/app/modules/warehouse/location_map/map_route_algo.py](../backend/app/modules/warehouse/location_map/map_route_algo.py) | A*, Dijkstra, sắp thứ tự waypoint (hàm thuần) |
| [backend/app/socket/ws_events.py](../backend/app/socket/ws_events.py) | Payload event và publish Redis |
| [backend/app/socket/ws_manager.py](../backend/app/socket/ws_manager.py) | Quản lý kết nối và broadcast |

## Chọn điểm vào theo việc

| Việc cần làm | Bắt đầu từ | Tiếp tục kiểm tra |
| --- | --- | --- |
| Sửa form/bảng nhập admin | `pages/ImportPage.tsx`, `ImportDetailPage.tsx` | `api/inboundOrder.ts`, module `warehouse/inbound_order` |
| Sửa nhập operator | `OperatorInboundPage.tsx` | `api/inboundOperator.ts`, `api/masan.ts`, hai service nhập ở trên |
| Sửa gọi robot nhập | `useMasanInbound.ts`, `AssignedRobotCallButton.tsx` | `masan_api.py`, dispatcher Masan, Celery inbound và `robot_service.py` |
| Sửa hiển thị trạng thái robot | `useRobotData.ts`, `robotStatus.ts` | `api/robot.ts`, `robot_api.py`, telemetry service |
| Sửa xuất/chia chọn | `OperatorOutboundPage.tsx`, `OperatorOutboundDetailPage.tsx`, `OperatorSortingWavePage.tsx` | `api/masan.ts`, `api/masanOutbound.ts`, `api/outbound*.ts`, module Masan/outbound |
| Sửa kiểm kê | `StocktakePage.tsx`, `StocktakeDetailPage.tsx`, trang QR tablet tương ứng | `api/stocktake.ts`, module `warehouse/stocktake` |
| Sửa user/quyền | `UserSettingPage.tsx`, `useAuthStore.ts`, route/layout | module `auth`, dependency của từng endpoint |
| Sửa dữ liệu không tự cập nhật | hooks WebSocket, realtime bridge, query keys | `socket`, publish event và service phát event |

Các đường dẫn ngắn trong hai bảng trên nằm dưới `frontend/src/` nếu có đuôi
`.ts/.tsx`; tên module backend nằm dưới `backend/app/modules/`.

## Tra toàn bộ file và API

Với xuất kho, đọc [luồng BE](flows/outbound.md) và
[thao tác FE](guides/outbound-fe.md) để nối tên nút với request/service trước khi
chọn file sửa. Các page admin, operator và QR tablet có đường thao tác khác nhau.

- [Backend](index/backend.md): file Python, nhóm vai trò và tên hàm/lớp cấp module.
- [Frontend](index/frontend.md): file TS/TSX/JS/CSS, nhóm vai trò và khai báo nhận diện được.
- [HTTP/WebSocket](index/api.md): route ghép với prefix từ `main.py`, handler và source.

Nguồn sinh: [scripts/build_code_index.py](../scripts/build_code_index.py). Chỉ mục
không sao chép docstring hoặc diễn giải logic từng hàm bằng suy đoán.
