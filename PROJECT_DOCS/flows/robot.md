# Robot: lệnh, phản hồi và telemetry

Mức bằng chứng: **đọc source ngày 20/10/2026**. Không gửi lệnh hoặc truy vấn robot
thật khi xây tài liệu. Địa chỉ server đang sử dụng và cấu hình process ở RCS chưa
được xác minh trong đợt này.

## Đường gửi ICS từ backend

Nguồn: [robot_service.py](../../backend/app/modules/robot/robot_service.py).

`ICS_ADD_TASK_PATH` hiện ghép `ICS_BASE_URL.rstrip('/')` với
`:7000/ics/taskOrder/addTask`. Khi cấu hình base URL cần đọc phép ghép này; không
giả định có thể đưa sẵn port/path bất kỳ vào biến mà URL kết quả vẫn đúng.

`TaskStatusService.create_robot_task` dựng JSON; `add_task` POST bằng HTTPX với
timeout 5 giây. Ví dụ minh họa lệnh nhập có chỉ định robot:

```json
{
  "orderId": "TDS_Inbound_a1b2c3d4",
  "priority": 4,
  "modelProcessCode": "<INBOUND_PROCESS_CODE>",
  "fromSystem": "Thadosoft",
  "taskOrderDetail": [
    {
      "taskPath": "MA_NGUON,MA_DICH",
      "assignRobotIds": "EE49822BAK00001"
    }
  ]
}
```

Process code lấy từ cấu hình đang nạp, không khẳng định một giá trị `.env` cụ thể.
Payload không chỉ định robot sẽ không có `assignRobotIds`. JSON chi tiết được lưu
trong `RobotTask.task_order_detail`, còn `orderId` là mã đối chiếu với callback.

HTTP error từ 5xx và lỗi kết nối tạo `IcsError` có thể retry. Task inbound có
retry tối đa 3 lần, countdown tăng theo code trong
[inbound_celery_task.py](../../backend/app/modules/warehouse/inbound_order/inbound_celery_task.py).
Hiện `add_task` kiểm tra HTTP status và đọc JSON, chưa thấy kiểm tra `code` nghiệp
vụ của JSON trước khi trả thành công; xem [questions.md](../questions.md).

## Callback trạng thái nhiệm vụ

`POST /api/v1/receive-status` ở
[robot_api.py](../../backend/app/modules/robot/robot_api.py) nhận payload, gọi
`persist_task_status` thông qua `run_logic_task`.

| Status từ ICS sau khi chuyển thành chuỗi | Trạng thái WMS |
| --- | --- |
| `6` | `in_progress` |
| `7` | `failed` |
| `3` | `cancelled` |
| `8` | `completed` |

Nguồn mapping: [robot_model.py](../../backend/app/modules/robot/robot_model.py).
Service tìm RobotTask theo `orderId`, ghi trạng thái và thực hiện cập nhật liên
quan. Với nhập completed có nhánh chuyển tồn sang vị trí đích và tạo transaction;
các trạng thái kết thúc có thể kích hoạt đợt nhập tiếp theo.

Quãng đường (`distance`, **mét**, lấy `distance_m`) được ghi trong callback bằng `_distance_m` của
[robot_service.py](../../backend/app/modules/robot/robot_service.py), dùng
`calculate_distance` theo `from_location` → `to_location` (xem [tuyến đường](map-route.md)):

- Nhập: chỉ khi `completed`, trước `_settle_inbound_stock` để được commit cùng việc chuyển tồn.
- Xuất: ở callback đầu tiên có trạng thái hợp lệ; các allocation cùng from/to trong một callback chỉ tính một lần.
- Chỉ tính khi `distance` còn `NULL`, nên callback lặp hoặc Celery retry không tính lại. Hàm không ném lỗi;
  tính thất bại thì để `NULL`, ghi log và thử lại ở callback sau.
- Sau khi bản ghi `TaskStatus` completed được commit, callback completed lặp thoát sớm vì `RobotTask.status`.

Báo cáo hiệu suất robot (`GET /api/v1/dashboard/report-robot-performance/export`,
`dashboard_service.export_robot_performance_report`, kỳ ngày/tuần):

