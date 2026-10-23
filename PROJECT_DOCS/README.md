# Bộ tài liệu mới của Supra WMS

## Phạm vi và mốc bắt đầu

- Ngày khởi tạo: **20/10/2026**, theo múi giờ Asia/Saigon.
- Đối tượng: chủ dự án làm việc một mình cùng Codex.
- Source khảo sát ban đầu: nhánh `masan_prd`, commit `50d2dd44cbb08b193c80bc62bba84f30886fc6e1`.
- Phương pháp: đọc code/cấu hình hiện tại; không dùng docs cũ hoặc lịch sử chat để suy ra nghiệp vụ.
- Source tiếp tục thay đổi sau mốc này: luôn đối chiếu file hiện tại trước khi triển khai.

Docs cũ ngoài `README.md`, `AGENTS.md`, `PROJECT_DOCS/**` không thuộc bộ tham chiếu
này. Việc giữ lại file cũ không có nghĩa nội dung của chúng còn được áp dụng.

## Thứ tự đọc

| Bạn cần làm gì? | Đọc ở đâu? |
| --- | --- |
| Bắt đầu một phiên làm việc với AI | [workflow.md](workflow.md) |
| Hiểu các thành phần | [architecture.md](architecture.md) |
| Tìm nơi cần sửa | [code-map.md](code-map.md) |
| Hiểu màn hình/chức năng hiện có | [features.md](features.md) |
| Chạy ứng dụng, kiểm tra proxy, worker, log | [runtime.md](runtime.md) |
| Thay đổi nhập kho operator | [flows/inbound.md](flows/inbound.md) |
| Hiểu xử lý xuất kho BE: đơn, allocation, CC/VT, robot, xác nhận và tồn | [flows/outbound.md](flows/outbound.md) |
| Thao tác xuất kho trên FE operator/admin/QR tablet | [guides/outbound-fe.md](guides/outbound-fe.md) |
| Kiểm kê ô trống, thêm hàng tìm thấy và xác nhận tồn | [flows/stocktake.md](flows/stocktake.md) |
| Thay đổi giao lệnh/trạng thái robot | [flows/robot.md](flows/robot.md) |
| Đồ thị map, tính quãng đường A* | [flows/map-route.md](flows/map-route.md) |
| Chọn lệnh kiểm tra | [testing.md](testing.md) |
| Theo dõi phần chưa rõ | [questions.md](questions.md) |
| Ghi một việc kéo dài nhiều phiên | [tasks/README.md](tasks/README.md) |
| Tra tên file, hàm/lớp, route | [Chỉ mục backend](index/backend.md), [frontend](index/frontend.md), [API](index/api.md) |

## Đọc đúng mức bằng chứng

- **Đọc code:** hành vi thấy trong source ở mốc khảo sát; không khẳng định luồng đã chạy thành công ngoài thực tế.
- **Đã chạy kiểm tra:** có lệnh, kết quả và phạm vi kiểm tra được ghi cụ thể.
- **Cần xác minh:** chủ dự án cần chốt nghiệp vụ hoặc cần kiểm tra môi trường thực tế; theo [questions.md](questions.md).

Mỗi trang có phạm vi rõ. Chỉ mục tự sinh chỉ mô tả cấu trúc mã; một file có tên
`mock` hay một page tồn tại chưa chứng minh nó đang được route sử dụng hoặc đã triển khai.

## Kiểm tra đã thực hiện khi dựng bộ tài liệu

| Kiểm tra | Kết quả/phạm vi |
| --- | --- |
| Đọc entrypoint, router, cấu hình, code luồng chính | Đã thực hiện; các trang có liên kết tới source |
| Khảo sát sâu outbound ngày 20/10/2026 | Đã đọc luồng FE → API → service/task → allocation/CC/VT → RCS/callback → xác nhận/return; [luồng BE](flows/outbound.md), [thao tác FE](guides/outbound-fe.md). Chưa chạy nghiệm thu outbound thực tế |
| `npm.cmd run test:robot` trong `frontend` | **8/8 đạt** ngày 20/10/2026; kiểm tra utility hiển thị trạng thái, không gọi RCS |
| Đồng bộ chỉ mục và liên kết tài liệu | **Đã đạt** ngày 20/10/2026 bằng `python scripts/build_code_index.py --check`: 188 file backend, 361 file frontend, 169 khai báo route; các link nội bộ trong bộ mới đều có đích |
| Build frontend, toàn bộ test backend, DB/migration, dịch vụ đang chạy | Không thực hiện trong tác vụ tài liệu này |
| Gửi lệnh tới RCS hoặc vận hành robot | Không thực hiện trong tác vụ tài liệu này |

## Duy trì tài liệu

1. Sửa hành vi ở tầng nào, cập nhật trang chức năng/luồng tương ứng.
2. Khi thêm/xóa file hoặc đổi khai báo route, tạo lại chỉ mục bằng [script](../scripts/build_code_index.py).
3. Ghi quyết định mới vào task note hoặc trang nghiệp vụ; không để quyết định quan trọng chỉ tồn tại trong chat.
4. Ghi ngày và bằng chứng khi nâng một nội dung từ “cần xác minh” thành “đã xác minh”.
5. Dùng tài liệu mới để tìm đường vào code, rồi kiểm tra source; không chép lại toàn bộ source vào docs.
