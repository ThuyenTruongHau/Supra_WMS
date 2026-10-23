# Nhập kho operator

Mức bằng chứng: **đọc source ngày 20/10/2026**. Mô tả hành vi đang có, gồm cơ chế
gửi theo đợt; không kế thừa giả định từ bản tài liệu hoặc phiên làm việc trước.

## Điểm vào và màn hình

`/import` qua `RoleGatePage` dùng
[OperatorInboundPage.tsx](../../frontend/src/pages/OperatorInboundPage.tsx) với tài
khoản không phải admin. Kho đang chọn lấy từ `useAppStore`.

Page điều phối tab nguồn nhập, danh sách đơn/lệnh gọi, preview Excel, gán buffer,
xuất báo cáo, sơ đồ và các nút gọi robot. Hai tab nguồn có component xử lý riêng;
tab xuất trực tiếp dùng `DirectOutboundFromInboundBoard`.

Sơ đồ nhập dùng `INBOUND_MAP_ZONE_IDS = [2, 12]` trong page tại mốc khảo sát. Đây
là cấu hình cố định trong source, không suy ra toàn bộ kho được giới hạn vào hai zone.

## Ba ý nghĩa manual/auto

| Ý nghĩa | Nơi quyết định | Tác động |
| --- | --- | --- |
| Chọn ô trên sơ đồ operator | State `mode` trong page | Auto chọn cột; manual chọn một ô |
| Kiểu dòng nhập DB | `InboundOrderDetail.detail_type` | Ảnh hưởng nhánh thực thi trực tiếp hay robot |
| Kho manual/auto | `warehouseMode.ts`, `core/warehouse_mode.py`, Settings | Quy tắc form/lot/in theo từng phần triển khai |

Không dùng một ý nghĩa để suy ra hai ý nghĩa còn lại. Ví dụ bật manual trên sơ đồ
không thêm `inbound_type="manual"` vào request gọi robot.

## Tạo và gán dữ liệu nhập

Đọc các hàm được page gọi trong
[inboundOperator.ts](../../frontend/src/api/inboundOperator.ts) và
[masan.ts](../../frontend/src/api/masan.ts), rồi theo tới:

- [masan_api.py](../../backend/app/modules/masan/masan_api.py),
  [masan_inbound_service.py](../../backend/app/modules/masan/masan_inbound_service.py):
  parse/preview Excel, dữ liệu nhập và helper điều phối.
- [inbound_order_api.py](../../backend/app/modules/warehouse/inbound_order/inbound_order_api.py),
  [inbound_order_service.py](../../backend/app/modules/warehouse/inbound_order/inbound_order_service.py):
  đơn, dòng, phân bổ, buffer và thực thi.
- [inbound_order_model.py](../../backend/app/modules/warehouse/inbound_order/inbound_order_model.py):
  dữ liệu và biểu thức trạng thái.

Gán buffer và chọn ô gọi robot là các thao tác khác nhau. Trước thay đổi quantity,
lot hay tồn phải theo cả allocation và ItemStock, không chỉ dòng hiển thị trên FE.

## Chọn ô và gọi robot

- Auto: dùng các ID của cột đã chọn; nếu chưa chọn cột, dùng các ID lấy được từ map status.
- Manual: dùng một `selectedBufferLocationId`; chạm ô chỉ cập nhật lựa chọn.
- `Gọi robot nhập`: request không chỉ định robot.
- `Gọi robot` dropdown: dùng danh sách cố định từ
  [robotStatus.ts](../../frontend/src/utils/robotStatus.ts). Hiện source ghi nhãn
  **FL 01** (`EE49822BAK00001`) và **FL 02** (`EE49822BAK00002`).
- Chọn robot mở xác nhận; xác nhận mới gọi `invokeCallerLocations`.

Request qua [useMasanInbound.ts](../../frontend/src/hooks/useMasanInbound.ts) →
[masan.ts](../../frontend/src/api/masan.ts):

