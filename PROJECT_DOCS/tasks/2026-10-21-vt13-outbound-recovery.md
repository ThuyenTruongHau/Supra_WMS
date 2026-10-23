# Giải phóng dữ liệu kẹt VT13 của phiên xuất mới nhất

Ngày xử lý: **21/10/2026**, Asia/Saigon. Trạng thái: **đã xử lý dữ liệu và kiểm
tra lại trên DB thật**. Không thay đổi code nghiệp vụ trong tác vụ này.

Cập nhật mới nhất: người dùng yêu cầu **clear hết VT13** để tự kiểm kê và cập
nhật lại. Đã xử lý tiếp lúc **10:31 ngày 21/10/2026**: VT13 không còn stock
active, tổng tồn active **0**, không còn allocation/chi tiết nhập chờ xử lý.
Các số liệu giữ lại 1 đơn vị bên dưới mô tả lần xử lý đầu; xem cập nhật cuối trang.

## Phạm vi ban đầu người dùng đã chốt

- Chỉ phần dữ liệu bị kẹt tại VT13 trong phiên mới nhất; không reset toàn phiên.
- Phiên: `OUT-20261021-074406`, `outbound_order.id=29`, kho `1`.
- VT13: `location.id=3447`, mã `10002606`, zone DB `9 / Zone_sorting_2`.
- Người dùng sẽ kiểm kê lại; không giả lập xuất thành công hay tự gửi lệnh robot.

## Bằng chứng trước khi sửa

| Dữ liệu | Trạng thái quan sát |
| --- | --- |
| Stock `367`, SKU `02XX00322` | Tại VT13, active, quantity `198` |
| Allocation `530,531,533,534,535,536,537,538` | Đều thuộc đơn 29, stock 367, đích VT13, outbound, status `confirmed` |
| Quantity 8 allocation | `12 + 40 + 32 + 32 + 30 + 2 + 30 + 26 = 204`, vượt tồn stock 367 là `6` |
| Locator của 8 detail | `G339` |
| Robot task `1065 / TDS_Outbound_c7808534` | Quantity `198`, path `10000813,10002606`, callback cuối `8` |
| Stock `437`, SKU `02XX00214` | Active, quantity `1` tại VT13; 4 allocation của đơn 29 đã completed tổng `25`, task quantity `26` |
| Redis cache outbound | `0` key, kể cả khi tìm trên mọi prefix trong Redis DB 0 |
| Toàn phiên 29 | `60` detail, `77` allocation; không xóa các dòng khác |

Đã đối chiếu cấu hình worker đang chạy: cùng DB `masan_wms` và Redis DB 0 trên
server của dự án, prefix `wms`. Không ghi connection string/mật khẩu vào tài liệu.

Log `backend/logs/main/Warehouse Management System_20261021.log` có request
addTask `TDS_Outbound_c7808534` lúc **07:49:15**, RCS trả `code=1000` và có các
callback cho task này. DB giữ callback cuối `8`; lỗi kẹt này không phải do lệnh
chưa được RCS tiếp nhận.

## Phân tích nguyên nhân

1. **Gán lượng vượt tồn trong nhánh Locator.**
   [sending_masan_outbound_task](../../backend/app/modules/masan/masan_outbound_service.py)
   chọn stock bằng `ItemStock.quantity >= detail.quantity` cho từng detail,
   chưa trừ lượng đã giữ ở các dòng trước. Từng lượng 12/40/32/... đều nhỏ hơn
   198, nhưng gộp lại 204 vẫn có thể được gán vào cùng stock 367. Nhánh này
   không dùng phân bổ theo `available_quantity` như calculate thông thường.
2. **Xác nhận có commit trước bước settle.**
   `confirm_allocation_outbound` ghi `confirmed` và commit từng allocation,
   rồi mới gọi `_settle_outbound_stock` để trừ tồn cả nhóm. Với tổng 204 trên tồn
   198, bước trừ cả nhóm không thể hoàn tất. Các commit confirmed trước đó
   không được rollback cùng bước settle. Đây là đường đi trong source phù hợp
   với trạng thái DB quan sát được: confirmed nhưng tồn vẫn 198. Chưa tìm thấy
   traceback/HTTP access log của chính lần confirm trong các file log đã đọc.
3. **Clear station chỉ dọn Redis.**
   [clear_outbound_station_cache](../../backend/app/modules/masan/masan_oubound_auto_service.py)
   không sửa `item_stock` hay allocation. Redis hiện đã hết dữ liệu outbound,
   nhưng stock active 198 và các allocation confirmed vẫn ở DB nên clear cache
   thêm không làm biến mất phần tồn này.

Ngoài ra, điều kiện `status not in [...]` trong confirm là Python expression,
không phải SQL `.notin_(...)`; cần sửa khi xử lý transaction/cleanup nghiệp vụ.
Đây là vấn đề code riêng, không phải thay đổi đã triển khai trong tác vụ này.

## Thao tác đã thực hiện

Đã chạy dry-run, kiểm tra lại điều kiện trước khi commit trong một transaction:

