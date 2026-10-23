# Đồ thị map và tính tuyến đường (A*)

Ngày thêm: 23/10/2026. Phạm vi: tính quãng đường robot đi theo cạnh của map active.
Chỉ đọc RAM; không ghi DB, không gửi lệnh RCS/robot.

## Nguồn dữ liệu

- Bản ghi `warehouse_map` active theo `warehouse_id`; cột `source` trỏ tới ZIP trong
  `backend/app/static/warehouse_maps/warehouse_<id>/`, đọc bằng `resolve_map_zip_path`
  và `_load_compress_json` trong [location_service.py](../../backend/app/modules/warehouse/location_map/location_service.py).
- `compress/compress.json` (Roboshop): `nodeArr`/`lineArr` là mảng của mảng, tra cột
  qua `nodeKeys` (`x, y, type, content, name, ...`) và `lineKeys` (`from, to, ..., path`).
- Khóa node là `content`. Với node kệ (`type` thuộc `SHELF_NODE_TYPES` = 1, 12),
  `content` trùng `location.location_code`; `name` là nhãn hiển thị như `R17_C1_L1_BG402`.
- Tọa độ tính bằng mm. Trọng số cạnh = độ dài polyline `path`, không nhỏ hơn khoảng
  cách thẳng giữa hai node. Đồ thị có hướng, giữ đúng cạnh một chiều trong map.

## Thành phần

| File | Vai trò |
| --- | --- |
| [map_route_algo.py](../../backend/app/modules/warehouse/location_map/map_route_algo.py) | Hàm thuần: `build_graph`, `astar`, `dijkstra_distances`, `plan_route` |
| [map_graph_service.py](../../backend/app/modules/warehouse/location_map/map_graph_service.py) | `map_graph_service`: cache `WarehouseGraph` theo kho, `load_all`, `reload`, `get` |
| [location_api.py](../../backend/app/modules/warehouse/location_map/location_api.py) | Endpoint graph/route; reload sau import map |
| [main.py](../../backend/app/main.py) | `lifespan` gọi `load_all`; lỗi chỉ ghi log, `get()` sẽ nạp lại khi dùng |

Mỗi process (uvicorn worker, Celery worker) giữ bản riêng. Import map qua API chỉ
reload process nhận request; script sửa ZIP ngoài API (ví dụ `scripts/sync_map_zip_from_db.py`)
cần gọi endpoint reload hoặc restart.

## Quy tắc tuyến đường

- Chỉ đi theo cạnh nối nhau trên map, không đi tắt. Được đi qua mọi node có cạnh nối,
  kể cả node kệ/area (chốt với chủ dự án 23/10/2026).
- `avoid_shelf_transit` (route API, mặc định `false`): tùy chọn thử nghiệm, khi bật thì
  node kệ chỉ được là điểm đầu/đích của từng đoạn. API `distance` không dùng tùy chọn này.
- Heuristic A* là khoảng cách Euclid tới đích; vì trọng số không nhỏ hơn đường thẳng
  nên kết quả là đường ngắn nhất.
- `optimize_order=false` (mặc định): đi đúng thứ tự `start → waypoints → end`.
  `true`: giữ start/end, sắp lại waypoint; ma trận khoảng cách bằng Dijkstra, tối ưu
  chính xác Held-Karp khi ≤ 12 waypoint, trên mức đó dùng nearest neighbor + 2-opt.
- Điểm nhập là `content`/`location_code` hoặc `name` (không phân biệt hoa thường). Tối đa 50 waypoint.

## API

| Method | Route | Quyền | Ghi chú |
| --- | --- | --- | --- |
| GET | `/api/v1/warehouse-maps/{warehouse_id}/graph` | `map:read` (viewer kho) | Tóm tắt đồ thị đang nạp |
| POST | `/api/v1/warehouse-maps/{warehouse_id}/graph/reload` | `map:import_map` | Nạp lại từ map active |
| POST | `/api/v1/warehouse-maps/{warehouse_id}/route` | `map:read` (viewer kho) | Body `start`, `end`, `waypoints`, `optimize_order`, `avoid_shelf_transit`, `include_polyline` |
| GET | `/api/v1/warehouse-maps/{warehouse_id}/distance` | `map:read` (viewer kho) | Query `from_location_code`, `to_location_code`; service `calculate_distance` |

`distance` tra `location` active theo `warehouse_id` + `location_code`; node map là
`location_code`, nếu không có thì node trùng `map_x/map_y`. Quãng đường đi dọc các cạnh
nối liền tới B, được đi qua node kệ. Trả `distance_mm`, `distance_m`, `node_count`,
`nodes`. Lỗi: 404 không có map hoặc location (kể cả inactive), 400 location không nằm
trên map, 422 không có đường nối liền tới B.

Response route: `total_distance_mm`, `algorithm`, `visit_order`, `visit_order_names`,
`segments[]` (`from_node`, `to_node`, `distance_mm`, `nodes`), `nodes`, `polyline`
(cùng hệ tọa độ `map-data`), `expanded_nodes`, `elapsed_ms`.
Lỗi: 404 không có map/nạp lỗi, 400 điểm không có hoặc quá số waypoint, 422 không có đường.

## Hiện trạng map warehouse 1 (đọc ZIP ngày 23/10/2026)

File `1_c05addb9...`: 1257 node, 3312 cạnh, 14 cạnh một chiều, 479 node kệ.
- 26 node không có cạnh đi vào (CC10–CC29 và một số ô G như `R16_C11_L1_BG051`): luôn
  báo không có đường (422). Cần xác minh với map editor đây là thiết kế hay thiếu cạnh.
- Mọi node còn lại tới được từ hành lang khi cho đi qua node kệ.
