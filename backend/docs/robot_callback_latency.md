# Độ trễ cập nhật callback robot

Ngày 30/10/2026, log cho thấy `TDS_Outbound_f6cd1147` nhận status 8 lúc
18:55:36,305 nhưng đến 18:59:49,641 mới phát `robot.task.completed` (253 giây).
PostgreSQL đồng thời có nhiều tiến trình chờ `pg_advisory_lock(827010, 1)`.

Callback, xác nhận CC, gửi lệnh thủ công và điều phối nền cùng sử dụng khóa
theo kho để bảo vệ vị trí pallet và tránh phát lệnh trùng. Trước bản sửa,
điều phối nền cũng chờ khóa như callback; mỗi status 6 tạo thêm lượt điều
phối, và callback native có thể gọi điều phối hai lần. Các truy vấn ORM tự
tải quan hệ stock/allocation làm kéo dài thời gian giữ khóa.

## Cơ chế sau bản sửa

- Callback và thao tác người dùng vẫn chờ khóa kho để xử lý đầy đủ. Điều
  phối nền dùng `pg_try_advisory_lock`, bỏ qua kho đang bận và thử lại ở
  nhịp Beat 5 giây kế tiếp. Trong cùng process, callback đã chờ được ưu tiên
  trước lượt điều phối mới.
- Chỉ một tác vụ điều phối xuất kho được chạy tại một thời điểm, thông qua
  khóa PostgreSQL riêng `(827011, 0)`. Tác vụ trùng kết thúc ngay. Khóa tự
  mất khi kết nối của worker bị đóng.
- Status 6 vẫn được lưu, nhưng không đánh thức điều phối. Status 8/7/3
  đánh thức một lần sau khi thoát khóa kho. Các wake trong 5 giây được gộp
  bằng Redis `SET NX EX`; thông điệp wake hết hạn sau 5 giây. Beat vẫn là
  nguồn thử lại khi wake thất bại hoặc lượt nền bị bỏ qua.
- Callback của task đã hoàn tất chỉ bỏ qua khóa khi cả trạng thái task và
  journal command đều là `completed`. Nếu command chưa hoàn tất, vẫn chạy
  nhánh phục hồi. Callback lặp không di chuyển hay trừ tồn lần nữa.
- Các helper đọc vị trí, stock và allocation chỉ tải quan hệ khi cần.
  Đo chỉ đọc trên cùng dữ liệu: vị trí giảm 6 xuống 1 câu SQL, stock giảm
  5 xuống 1, allocation giảm 13 xuống 1. Đây là phép đo helper, không phải
  cam kết độ trễ toàn bộ callback.
- Redis có timeout kết nối và phản hồi 5 giây. Khi giải phóng advisory
  lock, connection được rollback trước khi unlock; nếu unlock hoặc nhận
  khóa bị lỗi, connection bị invalidate để không trả khóa còn giữ về pool.

Giữ kiểm tra tồn kho, đặt chỗ tuyến đường và HTTP gửi lệnh trong cùng khóa.
Một lượt điều phối đang chạy vẫn có thể làm callback chờ đến khi phần xử
lý đó kết thúc. Cache repair vẫn nằm trong khóa để tránh ghi lại trạng thái
CC cũ sau khi người dùng đã xác nhận hoặc gán lại.

## Theo dõi và kiểm tra

Log `robot.callback` chứa `order_id`, `status`, `elapsed_ms` cho toàn bộ
phần xử lý callback trong service. Log `slow_warehouse_lock` chứa
`wait_ms`, `hold_ms`, `warehouse`, `background` khi chờ từ 1 giây hoặc giữ
khóa từ 2 giây. Trong chế độ qua Celery, thời gian chờ message trước lúc
service chạy cần đối chiếu thêm dòng `Payload` và `Processing task status`.

Chạy các kiểm thử mới từ thư mục `backend`:

```powershell
.\.venv\Scripts\python.exe -X utf8 -m unittest test.test_outbound_scheduling test.test_robot_callback_scheduling
```

Các kiểm thử dùng SQLite riêng cùng cache/ICS giả; không gửi lệnh robot.
Bộ hồi quy liên quan gồm auto native, auto dùng manual services, tiếp quản
return, xác nhận CC, khoảng cách robot và inbound dispatch/assignment.

Lượt mở rộng chạy 193 ca: 171 qua, 1 bỏ qua (cần PostgreSQL test riêng),
10 thất bại và 11 lỗi. Đã đối chiếu bằng một bản `git archive HEAD` riêng:
38 ca trong `test_outbound_remaining_quantity`, `test_completed_cc_cleanup`
và `test_robot_distance_callback` tái hiện đúng 10 thất bại và 11 lỗi đó
trước bản sửa. Các lỗi gồm expectation cũ, SQLite không bind Decimal,
Redis chưa được giả lập và test còn patch `robot_service.cache_get` đã bị
xóa trong phiên bản nền. Không có lỗi mới trong bộ kiểm thử đã chạy.

## Áp dụng trên server

Không có migration cơ sở dữ liệu hoặc thay đổi frontend. Cần áp dụng cùng
phiên bản backend cho API và toàn bộ Celery workers. Với Docker Compose
trong repo, build lại image backend và tạo lại các service dùng image đó:

```powershell
docker compose build backend
docker compose up -d --no-deps --force-recreate backend celery-worker-logic celery-worker-status celery-beat
```

Thực hiện khi không còn HTTP gửi lệnh robot đang chạy để tránh tạo lần gửi
không rõ kết quả khi worker bị dừng. Sau triển khai, theo dõi callback thật
qua hai loại log trên và thời điểm phát `robot.task.completed`.

Image cũ đã được giữ bằng tag `wms-backend:before-status8-fix-20261030`.
Image bản sửa có tag `wms-backend:status8-fix-20261030`.

## Kết quả triển khai thực tế

Đã nạp bản sửa lúc **19:25:54 ngày 30/10/2026 (UTC+7)** theo yêu cầu người
dùng. Beat được dừng trước, hai worker và API được dừng mềm để kết thúc
công việc đang chạy, sau đó tạo lại cả bốn service bằng image mới
`ec3a75040597`.

Sau khởi động: cả bốn container `running`, restart count 0; `/health` trả
`healthy`; worker logic và status đều phản hồi `pong`; Beat tiếp tục phát
lịch và các tác vụ nền hoàn tất. Snapshot kiểm tra: queue `logic` và
`status` đều 0, không có task unacked và không có tiến trình chờ khóa kho.
Các lượt điều phối xuất kho quan sát được hoàn tất khoảng 0,29–0,35 giây.

Chưa có callback robot status 8 mới trong khoảng kiểm tra sau triển khai;
cần đối chiếu log `robot.callback` khi callback thật tiếp theo đến để đo
lại độ trễ toàn luồng. Không gửi callback giả vào dữ liệu vận hành.