- 8 allocation trên chuyển **confirmed → failed** để giải phóng giữ chỗ; không
  đánh dấu completed hoặc tự trừ 204 vào tồn 198.
- Stock **367** chuyển `is_active=false`, giữ nguyên quantity lịch sử **198**
  và các metadata để truy vết/khôi phục. Bản ghi này không còn thuộc tồn active
  để dùng cho đợt kiểm kê mới.
- Ghi **History 1881** cho đơn 29, mô tả rõ đây là bảo trì theo yêu cầu người
  dùng để kiểm kê, executor Codex. `created_by_id` ghi theo owner của đơn do
  schema bắt buộc; metadata phân biệt owner và executor bảo trì.
- Không xóa đơn/detail/RobotTask/TaskStatus, không tạo transaction xuất giả,
  không gọi RCS và không restart dịch vụ.
- Không có key cache liên quan cần xóa.

Bản sao trước thay đổi nằm tại
`backend/.recovery/vt13_order29_before_20261021T032453881568Z.json`.
Thời điểm snapshot **10:24:53 +07:00**. Thư mục `.recovery` được ignore để không
đưa dữ liệu đơn hàng thực vào Git. Script phục hồi có điều kiện bảo vệ, dry-run
mặc định, nằm cùng thư mục: `clear_vt13_order29.py`. Không chạy lại `--commit`
trên dữ liệu đã đổi; cần đọc snapshot và đối chiếu hiện trạng trước mọi khôi phục.

## Kiểm chứng sau commit

Đã mở **kết nối DB mới**, transaction read-only, đối chiếu:

| Kiểm tra | Kết quả |
| --- | --- |
| 8 allocation mục tiêu | Đều failed, quantity/quan hệ giữ nguyên |
| Stock 367 | Quantity 198, inactive |
| 69 allocation còn lại của đơn 29 | Hash toàn bộ record giống snapshot trước thay đổi |
| 13 stock khác còn gắn vị trí VT13 | Hash toàn bộ record giống snapshot trước thay đổi |
| Tồn active có quantity > 0 tại VT13 | Chỉ còn stock 437, SKU `02XX00214`, quantity **1** |
| Redis outbound sau xử lý | 0 key |
| Audit | History 1881 tồn tại |

VT13 **không được báo là trống hoàn toàn**: một đơn vị SKU 02XX00214 là lượng
dư hợp lệ, được giữ nguyên theo phạm vi chỉ clear dữ liệu lỗi. Người dùng tải
lại map và đối chiếu lượng này khi kiểm kê. Chưa thao tác FE hoặc thực hiện
kiểm kê vật lý thay người dùng.

## Phần cần sửa trong code để tránh tái diễn

Chưa thực hiện trong tác vụ vận hành này:

1. Nhánh Locator cần giới hạn stock theo kho/active/status, khóa stock khi cấp
   phát, trừ lượng đã giữ và kiểm tra tổng lượng nhiều dòng; báo thiếu rõ ràng.
2. Confirm cần validation trạng thái/kho/zone/tổng lượng theo stock, lock phù
   hợp, không commit từng dòng trước settle; đảm bảo rollback thống nhất DB và
   xử lý cache sau khi commit thành công.
3. Dùng `.notin_()` cho predicate SQL; thêm tình huống kiểm thử nhiều dòng cùng
   Locator và xác nhận lặp/lỗi thiếu tồn.
4. Clear station trên FE/API nên mô tả rõ phạm vi cache; quy trình reset tồn để
   kiểm kê là thao tác khác, cần scope và audit như lần này.

Mã nguồn đã có thay đổi của người dùng trước tác vụ, bao gồm
`masan_outbound_service.py`; được giữ nguyên. Không tự build/deploy bản sửa
nghiệp vụ trong quá trình clear dữ liệu.

## Cập nhật: clear hết VT13 để kiểm kê thủ công

Người dùng đã mở rộng phạm vi: “clear hết VT13”, gồm cả một đơn vị SKU
`02XX00214` được giữ lại ở lần đầu. Đã kiểm tra lại dữ liệu thật trước khi sửa:
còn 5 stock active `349,406,412,431,437`, tổng quantity 1; không có lệnh/chi tiết
nhập chưa kết thúc liên quan VT13 và không có cache outbound.

- Chuyển toàn bộ 5 stock active còn lại ở VT13 thành inactive trong một
  transaction; giữ quantity và metadata lịch sử để đối chiếu/khôi phục.
- Không sửa allocation, không xóa lịch sử, không sửa các ô khác hoặc gửi RCS.
- Ghi **History 1882**, phân biệt thao tác reset vị trí với xác nhận xuất.
- Bản sao: `backend/.recovery/vt13_full_before_20261021T033108727235Z.json`.
- Kiểm tra sau commit bằng **kết nối DB mới**: stock active **0**, tồn active
  **0**, pending outbound **0**, pending inbound **0**, History 1882 tồn tại;
  Redis không có cache outbound. Trạng thái map suy theo model là **empty**.

Người dùng tải lại trang và tự kiểm kê/cập nhật số lượng thực tế. Không thực
hiện kiểm kê vật lý hoặc nhập lại số lượng thay người dùng trong tác vụ này.
