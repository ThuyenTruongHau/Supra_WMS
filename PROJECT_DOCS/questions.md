# Những điểm cần xác minh hoặc chốt nghiệp vụ

Mốc ghi nhận: 20/10/2026. Các mục sau là kết quả đọc source hoặc thiếu dữ liệu môi
trường, không phải kết luận đã tái hiện lỗi. Không tự sửa nghiệp vụ trong tác vụ
tài liệu. Chỉ đưa câu hỏi cho chủ dự án khi công việc tiếp theo thực sự phụ thuộc.

| Mã | Điểm đã quan sát | Cần xác minh/chốt | Nguồn |
| --- | --- | --- | --- |
| Q01 | Có cả cấu hình host, Compose, URL build FE và nhiều process | Cách chạy đang dùng, DB/Redis đích, phiên bản API/worker/beat và cách ghi mốc triển khai | `docker-compose.yml`, `vite.config.ts`, `core/config.py` |
| Q02 | Sơ đồ nhập hardcode zone `[2, 12]`; nhiều luồng dùng display zone | Ánh xạ kho/zone nào là yêu cầu cố định, trường hợp nào cần cấu hình theo kho | `OperatorInboundPage.tsx`, `outboundMapZones.ts` |
| Q03 | Dispatcher nhập gom nhóm theo 2 chữ số cuối location_name, thứ tự `[0,3,2,1]`, gửi đầu 2 dòng | Quy tắc xếp thứ tự, đặt tên ô và số lượng song song mong muốn | `masan_inbound_service.py` |
| Q04 | Dispatcher không có return response tường minh sau nhánh không có list_details | Kết quả API mong muốn khi không có dòng/không khớp tên; kiểm tra response model thực tế | `caller_masan_inbound_order`, `MasanInboundCallerResponse` |
| Q05 | Cache đợt nhập còn lại dùng một key theo warehouse, không TTL tự hết hạn | Hành vi khi gọi đợt mới trong lúc đợt cũ chưa xong, callback lặp và lỗi giữa chừng | `_run_inbound_task`, `robot_service.receive_task_status` |
| Q06 | completed/cancelled/failed đều có thể kích hoạt gửi thêm 1 dòng | Có tiếp tục tự động sau failed/cancelled hay cần operator quyết định | `robot_service.py` |
| Q07 | Client ICS kiểm tra HTTP và đọc JSON, chưa thấy kiểm tra code nghiệp vụ | Mã thành công/thất bại chính thức của RCS, cách xử lý HTTP 200 nhưng code lỗi | `TaskStatusService.add_task` |
| Q08 | Nhãn trong code là FL 01/FL 02; mã thiết bị cố định ở FE và Literal schema | Danh sách/tên muốn quản lý ở cấu hình nào; chưa thay nhãn trong lần này | `utils/robotStatus.ts`, `masan_schema.py` |
| Q09 | Quyền phụ thuộc từng endpoint; legacy operator bypass require_permission; có helper dev-admin | Chính sách quyền vận hành dự kiến và các bypass còn cần dùng ở môi trường nào | `core/dependencies.py`, `auth_access.py`, `location_access.py` |
| Q10 | Manual tồn tại ở state UI, loại dòng và cấu hình kho | Các tổ hợp hợp lệ, đồng bộ cấu hình FE/BE và tiêu chí nghiệm thu từng tổ hợp | `warehouseMode.ts`, `warehouse_mode.py`, `execute_inbound_task` |
| Q11 | Luồng QR tablet có `/task/add-task`, trong khi backend có đường ICS riêng | Hợp đồng và topology orchestrator ngoài repo; reverse proxy production cho `/task` | `sendCallerAddTasks.ts`, `vite.config.ts`, `nginx.conf` |
| Q12 | Chưa kiểm tra toàn bộ test backend; fixture assignment chưa bao phủ batching mới | Baseline cách ly, những test cần cập nhật và các tình huống callback/Redis cần bao phủ | `backend/test`, `masan_inbound_service.py` |
| Q13 | Model có nhiều trạng thái tính từ quan hệ/SQL; chưa kiểm tra DB thực | Migration thực tế, trạng thái/quantity/lot mong muốn trong nhập-xuất-kiểm kê | Các `*_model.py`, service và `backend/alembic` |
| Q14 | Outbound chọn tồn theo zone code chưa có warehouse predicate tường minh; Locator dispatch lọc name/quantity khác parse-preview; strategy fefo xếp theo lot, không theo expiry_date | Cách cô lập tồn nhiều kho, hợp đồng Locator name/code, tồn khả dụng và thứ tự xuất mong muốn | `_strategy_loading_stocks`, `_validate_outbound_import_locator`, `sending_masan_outbound_task` |
| Q15 | Task có thể gom theo vị trí nguồn qua nhiều order; callback di chuyển toàn bộ stock active nguồn; return gắn stock/detail cuối; CC nhóm xe có thể gồm nhiều đơn | Nghiệm thu nhiều SKU/order trên cùng pallet, lượng trả và cleanup CC đúng phạm vi | `_check_stock_in_task`, `execute_outbound_task`, `receive_task_status`, `assign_cc_zone` |
| Q16 | Predicate pending đã sửa SQL `.notin_` ngày 21/10; lượng khác allocation còn làm `detail.quantity -= lượng xác nhận`; commit nhiều bước và validation BE khác FE | Công thức xuất thiếu, xác nhận lặp/sai kho/sai trạng thái/sai lượng, tính nhất quán DB/Redis khi lỗi | `confirm_allocation_outbound`, `MasanConfirmAllocationOutboundRequest` |
| Q17 | Trạng thái detail vẫn xét return; Transaction.quantity của settle là lượng stock sau trừ; return_quantity là lượng của stock cuối | Mốc hoàn tất nghiệp vụ, ý nghĩa báo cáo/transaction và tổng hàng dư nhiều pallet | `outbound_order_model.py`, `_settle_outbound_stock` |
| Q18 | Đã sửa 21/10: return lấy DB theo VT độc lập CC; lacked/sorting-needed dùng phần còn thiếu, dispatch None trả lỗi; vài nút còn console | Nghiệm thu chuỗi robot thực tế và phạm vi hoàn thiện UI còn lại | `useMasanSortingZoneReturnTasks`, `masan_sorting_return_service`, `lacked_details`, `masan_api.py`, `OperatorOutboundDetailPage`, `CcLocationLinesModal` |
| Q19 | Picking list gán extracted và commit trước render; generic execute có retry, dispatch Masan gọi execute service trong task riêng | Khôi phục khi PDF/RCS/DB lỗi giữa chừng, idempotency và phạm vi retry thực tế | `masan_picking_list_service.py`, `outbound_celery_task.py`, `masan_celery_task.py` |

