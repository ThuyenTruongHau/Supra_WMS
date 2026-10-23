# Sửa phần còn thiếu sau lệnh xuất lỗi hoặc xuất một phần

Ngày bắt đầu: 21/10/2026. Trạng thái: **đã sửa code, kiểm thử và cập nhật worker
logic**. Để gọi lại 12 còn thiếu cần người dùng cập nhật tồn thực tế tại G417
sau kiểm kê. Chưa có câu trả lời về mã đơn hôm qua/số lượng thực tế lệch.

## Dữ liệu đã đối chiếu, chỉ đọc DB thật

SKU `02XX00200`, đơn `OUT-20261021-074406` (29): nhu cầu gốc trong History 1810
và quantity hiện tại cùng là **19**. Đã completed **7** tại Locator G420; còn
**12** trên detail `653,656,669,673` có allocation `570,571,573,575` failed.
Các allocation này đã được reset khi clear VT14 theo yêu cầu trước. Stock 317
vẫn inactive sau clear; không tự phục hồi tồn hoặc phát lại lệnh robot.

Ba đơn ngày 20/10 có số lượng gốc / completed lần lượt **5/5, 20/20, 3/3**.
Đã hỏi người dùng đơn hôm qua cụ thể và số thực tế lệch; chưa kết luận dữ liệu
completed đồng nghĩa đã kiểm chứng lượng giao hàng vật lý.

## Vấn đề trong code

- Tổng allocated của detail và validation/lacked vẫn tính allocation failed,
  cancelled; status detail vì thế không trở về trạng thái có thể gọi lại.
- Masan dispatch và assign CC chỉ lấy detail initialize; dòng đã xử lý một
  phần không được gọi bổ sung đúng phần còn lại.
- Nhu cầu sorting cộng quantity gốc; nhánh Locator cấp full detail quantity,
  so với stock.quantity từng dòng và có thể chọn stock inactive.
- Không tìm được task để gửi có thể trả None, sau đó API báo thành công giả.

## Phạm vi sửa

- Thống nhất quantity/trạng thái sau failed/cancelled, giữ lượng completed và
  các allocation còn hiệu lực để tránh cấp trùng.
- Assign, danh sách nhu cầu và dispatch dùng phần chưa được phân bổ, hỗ trợ
  retry/partial; Locator vẫn là ràng buộc vị trí, không tự đổi ô lấy hàng.
- Chặn dùng stock inactive, sai kho hoặc đã hết khả dụng; báo lỗi khi không
  thực sự có task để gửi.
- Regression test dùng SQLite in-memory, cache và RCS giả lập. Không chạy test
  ghi DB thật hoặc gửi RCS. Giữ thay đổi timestamp của người dùng đã có trong
  masan_outbound_service.py.

## Bàn giao

### Thay đổi đã làm

- Model có `unallocated_quantity` SQL property, bỏ failed/cancelled khỏi lượng
  đáp ứng. Failed outbound có thể retry; failed return vẫn giữ trạng thái cần
  xử lý, cancelled return không chặn hoàn tất. Không cần migration.
- Lacked xét cả detail chưa có allocation. Stock khả dụng không giữ chỗ cho
  cancelled outbound, và lượng cả vị trí không gồm stock inactive.
- Assign CC và sorting-needed dùng lượng chưa phân bổ. Dispatch hỗ trợ detail
  đã xuất một phần, khóa detail/location/stock và đọc lại lượng sau khi khóa.
- Locator tìm name hoặc code, đúng kho/active, chỉ lấy stock khả dụng; dùng
  greedy allocator thay cấp nguyên quantity gốc từng dòng. Không tự đổi Locator.
- Không có task thực gửi trả 400, kể cả worker cũ trả None. FE lọc return cho
  retry thành công mà không bị attempt lỗi cũ chặn; return chỉ có failed mà
  chưa có outbound completed vẫn bị chặn.
- Thêm `.recovery` vào `.dockerignore`; đã xác nhận backup dữ liệu thật không
  đi vào image. Giữ nguyên thay đổi timestamp của người dùng trong service.

### Kiểm chứng

| Kiểm tra | Kết quả / giới hạn |
| --- | --- |
| Backend unittest mới + parse Excel cũ | **17/17 đạt**, SQLite in-memory/cache fake/ICS fake, không ghi DB thật |
| Cùng 17 test chạy trong image Docker mới với `--network none` | **17/17 đạt** |
| FE test outbound return | **5/5 đạt**, bao gồm không gọi return khi chỉ có failed |
| FE test robot | **8/8 đạt** |
| FE build | **Đạt**, còn cảnh báo kích thước bundle |
| ORM mới trên DB thật, transaction READ ONLY | Đơn 29 còn đúng **12**, các đơn 26/27/28 còn **0** |
| CC được worker gán lại và đọc nhu cầu bằng service mới | Tổng **12**: **7 ở Zone_CC_01**, **5 ở Zone_CC_02** |
| Vị trí G417 lúc kiểm tra | Không có stock active của SKU 02XX00200; không tự phục hồi tồn sau clear |
| PostgreSQL concurrency / gửi robot thật | Chưa chạy kiểm thử đồng thời hoặc phát lệnh robot để thử |

### Môi trường đang áp dụng

- Host Uvicorn cổng 8001 có `--reload`, backend `.env` cấu hình DEBUG true.
- Đã kiểm tra active/reserved/scheduled bằng Celery inspect: **0** trước đổi.
- Worker logic cũ được lưu rollback:
  `wms-backend:pre-remaining-logic-7bfa7a181883`.
- Build image backend thành công. Image hiện dùng bởi worker logic:
  `sha256:da57b08cd642f5a738a4ff9a1fc1474e476301b61b4f184d5a5066f00762b64e`.
- Đã recreate **riêng celery-worker-logic**; inspect trả pong, source hash của
  Masan service khớp host, property unallocated_quantity đã có. Beat đã tự gán
  lại các detail cần retry; không gọi API dispatch hoặc gửi RCS để kiểm thử.
- Worker status/beat giữ nguyên container đang chạy. Một số image/layer cũ
  bị thiếu trong Docker store: tag/commit rollback cho status/beat gặp lỗi
  `No such image` / `content digest ... not found`. Không restart hai dịch vụ
  này trong tình trạng chưa có rollback. Không phải lỗi kiểm thử code.

### Cách tiếp tục vận hành

1. Kiểm kê và cập nhật tồn thật đúng SKU/lot tại **G417**, hoặc chốt nghiệp vụ
   thay Locator riêng; không giả lập quantity 88 đã clear là còn trong kho.
2. Tải lại trang, xem hai khu CC: hiện **7** cần gọi tại khu 1, **5** tại khu 2.
   Gọi lần lượt theo khu/VT cần dùng; không hiểu một lần gọi ở một khu là toàn
   bộ 12 của cả kho.
3. Theo dõi task/callback/xác nhận thực lấy. Không gọi lại phần completed 7.
4. Đối chiếu tiếp đơn hôm qua khi người dùng cung cấp mã đơn và số thực tế:
   5/5, 20/20, 3/3 hiện chỉ là bằng chứng dữ liệu DB khớp import, không chứng
   minh đã giao đủ hàng thực tế.

Không sửa quantity gốc của đơn, không thay trạng thái allocation cũ hoặc nhập
lại tồn trên DB thật trong tác vụ sửa code này. Các hồ sơ clear VT13/VT14 vẫn
được giữ để phân biệt với việc tính lại phần còn thiếu.
