# Số xe trên CC không clear sau khi hoàn tất phiên

Ngày: 21/10/2026. Trạng thái: đã sửa, kiểm thử và cập nhật worker logic đang chạy.

## Bằng chứng và nguyên nhân

Người dùng báo số xe còn sau khi hết phiên. Đọc Redis và DB thật trong transaction
READ ONLY thấy phiên 30 `OUT-20261021-104111` completed, nhưng 5 bucket tại CC10,
CC11, CC12, CC13, CC14 vẫn giữ xe; các bucket này không có order đại diện cấp
ngoài, trong khi line bên trong vẫn trỏ đúng detail của phiên đã hoàn tất.

- `_clear_assigned_cc_location` cũ chỉ so `bucket.outbound_order_id`, bỏ sót
  bucket thiếu trường đó; với bucket nhiều đơn có thể xóa nhầm dòng chưa xong.
- `still_pending` trong confirm dùng toán tử Python `not in` trên cột ORM,
  không tạo SQL `.notin_`, có thể giữ assignment dù hết lệnh pending.
- Hook completed đọc entity ORM có thể còn status cũ. Beat gán CC không có
  lượt dọn dự phòng và các key gán xe dùng TTL -1.
- FE lấy dữ liệu CC mỗi 5 giây; không chỉ là lựa chọn xe trong state trình duyệt.
  Chưa xác định tiến trình nào đã tạo các bucket thiếu order đại diện.

## Thay đổi

- `clear_completed_cc_assignments` dùng trạng thái detail SQL hiện tại để dọn
  cả bucket và mapping ngược. Giữ dòng của đơn khác còn chạy; không coi fully
  allocated là completed. Không đụng stock-ready hoặc tồn kho.
- Lưu association CC còn thiếu vào `sorting_location_id` và commit trước khi
  dọn Redis, giữ lịch sử/picking list. Nếu nhiều location mâu thuẫn hoặc callback
  còn cần backfill, hoãn dòng đó tới lượt đối chiếu an toàn.
- Beat gọi dọn **trước** khi tìm ô trống/tìm đơn mới, kể cả khi mọi ô đang bị giữ.
- Hook completed dùng scalar SQL tránh status cũ trong identity map; không phụ
  thuộc trường order đại diện của bucket.
- Sửa pending predicate, không clear dòng còn thiếu lượng; commit return draft
  trước lượt đối chiếu sau confirm. Các công thức sửa quantity khi confirm khác
  lượng gốc vẫn là mục Q16 riêng, không coi đã giải quyết toàn bộ.
- `cache_replace_if_unchanged`: GET kiểm tra JSON và Lua so raw hiện tại trước khi
  replace/delete, giữ TTL, tránh xóa bucket đã được gán mới trong lúc đối chiếu.

## Kiểm chứng

- `backend/.venv/Scripts/python.exe -m unittest test.test_completed_cc_cleanup -q`
  từ backend: **16/16 đạt**, SQLite schema thật + cache giả lập. Có test confirm
  dòng cuối, còn pending, partial, failed, return, mixed order, thiếu order ngoài,
  orphan reverse key, prefix Redis, status ORM cũ và gán lại đồng thời giả lập.
- Image mới chạy `test.test_completed_cc_cleanup`, `test.test_outbound_remaining_quantity`,
  `test.test_masan_outbound_parse`, `test.test_stocktake_empty_location` với
  `docker run --rm --network none`: **47/47 đạt**, không dùng dịch vụ thật.
- Script Lua trích trực tiếp từ source chạy trong container Redis tạm, network
  none qua Unix socket: đạt replace, mismatch giữ giá trị mới, giữ TTL và delete.
  Hai lần thử đầu gặp vấn đề truyền stdin/socket chưa sẵn sàng của harness;
  lần cuối mở stdin và đợi socket đã chạy đủ assertion.
- Trước deploy đã xác minh image trùng SHA256 của cache.py và service trên host,
  không chứa `.recovery`, active/reserved/scheduled của logic/status đều 0.

## Áp dụng thực tế

- Backup Redis assignment và snapshot DB trước deploy:
  `backend/.recovery/cc_completed_before_20261021T044413340048Z.json` —
  48 key, 34 detail; 16 detail completed. File riêng tư không vào Git/image.
- Image rollback: `wms-backend:pre-cc-cleanup-da57b08cd642`.
- Image mới `wms-backend:latest` có ID
  `sha256:f8853712a8b2fd6096f54a65f75abb2b8001dcc8e6565ca9653a70928a2477d9`.
- Đã recreate riêng `celery-worker-logic`, node `logic@ad5dfed586ff`. Host API
  reload source. Không restart status/beat; status cũ có thể dùng hook cũ nhưng
  lượt đối chiếu của logic worker mới xử lý fallback mỗi 5 giây.
- Log **11:46:54 giờ Việt Nam**: `locations_deleted=5`, `details_deleted=16`,
  `history_saved=16`. Lượt kế tiếp không dọn lặp.
- Kiểm tra độc lập DB/Redis sau deploy: không còn bucket chỉ chứa detail completed;
  còn 9 bucket của phiên 29/31 chưa hoàn tất; 16/16 detail phiên 30 có lịch sử CC.
- Không chạy request confirm/dispatch/RCS thật để test. Thay đổi vận hành này
  chỉ dọn assignment completed và backfill liên kết CC; không sửa lượng tồn.

## Giới hạn

Chưa kiểm tra map trực tiếp bằng trình duyệt hoặc race giữa các transaction
PostgreSQL thật. FE polling 5 giây có thể cần thêm một lượt sau khi beat dọn;
có thể tải lại trang. Nếu CC vừa được gán xe phiên mới, số xe mới vẫn hiển thị
theo thiết kế. Không rollback bằng cách nạp toàn bộ backup vì có thể ghi đè
assignment mới; phải đối chiếu từng key và trạng thái DB nếu cần phục hồi.
