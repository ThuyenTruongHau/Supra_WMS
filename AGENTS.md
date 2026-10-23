# Làm việc với Codex trong Supra WMS

## Nguồn tham chiếu từ 20/10/2026

- Dự án do một người làm việc cùng Codex. Giao tiếp và viết tài liệu bằng tiếng Việt.
- Bộ tài liệu chuẩn mới: `README.md`, `AGENTS.md`, `PROJECT_DOCS/**`.
- Theo yêu cầu chủ dự án, bỏ qua toàn bộ docs cũ ngoài bộ trên: `DOCS/**`, `backend/docs/**`, các README cũ trong frontend/backend, `CELERY_DEPLOY.md` và tài liệu kế hoạch cũ ở vị trí khác. Không đọc, trích dẫn hoặc tái sử dụng chúng làm căn cứ, trừ khi người dùng yêu cầu cụ thể.
- Source code và cấu hình được kiểm tra ở tác vụ hiện tại là căn cứ cho hành vi đang triển khai. Khi code khác tài liệu mới, nêu khác biệt và cập nhật tài liệu phù hợp; không sửa nghiệp vụ để ép code khớp docs.
- Không lấy nội dung cuộc trò chuyện cũ làm bằng chứng cho trạng thái code hoặc môi trường hiện tại.

## Bắt đầu tác vụ

1. Đọc `PROJECT_DOCS/README.md` và phần phù hợp trong `PROJECT_DOCS/workflow.md`.
2. Kiểm tra `git status --short`; giữ nguyên thay đổi có sẵn của người dùng.
3. Dùng `PROJECT_DOCS/code-map.md` để tìm điểm vào, rồi đọc source liên quan. Chỉ đọc các tài liệu luồng cần cho tác vụ.
4. Ghi rõ mục tiêu, hành vi mong muốn và phạm vi thay đổi. Việc nhỏ xử lý trực tiếp; việc dài dùng mẫu trong `PROJECT_DOCS/tasks/README.md`.

## Cách thực hiện

- Nếu yêu cầu là thảo luận/giải thích, giữ phạm vi đọc và phân tích. Nếu yêu cầu triển khai, làm đến khi có kết quả kiểm chứng được.
- Tự xử lý lựa chọn kỹ thuật thông thường trong phạm vi đã thống nhất. Hỏi khi thiếu quyết định nghiệp vụ ảnh hưởng kết quả; không hỏi lại quyền đã được giao.
- Lần theo cả FE, API, service, Celery, dữ liệu và tích hợp khi tác vụ đi qua nhiều tầng. `warehouse_id`, `zone_id`, `location.id` và `location_code` là các khái niệm khác nhau.
- Phân biệt chế độ chọn ô trên operator, `detail_type` trong DB và cấu hình kho manual; xem `PROJECT_DOCS/flows/inbound.md`.
- Tái sử dụng Axios, React Query, store, UI và cơ chế xác thực hiện có trước khi tạo cơ chế mới.
- Không đưa token, mật khẩu, dữ liệu `.env` hoặc thông tin kết nối chứa bí mật vào docs/log báo cáo. Tài liệu cấu hình chỉ nêu tên biến và ví dụ không có bí mật.
- Khi khảo sát/viết docs, không khởi động dịch vụ, tạo migration, gọi API ghi dữ liệu hay gửi lệnh robot. Với tác vụ vận hành, bám phạm vi người dùng giao và không tự phát lại lệnh cũ chưa xác định rõ.

## Kiểm chứng và kết thúc

- Chọn kiểm tra phù hợp thay đổi; phân biệt đọc code, kiểm thử giả lập và chạy tích hợp thật. Lệnh đúng cú pháp không đồng nghĩa dịch vụ đã chạy thành công.
- Trên PowerShell dùng `npm.cmd` nếu `npm.ps1` bị chặn. Đọc `PROJECT_DOCS/testing.md` trước khi chạy test; không giả định mọi test đều cách ly DB/Redis/RCS.
- API nhận lệnh, worker xử lý, RCS chấp nhận và robot hoàn thành là các mốc khác nhau. Không báo thành công vượt quá bằng chứng.
- Code trong Docker image không tự đồng bộ khi sửa file host hoặc chỉ restart container. Đọc `PROJECT_DOCS/runtime.md` khi thay đổi task/worker.
- Khi đổi API, quy tắc, điểm vào hoặc cách chạy: cập nhật trang tương ứng trong `PROJECT_DOCS/`; khi thêm/xóa/đổi tên file hoặc endpoint, chạy `python scripts/build_code_index.py`.
- Báo kết quả, kiểm tra đã thực sự chạy, phần chưa xác minh và thao tác áp dụng còn cần thiết. Cập nhật task note nếu có.

## Kiểm tra tài liệu

```powershell
python scripts/build_code_index.py --check
```

Lệnh chỉ đọc source và kiểm tra bộ tài liệu mới; không import ứng dụng hoặc kết nối dịch vụ.