```http
POST /api/v1/masan/inbound-orders/caller
```

```json
{
  "location_ids": [101, 102],
  "assign_robot_id": "EE49822BAK00001",
  "sorting_persons": "nv_nhap_01"
}
```

ID 101/102 chỉ để minh họa. `assign_robot_id` có thể bỏ qua; schema giới hạn hai
mã robot trên. `sorting_persons` là username người nhập (operator); FE lấy từ ô
chọn trên trang đơn nhập, có thể bỏ qua. FE không gửi mode chọn ô trong request này.

## Backend chọn dòng và gửi theo đợt

Hàm `caller_masan_inbound_order` hiện:

1. Với mỗi ID nguồn, lấy dòng `initialize` có ID lớn nhất.
2. Đọc `Location.location_name`, tìm hai chữ số ở cuối; không khớp thì bỏ dòng.
3. Lấy số đó modulo 4, gom nhóm và ghép theo thứ tự nhóm `[0, 3, 2, 1]`.
4. Nếu có danh sách, gọi `_run_inbound_task` với số gửi mặc định 2.
5. Helper lưu phần còn lại và `assign_robot_id` vào Redis, key logic
   `inbound:caller_masan_inbound_order:{warehouse_id}`, TTL `-1` theo helper cache
   nghĩa là không tự hết hạn.
6. Các dòng gửi lần này được enqueue `inbound.accept_task`; response có `queued`,
   `detail_ids`, `job_ids` cho lần gửi đó.

`receive_task_status` trong
[robot_service.py](../../backend/app/modules/robot/robot_service.py), khi trạng thái
nhập được ánh xạ sang completed/cancelled/failed, đọc phần còn lại trong Redis và
gọi helper gửi thêm 1 dòng. Đây là điều phối có trạng thái, không phải enqueue
toàn bộ danh sách ngay trong request đầu.

## Tạo lệnh và hoàn tất

[inbound_celery_task.py](../../backend/app/modules/warehouse/inbound_order/inbound_celery_task.py)
nhận `detail_id`, `assign_robot_id`, gọi `execute_inbound_task`:

- Dòng DB `manual` không chỉ định robot: nhánh hoàn thành trực tiếp.
- Các trường hợp còn lại: yêu cầu nguồn/đích, tạo `RobotTask` và gọi ICS.
- `taskPath` dùng `location_code` nguồn/đích, không dùng ID DB hoặc tên hiển thị.
- Chỉ khi có robot được chỉ định mới thêm `assignRobotIds` trong phần tử
  `taskOrderDetail`.

Xem [robot.md](robot.md) về payload, callback và trạng thái. Nhận 202/queued không
phải bằng chứng robot đã thực hiện xong.

## Xem toàn kho từ trang nhập

[WarehouseViewModal.tsx](../../frontend/src/components/inbound/WarehouseViewModal.tsx)
mount map khi mở, dùng `warehouseId` hiện chọn, `readOnly`, portal `document.body`,
rộng `90vw`; body cao `calc(90vh - 120px)`. Đóng sẽ bỏ map/selection trong popup.

[WarehouseMapCanvas.tsx](../../frontend/src/components/shared/WarehouseMapCanvas.tsx)
dùng các GET map-data, locations/for-map và detail vị trí. readOnly ẩn import/download
và không mount import dialog. Quyền đọc viewer ở
[location_access.py](../../backend/app/modules/warehouse/location_map/location_access.py).

## Những điểm còn cần xác minh

Danh sách rỗng chưa có return response tường minh ở cuối dispatcher hiện tại;
cache điều phối dùng một key cho mỗi kho; hai lần gọi chồng và các callback lặp
cần được kiểm tra riêng. Đây là nhận xét từ code, chưa phải kết quả tái hiện lỗi.
Ghi nhận và các tiêu chí cần chốt nằm trong [questions.md](../questions.md).
