# Supra WMS

Ứng dụng quản lý kho với giao diện admin/operator, luồng QR tablet, backend FastAPI,
tác vụ Celery và tích hợp robot RCS/ICS.

Từ **20/10/2026**, dùng bộ tài liệu mới tại [PROJECT_DOCS](PROJECT_DOCS/README.md).
Bộ này được xây dựng lại trực tiếp từ source code cho một người làm việc cùng Codex.
Các docs cũ được giữ nguyên như dữ liệu lưu trữ và không được dùng làm nguồn tham chiếu.

## Bắt đầu

1. [Cách đọc và tình trạng kiểm chứng](PROJECT_DOCS/README.md).
2. [Quy trình làm việc với Codex](PROJECT_DOCS/workflow.md).
3. [Kiến trúc](PROJECT_DOCS/architecture.md) và [tìm file để sửa](PROJECT_DOCS/code-map.md).
4. [Chạy, cấu hình và xem log](PROJECT_DOCS/runtime.md).
5. [Chức năng](PROJECT_DOCS/features.md), [luồng nhập kho](PROJECT_DOCS/flows/inbound.md)
   và [tích hợp robot](PROJECT_DOCS/flows/robot.md).
6. Xuất kho: [luồng backend](PROJECT_DOCS/flows/outbound.md) và
   [hướng dẫn thao tác frontend](PROJECT_DOCS/guides/outbound-fe.md).

## Tra cứu source

- [Backend và các hàm/lớp](PROJECT_DOCS/index/backend.md).
- [Frontend và các khai báo/export](PROJECT_DOCS/index/frontend.md).
- [Các HTTP/WebSocket route khai báo trong backend](PROJECT_DOCS/index/api.md).

Tạo lại chỉ mục bằng `python scripts/build_code_index.py`; kiểm tra bằng cách thêm
`--check`. Script dùng thư viện chuẩn Python, không import hay chạy ứng dụng.

Chỉ dẫn dành cho Codex nằm trong [AGENTS.md](AGENTS.md). Các điều cần làm rõ được
ghi tại [PROJECT_DOCS/questions.md](PROJECT_DOCS/questions.md).
