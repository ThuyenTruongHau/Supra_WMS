# Giao lệnh nhập kho cho robot cụ thể

Trên `/import` của operator, nút **Gọi robot** mở danh sách:

| Tên hiển thị | Mã RCS |
| --- | --- |
| FL 01 | EE49822BAK00001 |
| FL 02 | EE49822BAK00002 |

Chọn robot và xác nhận để gửi lệnh cho các ô theo chế độ đang chọn:

- Tự động: cột đã chọn, hoặc tất cả ô buffer nhập nếu chưa chọn cột.
- Thủ công: một ô đã chọn. Chạm ô chỉ chọn ô; gửi lệnh qua nút gọi robot.

Nút **Gọi robot nhập** hiện có tiếp tục gửi lệnh không chỉ định robot.

## Request tới WMS

`POST /api/v1/masan/inbound-orders/caller`

```json
{
  "location_ids": [101],
  "assign_robot_id": "EE49822BAK00001"
}
```

`assign_robot_id` là tùy chọn và chỉ nhận hai mã trên. Bỏ trường này để dùng
hành vi hiện có; mã khác hoặc chuỗi rỗng trả 422 trước khi tạo job.

Backend lấy một dòng `initialize` cho mỗi ô (hiện sắp xếp ID giảm dần), bỏ qua
ô không có dòng chờ, và truyền mã robot qua job Celery `inbound.accept_task`.

## Payload tới RCS

```json
{
  "orderId": "TDS_Inbound_a1b2c3d4",
  "priority": 4,
  "modelProcessCode": "Supra_to_storage",
  "fromSystem": "Thadosoft",
  "taskOrderDetail": [
    {
      "taskPath": "MA_O_NGUON,MA_O_DICH",
      "assignRobotIds": "EE49822BAK00001"
    }
  ]
}
```

`modelProcessCode` lấy từ `INBOUND_PROCESS_CODE`; `taskPath` lấy từ
`location_code` của nguồn và đích. `assignRobotIds` được lưu trong JSON
`task_order_detail` hiện có, không cần migration. Lệnh không chỉ định robot
không có trường `assignRobotIds`.

Chế độ Thủ công trên FE quyết định cách chọn ô. Khi chỉ định robot, backend
tạo lệnh RCS kể cả khi dòng có `detail_type="manual"`. Nếu không chỉ định robot,
các dòng `manual` vẫn giữ luồng hoàn thành trực tiếp hiện có.

Khi áp dụng thay đổi, khởi động lại backend và worker Celery xử lý queue logic
để worker nhận tham số `assign_robot_id` mới, rồi tải lại frontend.

Nếu worker chạy Docker, code nằm trong image; chỉ restart container không lấy
code mới. Từ thư mục gốc dự án, build image và tạo lại riêng worker logic:

```powershell
docker compose build backend
docker compose up -d --no-deps --force-recreate celery-worker-logic
```

Worker ghi `detail_id`, `assign_robot_id`, `job_id`; log `ICS addTask request`
ghi `order_id`, URL và toàn bộ JSON gửi RCS. Log response hoặc lỗi HTTP/kết nối
dùng cùng `order_id` để đối chiếu. API trả 202 nghĩa là đã tiếp nhận vào hàng đợi.
