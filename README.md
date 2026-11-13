# Supra WMS

Hệ thống quản lý hàng hóa trong kho sản xuất chi tiết nhựa nhỏ, hỗ trợ luân chuyển hàng bằng AMR. Nghiệp vụ chính: nhập kho, xuất kho, tồn kho, kiểm kê, thống kê và cấu hình kho.

## Bắt đầu

- [Bộ tài liệu dự án](docs/README.md): điểm vào cho người tiếp nhận và AI agent.
- [Tổng quan hệ thống](docs/system-overview.md), [bản đồ source](docs/code-map.md), [danh mục chức năng](docs/feature-catalog.md).
- [Cách chạy và kiểm tra](docs/development.md).
- [Quy trình làm việc với AI](docs/ai-workflow.md), [hướng dẫn agent](AGENTS.md).
- [Thống kê và biểu đồ](docs/reporting/overview.md): phân hệ được khảo sát chi tiết đầu tiên.

Frontend: React + TypeScript + Vite. Backend: FastAPI + SQLAlchemy; PostgreSQL, Redis và Celery. Xem source và lockfile để biết phiên bản cụ thể.

## Phạm vi tài liệu

Bản nền ngày **2026-10-14**, đọc từ working tree, bao gồm thay đổi chưa commit. Đây là tài liệu đối chiếu source, chưa phải xác nhận tình trạng triển khai hoặc số liệu thực tế. Mức độ khảo sát từng phân hệ được ghi trong danh mục chức năng.

Ưu tiên đã xác nhận: xây docs trước; sau đó cải thiện cách trình bày biểu đồ và bổ sung chỉ số/báo cáo phục vụ cả quản lý kho và nhân viên vận hành. Luồng nhập/xuất đang ổn định theo người dùng.
