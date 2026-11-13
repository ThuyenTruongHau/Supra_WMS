# Mục lục tài liệu

## Trạng thái và cách sử dụng

Bản nền: **2026-10-14**. Nguồn: working tree hiện tại và thông tin người dùng cung cấp. Chưa chạy ứng dụng, truy vấn database, kiểm tra AMR hay xác minh môi trường triển khai để viết bộ docs này.

Cập nhật **2026-10-16**: triển khai kỳ biểu đồ xu hướng tuần/tháng/quý/năm, xếp hạng Top 5/10/15 cùng kỳ 3 tháng; kiểm tra bằng mock/biên dịch SQL. Phạm vi, kết quả và giới hạn ở [validation reporting](reporting/validation.md) và [changelog](changelog.md).

Cập nhật **2026-10-19**: đổi tuổi tồn thành bốn nhóm 0–90, 91–180, 181–360, trên 360 ngày; kiểm tra ranh giới bằng SQL in-memory và mock API.

Các nhãn sử dụng:

- **Đã xác minh từ source**: đã đọc điểm xử lý được liên kết; không đồng nghĩa đã chạy thành công.
- **Người dùng xác nhận**: bối cảnh/nghiệp vụ được người dùng cung cấp.
- **Đề xuất**: lựa chọn cho tương lai, chưa phải hành vi hiện tại hoặc yêu cầu đã chốt.
- **Cần xác nhận**: chưa đủ bằng chứng hoặc cần quyết định nghiệp vụ.

Khi code thay đổi, cập nhật mục tương ứng và ngày xác minh; không cần đọc toàn bộ docs ở mọi nhiệm vụ. Docs là bản đồ để tìm source và ghi quyết định, source hiện tại dùng để xác minh cách triển khai.

## Đọc theo nhu cầu

| Nhu cầu | Tài liệu |
|---|---|
| Tiếp nhận dự án | [Tổng quan](system-overview.md) → [bản đồ source](code-map.md) → [chức năng](feature-catalog.md) |
| Hiểu dữ liệu kho và báo cáo | [Mô hình dữ liệu](data-model.md) → [chỉ số báo cáo](reporting/metrics.md) |
| Chạy, kiểm tra, debug | [Development](development.md) |
| Giao việc và làm việc với AI | [Quy trình AI](ai-workflow.md), [AGENTS.md](../AGENTS.md), [mẫu nhiệm vụ](templates/change-request.md) |
| Sửa giao diện báo cáo | [Hiện trạng reporting](reporting/overview.md) → [kiểm chứng](reporting/validation.md) |
| Thêm chỉ số/báo cáo | [Metrics](reporting/metrics.md) → [đề xuất](reporting/roadmap.md) → [kiểm chứng](reporting/validation.md) |
| Tìm quyết định và thay đổi tài liệu | [Quyết định](decisions.md), [lịch sử docs](changelog.md) |

## Tài liệu sẵn có ngoài bộ docs này

| Tài liệu | Cách sử dụng |
|---|---|
| [CELERY_DEPLOY.md](../CELERY_DEPLOY.md) | Kế hoạch cũ; phần mở đầu nói chưa có Celery, hiện không còn khớp source. Chỉ tham khảo lịch sử, không dùng nguyên văn để triển khai. |
| [Frontend README](../frontend/README.md) | README mẫu React/Vite; hướng dẫn dự án nằm trong bộ docs này. |
| [Backend README](../backend/README.md) | Hiện trống ở thời điểm khảo sát. |
| [Staging import hàng hóa](../backend/docs/chunk_item_table.MD) | Ghi chú SQL cục bộ; đối chiếu migration và service trước khi sử dụng. |
| [Từ điển trạng thái](../frontend/docs/status-translations.vi.json) | Tham khảo nhãn hiển thị; không thay thế luồng chuyển trạng thái trong service. |

Các mẫu phiếu HTML/PDF trong `backend/docs/` là tài liệu in/tham khảo, không phải tài liệu kiến trúc. Giữ nguyên các tài liệu cũ; không sao chép cấu hình hoặc thông tin truy cập từ chúng sang docs mới.