- Đếm theo **lệnh robot** (`RobotTask.id`), không theo allocation/detail. Mỗi lệnh lấy trạng thái
  kết thúc (`3/7/8`) mới nhất trong kỳ; robot tính cho lệnh là `device_num` của trạng thái đó.
- Phân loại: có `inbound_order_detail_id` → nhập; còn lại theo allocation gắn `robot_task_id`:
  có `allocation_type="return"` → hoàn trả, có `"outbound"` → xuất. Lọc kho qua đơn nhập/xuất.
- Cột: số lệnh nhập/xuất/hoàn trả, tổng, hoàn thành (`8`) và lỗi (`3`, `7`) theo từng loại,
  **Tổng quãng đường (m)** chỉ cộng lệnh hoàn thành; lệnh xuất nhiều allocation lấy một giá trị
  `distance` (lớn nhất) cho cả lệnh.

Event realtime được phát qua
[ws_events.py](../../backend/app/socket/ws_events.py); FE invalidate query liên quan.
Không coi callback có `orderId` lạ hoặc callback lặp là cùng một tình huống với
“worker chưa gửi lệnh”; cần đối chiếu mã và trạng thái ở từng tầng.

## Telemetry robot

Luồng này phục vụ hiển thị trạng thái, tách với trạng thái nhiệm vụ đơn hàng:

- `POST /api/v1/robot_data`: nhận mảng snapshot đầy đủ, không yêu cầu JWT trong
  decorator hiện tại. `deviceCode` không được rỗng; cho phép trường bổ sung.
- `GET /api/v1/robot_data`: có `get_current_user`, trả snapshot hoặc `[]` khi
  chưa có/hết hạn; `Cache-Control: no-store`.
- Snapshot thay toàn bộ mảng, Redis key logic `robot:telemetry`; TTL theo
  `ROBOT_DATA_TTL_SECONDS`, mặc định 30 giây ở Settings. Lỗi Redis trả 503.
- FE `useRobotData` poll 5 giây khi enabled, không refetch interval trong
  background. Nhãn/trạng thái dựng từ `utils/robotStatus.ts`.
- Source hiện gọi hai robot là FL 01/FL 02. State thiếu thì dùng `deviceStatus`;
  state khác giữ nguyên tên, thiếu dữ liệu/lỗi không suy ra từ lệnh nhập.

Nguồn: [robot_schema.py](../../backend/app/modules/robot/robot_schema.py),
[robot_telemetry_service.py](../../backend/app/modules/robot/robot_telemetry_service.py),
[useRobotData.ts](../../frontend/src/hooks/useRobotData.ts),
[robotStatus.ts](../../frontend/src/utils/robotStatus.ts).

## Orchestrator của QR tablet

[sendCallerAddTasks.ts](../../frontend/src/utils/sendCallerAddTasks.ts) có đường
gửi task riêng: `VITE_TASK_ADD_URL` hoặc `/task/add-task`, payload gồm `order_id`,
`start_point`, `target_point`, `move_mode`, `metadata`.

Trong dev, Vite proxy `/task` sang localhost:6868. Đây không phải JSON ICS ở phần
đầu trang. Khi điều tra phải xác định đúng màn hình và hàm gọi thực tế. Chưa xác
minh hợp đồng/server orchestrator từ source ngoài repo.

## Điều tra lệnh không chạy

1. Xác định đúng màn hình/route và request đã gửi; lấy `detail_id`, `job_id`, `orderId` nếu có.
2. API nhận/chọn dòng nào? Có trả queued cho đợt đầu hay danh sách rỗng?
3. Worker có nhận task, hỗ trợ tham số và cùng phiên bản với API không?
4. Có log `ICS addTask request` chứa đúng URL/JSON/robot không?
5. HTTP và nội dung JSON phản hồi RCS là gì?
6. Có callback cho đúng `orderId`, mapping đúng và cập nhật DB/event không?

Các bước 1–6 là trình tự thu thập bằng chứng. Không dùng việc API trả 202 để thay
cho bước 4–6; không phát lại tất cả lệnh cũ chỉ để thử đường kết nối.