Đường dẫn/hàm trong bảng tra qua [bản đồ code](code-map.md) và [chỉ mục](index/backend.md).
Chi tiết Q14–Q19 được diễn giải trong [luồng outbound](flows/outbound.md);
đây là quan sát code, chưa là kết quả tái hiện lỗi hoặc yêu cầu đổi nghiệp vụ.

## Cách đóng một mục

Ngày **21/10/2026**, đã xử lý phần return của Q18: không lấy danh sách đơn từ
cache CC để tìm lệnh trả. GET mới đọc kho/VT/task/stock trong DB; 11 test BE
cách ly đạt, FE build đạt. Đối chiếu READ ONLY tìm đúng return 5 đơn vị SKU
02XX00281 từ VT14 về G366 của đơn 32 dù CC trống. Chưa phát lệnh robot để thử.
Xem [task return VT14](tasks/2026-10-21-vt14-return-discovery.md).

Bản sửa lượng còn thiếu ngày **21/10/2026** đã xử lý thêm một phần Q14/Q18:
failed/cancelled không tính đã đáp ứng, partial/retry dùng unallocated_quantity,
Locator không dùng tồn inactive/sai kho/vượt khả dụng, không có task không báo
thành công giả. Đã có 17 test BE, 5 test FE outbound, build đạt và cập nhật
worker logic. Xem [task lượng còn thiếu](tasks/2026-10-21-outbound-remaining-quantity.md).
Concurrency PostgreSQL, confirm transaction và các điểm còn lại vẫn cần xử lý
riêng; không đóng toàn bộ Q14/Q16/Q18 từ kết quả này.

Ngày **21/10/2026**, đã đối chiếu dữ liệu thật cho một phần Q14/Q16/Q18:
VT13 của đơn 29 có 8 allocation confirmed tổng 204 trên stock 198, Redis đã hết
cache outbound. Đã giải phóng đúng phần kẹt, giữ dữ liệu khác và audit. Xem
[hồ sơ xử lý VT13](tasks/2026-10-21-vt13-outbound-recovery.md). Đây là xác minh
sự cố dữ liệu; các mục chưa được đóng vì code phòng tái diễn chưa sửa.

Ghi quyết định của chủ dự án hoặc kết quả kiểm tra, ngày, nguồn/lệnh/môi trường và
tài liệu chức năng đã cập nhật. Ví dụ: “Q03 đã chốt ngày ...: ...; kiểm chứng ...”.
Nếu mới đọc thêm code thì chỉ nâng mức hiểu về hiện trạng, không coi đó là xác
nhận nghiệp vụ mong muốn.
