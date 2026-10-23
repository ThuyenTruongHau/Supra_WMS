# Clear toàn bộ VT và CC trước khi nhập phiên mới

Ngày: 21/10/2026. Trạng thái: **đã thực hiện và kiểm chứng trên DB/Redis thật**.

## Phạm vi người dùng giao

“Clear hết data trong các ô VT và CC” để nhập lại một phiên mới. Áp dụng kho 1,
8 ô VT trong Zone_sorting_1/2 và 20 ô CC trong Zone_CC_01/02. Giữ lịch sử,
geometry map và tồn ngoài VT/CC; không phát lệnh vận chuyển/hủy RCS thật.

## Trước xử lý

- 28 location: VT11–VT14, VT21–VT24, CC10–CC19, CC20–CC29.
- Một stock active tại VT13: ID 885, quantity 81.
- 4 allocation pending: 628/629/630 outbound pre_completed (3/2/2), 631 return
  initialize (74). Task 1115 đã có callback completed; task 1116 initialize,
  không có callback; không thấy task liên quan đang in_progress.
- Hai phiên cũ còn nhu cầu: 29 `OUT-20261021-074406`, 31 `OUT-20261021-113328`.
- 46 key Redis CC assignment/reverse/stock_ready. Không có inbound hoặc phiếu
  kiểm kê pending tại các vị trí mục tiêu.

## Thực hiện

1. Bổ sung predicate không tự gán CC cho order có
   `details.cc_assignment_disabled=true`. Default không có flag vẫn hoạt động.
2. Test case reset order rồi thêm order mới: phiên cũ không xuất hiện lại,
   phiên mới vẫn được gán. Bộ CC cleanup **17/17 đạt** trên host và image mới
   bằng SQLite/cache giả lập, image chạy network none.
3. Build image, xác minh SHA256 service trùng source. Kiểm tra
   active/reserved/scheduled của logic/status đều 0; dừng logic tạm để tránh
   tác vụ beat ghi lại cache trong lúc reset. Status và beat vẫn chạy.
4. Script riêng tư `.recovery/reset_all_vt_cc_20261021.py` có dry-run mặc định,
   kiểm tra cứng latest order, danh sách stock/allocation/order, task, inbound,
   stocktake; lock target, backup trước khi commit, fingerprint dữ liệu ngoài phạm vi.
5. Lúc **11:54:45 giờ Việt Nam**, transaction commit:
   stock 885 inactive (giữ nguyên quantity 81 và metadata lịch sử), 4 allocation
   trên → cancelled; order 29/31 nhận flag disabled và `station_reset`.
   Ghi History **1916, 1917**, phân biệt executor bảo trì với owner của order.
6. Sau DB commit, xóa đúng 46 snapshot key Redis bằng compare/delete nguyên tử;
   không có key thay đổi đồng thời. Không xóa inbound caller cache.
7. Recreate logic worker bằng image mới và theo dõi nhiều lượt beat.

Không xóa cứng đơn/detail/RobotTask/TaskStatus, không tạo callback RCS giả hoặc
transaction xuất hàng giả, không chuyển số tồn VT về ô nguồn. “cancelled” ở
đây là hủy allocation WMS theo yêu cầu reset, không khẳng định RCS đã hủy task.

## Backup và runtime

- Backup: `backend/.recovery/vt_cc_full_reset_before_20261021T045445269754Z.json`.
  Chứa toàn bộ stock ở station, allocation pending, order trước thay đổi,
  trạng thái task, Redis payload/TTL và fingerprints ngoài phạm vi.
- Script/backup nằm ngoài Git và Docker context qua `.recovery` ignore.
  Không chạy lại `--commit`: các guard sẽ từ chối trạng thái đã reset.
- Image trước reset: `wms-backend:pre-station-reset-f8853712a8b2`.
- Image mới:
  `sha256:2c77d1d6c842d4ee6bb54e0aaac6af8fee630b8e457f31ffdd0e3e6bafde3e85`.
- Host API có reload. Status/beat không recreate; logic mới xử lý assignment.

## Kiểm chứng độc lập sau xử lý

- Transaction READ ONLY mới: **28/28 Location.status = empty**, 0 stock active
  tại station; stock 885 vẫn quantity 81 và inactive; 4 allocation cancelled.
- Ba nhóm cache assignment/reverse/stock_ready đều **0 key** sau nhiều lượt beat.
- Hai order cũ flag true; truy vấn eligibility thật trên PostgreSQL trả 0 order
  cũ để gán. Nhu cầu/số lượng đơn giữ nguyên, không fake completed.
- Fingerprint tồn ngoài VT/CC trùng backup; script cũng kiểm tra các allocation
  ngoài mục tiêu, order khác, toàn bộ location và RobotTask không thay đổi.
- History 1916/1917 tồn tại; worker chạy lại và các lượt assign thành công,
  không có lỗi trong đoạn log đã kiểm tra. Chưa bấm map bằng trình duyệt.

Người dùng tải lại FE rồi nhập phiên mới. Nếu cần phục hồi, đối chiếu từng
record/key với snapshot và trạng thái hiện tại; không khôi phục hàng loạt vì
có thể ghi đè dữ liệu phiên mới.
