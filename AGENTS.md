# Hướng dẫn làm việc với Supra WMS

## Đọc trước khi thay đổi

1. Đọc [mục lục docs](docs/README.md), [quy trình AI](docs/ai-workflow.md) và [bản đồ source](docs/code-map.md).
2. Chọn phân hệ trong [danh mục chức năng](docs/feature-catalog.md), đọc tài liệu tương ứng rồi đối chiếu source hiện tại.
3. Với báo cáo/biểu đồ, đọc [hiện trạng](docs/reporting/overview.md), [định nghĩa chỉ số](docs/reporting/metrics.md), [kiểm chứng](docs/reporting/validation.md). Chỉ đọc [đề xuất](docs/reporting/roadmap.md) khi cần thiết kế thay đổi.
4. Xem `git status --short` và diff của các file liên quan; giữ nguyên thay đổi có sẵn của người dùng ngoài phạm vi nhiệm vụ.

## Nguyên tắc triển khai

- Yêu cầu mới nhất của người dùng quyết định phạm vi. Ưu tiên hiện tại: trình bày biểu đồ và bổ sung báo cáo cho quản lý kho cùng nhân viên vận hành.
- Luồng nhập/xuất được người dùng xác nhận đang ổn định. Với nhiệm vụ báo cáo, chỉ đọc và tái sử dụng chúng; chỉ thay đổi nếu yêu cầu thực tế cần đến, kèm phân tích tác động.
- Docs mô tả hiện trạng theo source; khi source khác docs, xác minh và cập nhật tài liệu. Không tự đổi nghiệp vụ chỉ để khớp một mô tả cũ.
- Phân biệt **đã xác minh từ source**, **người dùng xác nhận**, **đề xuất**, **chưa xác minh runtime**. Đề xuất chưa phải yêu cầu đã chốt.
- Tách thay đổi giao diện khỏi thay đổi công thức, bộ lọc, đơn vị, thời gian và phân quyền. Nêu rõ khi một nhiệm vụ cần cả hai.
- Theo luồng `page → hook → API client → backend API → service → model/database` để đánh giá tác động; kiểm tra task nền nếu có snapshot.
- Kiểm tra khả năng tái sử dụng trước khi thêm API/hàm tổng hợp mới. Không refactor phần ngoài phạm vi chỉ để làm đẹp cấu trúc.
- Không đưa mật khẩu, token, nội dung `.env`, dữ liệu khách hàng hoặc log chứa thông tin nhạy cảm vào docs và đầu ra.
- Không gọi endpoint tạo đơn, gửi lệnh AMR, chạy migration hay tác vụ ghi dữ liệu trên hệ thống đang vận hành để thử một thay đổi báo cáo.

## Hoàn thành nhiệm vụ

- Chạy kiểm tra phù hợp theo [development](docs/development.md); không khẳng định đã kiểm chứng nếu chưa chạy.
- Cập nhật docs bị ảnh hưởng trong cùng nhiệm vụ. Nếu hành vi không đổi, ghi nhận điều đó trong bàn giao; không cần sửa tài liệu cho có.
- Ghi quyết định nghiệp vụ/kỹ thuật cần lưu lại vào [sổ quyết định](docs/decisions.md); ghi thay đổi đáng chú ý vào [lịch sử docs](docs/changelog.md).
- Bàn giao: kết quả, file chính, kiểm tra đã chạy và giới hạn còn lại. Không tự commit, publish hoặc deploy nếu chưa được yêu cầu.

## Kiểm tra thường dùng

- Frontend, tại `frontend/`: `npm run build`, `npm run lint`.
- Backend: xem hướng dẫn môi trường và kiểm tra theo phạm vi trong `docs/development.md`.
- Chỉ sửa docs: kiểm tra liên kết, đường dẫn source, nội dung so với code và `git diff --check`; không cần khởi chạy ứng dụng.
