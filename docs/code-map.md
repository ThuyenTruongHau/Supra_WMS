# Bản đồ source

Ngày đối chiếu: **2026-10-14**. Mô tả thư mục và file đầu mối; không phải danh sách mọi file.

## Cấu trúc chính

```text
Supra_WMS/
  AGENTS.md                 Hướng dẫn agent
  docs/                     Tài liệu dự án và reporting
  backend/
    app/
      main.py               FastAPI entrypoint, đăng ký router
      core/                 Settings, DB, auth dependencies, Redis, Celery, logger
      modules/
        auth/               Người dùng, vai trò, quyền
        warehouse/          Các phân hệ kho và reporting
        robot/              Nhiệm vụ robot, callback, task nền
        masan/              Import/export và tích hợp theo định dạng riêng
      socket/               WebSocket manager
      static/               Tài nguyên nằm trong app
    alembic/                Migration và đăng ký model metadata
    docs/                   Ghi chú SQL, mẫu phiếu HTML/PDF
    scripts/                Script tạo mẫu in
    tests/                  Test reporting và export SO
    test/                   Thư mục riêng, hiện thấy __init__.py
    static/                 Tài nguyên ngoài app
    requirements.txt        Nguồn dependency Docker backend
    pyproject.toml          Metadata/dependency cho môi trường Python
    uv.lock                 Lockfile uv
  frontend/
    src/
      routes/               Route và route guard
      pages/                Màn hình, bao gồm qrtablet và report
      hooks/                React Query và hook nghiệp vụ
      api/                  HTTP client và lời gọi API
      types/                Hợp đồng TypeScript
      components/           UI, layout, auth, bản đồ kho
      store/                Zustand: auth và kho đang chọn
      utils/                Định dạng, query options, auth helpers
      snapshot/             Adapter dữ liệu demo offline
      config/, constants/   Cấu hình và hằng số frontend
      i18n/, assets/        Ngôn ngữ và tài nguyên
      layouts/              Thư mục layout khác; route chính dùng components/layout
    docs/                   Từ điển nhãn trạng thái
    public/                 Tài nguyên phục vụ trực tiếp
    vite.config.ts          HTTPS dev server, alias, proxy
    vite.config.snapshot.ts Build demo offline
  opt/monitoring/           Cấu hình Prometheus/Grafana
  docker-compose.yml        DB, Redis, backend, frontend, hai Celery worker
  CELERY_DEPLOY.md           Kế hoạch lịch sử, có nội dung đã cũ
```

`node_modules/`, `.venv/`, `dist/`, `__pycache__/`, `logs/` là dependency/đầu ra runtime. Không dùng chúng làm nơi sửa tính năng hoặc mô tả từng file. `Map_VCC.zip` chưa được khảo sát.

## Quy ước module backend đã quan sát

| File | Vai trò thường thấy |
|---|---|
| `*_api.py` | Route, dependency, query/body và response model |
| `*_schema.py` | Pydantic request/response |
| `*_service.py` | Truy vấn và xử lý nghiệp vụ |
| `*_model.py` | SQLAlchemy model, quan hệ, computed properties |
| `*_celery_task.py` | Điểm vào task, tạo session, gọi service |

Đây là cấu trúc quan sát, không phải mọi module đều giống nhau. Reporting tách thêm các service theo loại thống kê. Thư mục thông báo hiện viết là `notificcation`; giữ đúng tên khi tìm source.

## Điểm vào theo công việc

| Công việc | File đầu mối |
|---|---|
| Route/màn hình | [routes/index.tsx](../frontend/src/routes/index.tsx) |
| Kho đang chọn | [useAppStore.ts](../frontend/src/store/useAppStore.ts) |
| HTTP, Bearer token, refresh, demo adapter | [axiosInstance.ts](../frontend/src/api/axiosInstance.ts) |
| Quyền phía UI | [AdminRoute.tsx](../frontend/src/components/auth/AdminRoute.tsx), [ProtectedRoute.tsx](../frontend/src/components/auth/ProtectedRoute.tsx) |
| Quyền API | [dependencies.py](../backend/app/core/dependencies.py) |
| Biểu đồ báo cáo `/report` | [ReportPage.tsx](../frontend/src/pages/ReportPage.tsx) |
| Bản đồ kho `/dashboard` | [DashboardPage.tsx](../frontend/src/pages/DashboardPage.tsx), [WarehouseMapCanvas.tsx](../frontend/src/components/shared/WarehouseMapCanvas.tsx) |
| API báo cáo | [dashboard_api.py](../backend/app/modules/warehouse/dashboard/dashboard_api.py) |
| Tồn và đơn vị | [item_stock_model.py](../backend/app/modules/warehouse/item_stock/item_stock_model.py), [item_model.py](../backend/app/modules/warehouse/item/item_model.py) |
| Task định kỳ | [celery_app.py](../backend/app/core/celery_app.py) |
| Model/migration | [alembic/env.py](../backend/alembic/env.py), [versions](../backend/alembic/versions/) |

Các file reporting được mô tả đến cấp trách nhiệm trong [reporting overview](reporting/overview.md). Từ **2026-10-16**, [dashboard_trend_periods.py](../backend/app/modules/warehouse/dashboard/dashboard_trend_periods.py) tách riêng cách chia kỳ tuần/tháng/quý/năm để kiểm tra mà không cần DB. Khi thêm/di chuyển file đầu mối hoặc đổi route, cập nhật bản đồ này.
