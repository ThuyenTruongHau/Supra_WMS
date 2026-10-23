# Đồ thị map trong RAM và API tính tuyến đường A*

Ngày bắt đầu: 23/10/2026
Trạng thái: hoàn tất (chờ chủ dự án test trên server)
Nhánh và commit bắt đầu: `masan_prd` @ `50d2dd44cbb08b193c80bc62bba84f30886fc6e1`

## Mục tiêu và ví dụ
- Người dùng cần: nạp map của mọi kho vào RAM để phân tích đường đi; tính quãng đường
  từ điểm đầu tới điểm đích qua nhiều điểm (A*); có API để test.
- Hiện tại: class mang từ dự án khác đọc MongoDB theo `area_id`, dict node/line; chưa lưu
  file và không khớp định dạng map Supra.
- Mong muốn: đọc ZIP của `warehouse_map` active, chỉ đi theo cạnh nối nhau (được qua node kệ).
- Giữ nguyên: import/export map, API map-data, dữ liệu DB.

## Phạm vi
- Được thay đổi: module `location_map`, `main.py` lifespan, test mới, PROJECT_DOCS.
- Side effect: không ghi DB, không gửi lệnh robot; lifespan chỉ SELECT `warehouse_map`.

## Quyết định đã chốt
- 23/10/2026 — Ban đầu chặn đi xuyên kệ; chủ dự án đính chính: được đi qua mọi node
  (kể cả kệ/area) miễn có cạnh nối. `avoid_shelf_transit` giữ làm tùy chọn route, mặc định tắt.
- 23/10/2026 — API `distance` theo `location_code`: quãng đường dọc cạnh tới B, fail nếu không có đường.
- 23/10/2026 — Ghi `distance` trong callback robot (`robot_service._distance_m`, nhận 2 điểm, lưu mét) thay vì lúc
  gọi robot nhập; chỉ tính khi còn NULL, không ném lỗi. Test `test.test_robot_distance_callback`.
- 23/10/2026 — `optimize_order` mặc định tắt; endpoint đặt trong router `Location_Map`.
- 23/10/2026 — Không sửa `warehouse_service.py`: class lỗi chỉ nằm trong buffer chưa lưu
  của editor; file trên đĩa khớp commit.

## Kiểm chứng
| Lệnh/thao tác | Môi trường | Kết quả quan sát | Giới hạn |
| --- | --- | --- | --- |
| `python -m unittest test.test_map_route_algo -v` | host, không DB/Redis | 15/15 đạt | API test dùng graph giả lập |
| `python -m unittest test.test_warehouse_view_access` | host | 10/10 đạt | — |
| Log uvicorn `--reload` | dev server đang chạy | nạp warehouse 1: 1257 node, 3312 cạnh | chưa gọi route trên server |

## Bàn giao phiên tiếp theo
- Đã làm: `map_route_algo.py`, `map_graph_service.py`, 3 endpoint, reload sau import, preload ở lifespan, test, docs.
- Còn lại: xác minh 26 node không có cạnh vào (xem flows/map-route.md).
- Cần triển khai: image Docker/worker không tự nhận code mới; build lại khi deploy.
