# Sổ quyết định

Chỉ ghi lựa chọn đã được xác nhận. Các phương án chưa chốt nằm ở [roadmap](reporting/roadmap.md). Ngày dưới đây là ngày ghi nhận trong bộ docs.

| ID | Ngày | Quyết định và căn cứ | Hệ quả |
|---|---|---|---|
| D001 | 2026-10-14 | Người dùng yêu cầu xây bộ docs trước và dùng làm căn cứ cho các lần chỉnh sửa | Tạo docs nền và `AGENTS.md`; thay đổi sau phải đối chiếu source và cập nhật docs liên quan |
| D002 | 2026-10-14 | Người dùng ưu tiên trình bày biểu đồ và bổ sung chỉ số/báo cáo; nhập/xuất đang ổn định | Khảo sát reporting chi tiết trước; giới hạn sửa các luồng vận hành theo phạm vi yêu cầu |
| D003 | 2026-10-14 | Người dùng xác nhận báo cáo phục vụ cả quản lý kho và nhân viên vận hành | Thiết kế tương lai cần cả tổng quan và truy xuất chi tiết; quyền truy cập thực tế còn phải xác minh/thiết kế |
| D004 | 2026-10-16 | Người dùng yêu cầu đổi bộ chọn xu hướng từ 12 ngày/12 tuần thành 1 tuần/1 tháng/1 quý/1 năm | Đã cập nhật UI/API/types và docs. Cách triển khai là kỳ lịch hiện tại đến hôm nay, tuần/tháng theo ngày và quý/năm theo tháng; cách chia này đã được thông báo trong phiên làm việc |
| D005 | 2026-10-16 | Người dùng yêu cầu thêm kỳ 3 tháng và Top 10/Top 15 cho xếp hạng sản phẩm | Đã thêm period three_months và limit 5/10/15. Triển khai 3 tháng là 90 ngày theo cách rolling hiện có, đã thông báo trong phiên; tồn vẫn hiện tại, giới hạn N áp dụng cả ba nhóm |
| D006 | 2026-10-16 | Sau khi xác minh SKU dạng số, người dùng chọn “Mã SKU + tên sản phẩm” | Thống nhất nhãn Top 5/10/15 có mã và tên; giữ nguyên định danh SKU, API thêm sku/name, tooltip có đầy đủ thông tin |
| D007 | 2026-10-19 | Người dùng yêu cầu đổi nhóm tuổi tồn thành 0–90, 91–180, 180–360, >360 ngày | Triển khai 0–90, 91–180, **181–360**, >360 cho cả biểu đồ/chi tiết. Ngày 180 thuộc nhóm thứ hai để không trùng; cách xử lý ranh giới đã thông báo trong phiên |

## Mẫu thêm quyết định

- ID, ngày và trạng thái đã chốt.
- Vấn đề và lựa chọn cuối cùng.
- Ai/yêu cầu nào xác nhận; không dùng lời đề xuất của AI làm bằng chứng người dùng đã đồng ý.
- Lý do, hệ quả, source/docs liên quan.
- Nếu thay quyết định cũ: ghi ID được thay thế và giữ lịch sử.
