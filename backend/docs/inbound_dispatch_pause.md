# Dừng và tiếp tục gửi robot nhập theo kho

Nút **Dừng phiên** ngăn mọi đường gọi nhập phát thêm lệnh RCS trong kho.
Lệnh RCS đã nhận tiếp tục chạy. Callback vẫn cập nhật đơn, vị trí và tồn kho.
**Tiếp tục phiên** giữ đợt, thứ tự, người nhập và robot đã chọn; không bổ sung
hàng mới phát sinh vào đợt cũ. RCS vẫn là bên phân công robot khi đang có việc xuất.

Giao diện hiển thị riêng lệnh đã phát và lệnh còn chờ. “Đã ngừng gửi” không có
nghĩa robot đã rảnh. Trong khi request gửi RCS đang diễn ra, thao tác dừng chờ
request đó kết thúc; chỉ sau khi API dừng thành công mới xác nhận không gửi thêm.

## API

Prefix `/api/v1/masan/inbound-orders/auto-dispatch`:

| Method | Đường dẫn | Quyền |
| --- | --- | --- |
| GET | `/status?warehouse_id=1` | `inbound:read` và truy cập kho |
| POST | `/pause` | `inbound:update` và truy cập kho |
| POST | `/resume` | `inbound:update` và truy cập kho |
| POST | `/commands/{id}/verify-unsent` | `inbound:update` và truy cập kho |

Pause/resume nhận `{ "warehouse_id": 1 }`; gọi lặp không phát thêm lệnh.
Status gồm `enabled`, `state`, `batch_id`, `batch_code`, `waiting_count`,
`issued_count`, `review_count`, robot, người nhập, người/thời điểm thay đổi và
`problems`. Trạng thái là `idle`, `running`, `paused`, `needs_review`.

Caller cũ giữ `queued`, `detail_ids`, `job_ids` cho lượt đầu; bổ sung `batch_id`
và `waiting_count` cho toàn bộ đợt được tiếp nhận. Đợt đang mở hoặc kho đang dừng
trả HTTP 409. Các API nhận việc trực tiếp cũng trả 409 khi đang dừng.

## Lưu trữ và phục hồi

Ba bảng `inbound_dispatch_control`, `inbound_dispatch_batch`,
`inbound_dispatch_command` giữ trạng thái qua restart. Mỗi kho có tối đa một đợt
chưa kết thúc. Lệnh có thứ tự cố định và token đặt chỗ; job cũ/lặp không được
gửi lại. Khóa advisory PostgreSQL namespace `103001` tồn tại qua commit và bao
trọn request HTTP; thứ tự khóa là gate kho → detail → guard gửi robot hiện có.
Callback commit giao dịch detail trước khi cập nhật điều phối.

Tổng lệnh giữ chỗ, đang gửi, đã nhận chưa kết thúc hoặc chưa rõ kết quả tối đa 2.
Beat chạy mỗi 5 giây và tín hiệu đánh thức giúp khôi phục khi mất broker.
Đặt chỗ chưa được xử lý được publish lại sau 60 giây bằng cùng token. Worker
luôn đọc database trước khi gửi. Pause trả đặt chỗ về chờ và vô hiệu token cũ.

Mã `order_id` và `RobotTask` được commit trước HTTP. Timeout hoặc tiến trình
chết sau dấu `sending` chuyển thành `unknown`, dừng kho và không tự retry HTTP.
Callback RCS hợp lệ có thể giải quyết trạng thái này nhưng không tự bật kho.
Nếu đã đối chiếu RCS xác nhận **chưa nhận lệnh**, người có quyền xác minh qua
giao diện/API với ghi chú bắt buộc. Việc xác minh giữ nguyên mã lệnh, ghi người
xác minh, không tự gửi; vẫn cần bấm Tiếp tục. Không xác minh khi đã có tiến độ.

## Triển khai

1. Build image backend mới trước khi chuyển dịch vụ. Không thử gọi lệnh thật.
2. Dừng Beat, worker logic và worker callback theo warm shutdown; tạm ngừng API
   cũ để tránh gửi bằng code cũ trong lúc đổi phiên bản. Không purge queue.
3. Áp dụng migration `a83001in0001`. Migration tạo switch **đang dừng** cho mọi
   kho hiện có; không kết nối RCS và không xóa bảng/lệnh nghiệp vụ.
4. Chạy `status` bằng code mới cho từng kho để chuyển Redis
   `inbound:caller_masan_inbound_order:{warehouse_id}` sang DB, giữ thứ tự và
   robot. Chỉ xóa key cũ sau khi transaction nhập đã commit. Nếu Redis lỗi, giữ
   kho dừng và thử lại sau. Những lệnh cũ `issued/in_progress` được nhận diện để
   tính số đã phát. Broker message cũ chưa gửi được giữ lại khi worker chạy.
5. Chạy API, worker logic, worker callback, Beat cùng image mới; tải lại FE.
   Chỉ đọc status để kiểm tra; để kho dừng cho người vận hành chủ động tiếp tục.

Không rollback khi còn command chưa kết thúc; migration downgrade từ chối
trường hợp này. Không dừng worker dùng chung để thực hiện thao tác pause thường
ngày, vì cùng worker còn xử lý xuất hàng.

## Kiểm thử cô lập

```powershell
cd backend
.venv/Scripts/python.exe -m unittest test.test_inbound_dispatch test.test_inbound_robot_assignment -q
```

Có thể đặt `INBOUND_DISPATCH_TEST_URL` trỏ tới PostgreSQL thử nghiệm có database
tên đúng `inbound_dispatch_test`. Bộ kiểm thử tạo/xóa schema riêng cho từng test;
không cho dùng tên database khác. RCS, broker và Redis đều được giả lập.

Browser: chạy Vite ở `https://127.0.0.1:5187`, rồi chạy
`backend/.venv/Scripts/python.exe frontend/tests/inboundDispatchBrowser.py -q`.
Mọi HTTP API và websocket đều bị chặn/giả lập, gồm các thao tác ghi.

## Kết quả triển khai ngày 30/10/2026

- Đã áp dụng `a83001in0001` và tạo lại API, worker logic, worker callback, Beat
  bằng cùng image. FE Vite tại cổng 5173 phục vụ giao diện mới.
- Đối soát sau triển khai: kho 1 `paused`, chờ 0, đã phát 0, cần đối soát 0;
  bảng command nhập chưa có dòng nào. Không bật nhập hoặc phát lệnh thử RCS.
- 27 kiểm thử nhập/API/tương thích trên PostgreSQL cô lập và 30 kiểm thử tự động
  xuất thành công; 4 kiểm thử browser giả lập thành công. Build Vite và ESLint
  các file frontend mới thành công.
- Bộ `test_outbound_remaining_quantity` còn 11 lỗi; cùng 11 trường hợp tái hiện
  trên bản HEAD chưa sửa trong thư mục cô lập. TypeScript toàn dự án cũng còn
  lỗi ở các file hiện có; không có lỗi báo ở file mới của tính năng này.
