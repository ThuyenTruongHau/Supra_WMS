# Lịch sử tài liệu

Ghi thay đổi có ý nghĩa với người tiếp nhận; không sao chép toàn bộ Git log. Phân biệt cập nhật mô tả với thay đổi phần mềm đã triển khai.

## 2026-10-19 — Bốn nhóm tuổi tồn

- Đổi API/types, CASE tổng hợp, bộ lọc chi tiết và màu chart thành 0–90 / 91–180 / 181–360 / trên 360 ngày. Ngày 180 thuộc nhóm thứ hai, ngày 360 thuộc nhóm thứ ba.
- Tỷ trọng và kho trống trả đủ bốn nhóm; mã bucket cũ trả 422. Frontend/backend cần cập nhật cùng nhau; không cần migration dữ liệu.
- Thêm 8 tests tuổi tồn; toàn bộ 35 tests reporting đã chạy đạt bằng mock/SQL in-memory, chưa kiểm tra trình duyệt/DB kho thực tế.

## 2026-10-16 — Nhãn sản phẩm trên biểu đồ Top

- Xác minh chỉ đọc dữ liệu Item: các giá trị như 4603.637 là SKU thật, không phải số lượng hoặc lỗi chuyển đổi số.
- Theo lựa chọn người dùng, cả Top 5/10/15 hiển thị SKU + tên sản phẩm trên hai dòng, có tooltip đầy đủ và giữ định danh dạng chuỗi.
- API bổ sung sku/name và giữ label cũ để tương thích; thêm regression giữ dấu chấm/số 0 đầu trong SKU.
- 27 tests reporting đã chạy đạt; phạm vi xác minh DB chỉ gồm nhãn ba sản phẩm, chưa đối chiếu số liệu tổng hợp.

## 2026-10-16 — Kỳ 3 tháng và Top 5/10/15 sản phẩm

- Thêm kỳ 3 tháng (90 ngày gần nhất) cho nhập/xuất; tồn vẫn theo số lượng hiện tại.
- Thêm bộ chọn Top 5/10/15, tiêu đề động, SQL limit cho cả ba nhóm, thứ tự ổn định khi quantity bằng nhau và query key theo limit.
- Chart tăng chiều cao theo số sản phẩm, cuộn khi dài và thông báo khi không có dữ liệu.
- API vẫn mặc định week/Top 5; response thêm limit. Thêm ngoại lệ ignore cho file test Top mới.
- Đã chạy 26 tests reporting gồm test biên dịch SQL và mock API; cập nhật overview, metrics, roadmap, validation và hướng dẫn kiểm tra.
- Bundle Vite, compile Python và kiểm tra docs/diff đạt; build TypeScript/lint giữ các lỗi có sẵn, không thêm diagnostic mới trong phần sửa.

## 2026-10-16 — Kỳ biểu đồ xu hướng kho

- Đổi bộ chọn thành 1 tuần/1 tháng/1 quý/1 năm, mặc định tuần; dùng kỳ lịch hiện tại đến hôm nay.
- Tuần/tháng có điểm theo ngày; quý/năm có điểm theo tháng. UI hiển thị khoảng ngày và điểm đơn đầu kỳ.
- API `granularity` nhận `week/month/quarter/year`; `day` cũ trả 422, `week` đổi nghĩa. Frontend/backend cần cập nhật cùng nhau.
- Giữ phép đếm đơn và cách chọn snapshot; tồn gộp tháng ở quý/năm vẫn cộng tồn ngày. Các quyết định nghiệp vụ về tồn cuối kỳ và dữ liệu thiếu vẫn mở.
- Thêm 18 unit/API tests bằng mock, đã chạy đạt; cập nhật overview, metrics, roadmap, validation và hướng dẫn test.
- Thêm ngoại lệ `.gitignore` cho hai file test reporting mới để có thể đưa vào quản lý phiên bản; các test cục bộ khác giữ quy tắc ignore hiện tại.
- Bundle frontend Vite đạt; build TypeScript và lint còn lỗi có sẵn, kiểm tra phần thay đổi không thêm diagnostic mới. Chưa nghiệm thu trình duyệt/DB thực tế.

## 2026-10-14 — Bộ docs nền

- Thêm tổng quan, bản đồ source, danh mục chức năng và tập con mô hình dữ liệu.
- Khảo sát chi tiết reporting: API, UI, công thức, phạm vi lọc, snapshot, phân quyền và giới hạn hiện tại.
- Thêm hướng dẫn agent, quy trình cập nhật docs, mẫu nhiệm vụ, hướng dẫn chạy/kiểm tra và sổ quyết định.
- Ghi đề xuất cải tiến giao diện/chỉ số riêng trong roadmap; chưa thay đổi ứng dụng.
- Nguồn là working tree tại thời điểm khảo sát; chưa xác minh số liệu DB, tiến trình triển khai hoặc AMR thực tế.
