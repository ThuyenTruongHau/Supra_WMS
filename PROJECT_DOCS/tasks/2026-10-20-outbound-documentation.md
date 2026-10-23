# Tài liệu outbound BE và thao tác FE

Ngày bắt đầu: 20/10/2026.
Trạng thái: hoàn thành tài liệu ngày 20/10/2026; bằng chứng ở mức đọc source.
Phạm vi: chỉ đọc source và cập nhật bộ tài liệu mới; không dùng docs cũ, không
gọi API ghi dữ liệu, gửi lệnh robot, chạy migration hoặc triển khai dịch vụ.

## Mục tiêu

- Giải thích đường đi của dữ liệu xuất kho: tạo/import, allocation, CC/VT,
  chia chọn, xác nhận xuất, robot/callback và các trạng thái/tồn liên quan.
- Hướng dẫn thao tác FE theo màn hình đang được router sử dụng, phân biệt admin,
  operator, QR tablet và các nút còn placeholder.
- Liên kết thao tác → API → hàm BE → dữ liệu/cache; đánh dấu điều chưa xác minh.

## Việc cần làm

- [x] Đọc các entrypoint và service BE outbound/Masan/robot.
- [x] Đọc hành vi FE, dialog chia chọn, import và xác nhận.
- [x] Viết tài liệu BE và hướng dẫn FE, cập nhật mục lục.
- [x] Kiểm tra link/chỉ mục và đối chiếu các điểm quan trọng với source.

## Bàn giao

- [Luồng backend](../flows/outbound.md): dữ liệu, sơ đồ, tạo/import, loại đơn,
  allocation/tồn khả dụng, CC/VT, payload API/JSON RCS, worker, callback, confirm,
  QR/manual, return, cache, trạng thái và báo cáo.
- [Hướng dẫn frontend](../guides/outbound-fe.md): operator, admin, QR tablet,
  các bước thao tác, bảng nút → API và tra lỗi.
- Đã nối link tại README gốc, mục lục, features và code-map; thêm Q14–Q19 ở
  [questions.md](../questions.md) cho các quan sát cần xác minh.
- Ghi rõ Gọi lệnh đã dùng dispatch, Gọi robot xuất cuối bảng operator và Chia
  lại trong popup CC còn console/placeholder; Hàng thiếu chỉ lấy 3 đơn gần nhất
  chưa completed từ trang truy vấn hiện tại.

## Kiểm tra đã chạy

| Kiểm tra | Kết quả |
| --- | --- |
| `python scripts/build_code_index.py --check` | Đạt: chỉ mục khớp source, mọi link nội bộ của bộ docs mới có đích |
| Kiểm tra trực tiếp hai trang outbound bằng Python stdlib | Đạt: UTF-8, không có ký tự thay thế/trailing whitespace, code fence cân bằng, 6 ví dụ JSON parse được, 14 liên kết mục khớp heading |
| `git diff --check` | Đạt; docs là file mới/untracked nên có kiểm tra whitespace riêng như trên |

Không chạy build/test ứng dụng, gọi API ghi, DB/Redis/RCS, migration hoặc triển
khai. Các kịch bản nghiệp vụ trong docs là hướng dẫn kiểm chứng tiếp theo,
**chưa được chạy** trong tác vụ này. Không chỉnh sửa code chức năng hoặc file
`linhtinh/tasktemplate.json` đang có thay đổi của người dùng.
