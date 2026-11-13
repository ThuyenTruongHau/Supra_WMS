# Ghi chú cập nhật code Supra WMS trên Docker

Thực hiện sau khi đã lưu các thay đổi code trong dự án.
Mở PowerShell tại `C:\software_TDS\Supra_WMS` và bảo đảm Docker Desktop đang chạy.

## 1. Cập nhật cả backend và frontend

```powershell
cd C:\software_TDS\Supra_WMS

# Build image chứa code mới
docker compose --env-file .env.docker build backend frontend

# Chỉ thực hiện bước này khi build thành công
docker compose --env-file .env.docker up -d --no-build --wait --wait-timeout 180

# Kiểm tra trạng thái các container
docker compose --env-file .env.docker ps
```

Lệnh `up` cập nhật backend, frontend và các Celery dùng chung image backend.
Các dịch vụ PostgreSQL/Redis có cấu hình không đổi tiếp tục dùng volume dữ liệu hiện tại.
Sau khi hoàn tất, nhấn **Ctrl+F5** trên trình duyệt để tải giao diện mới.

## 2. Chỉ cập nhật frontend

```powershell
cd C:\software_TDS\Supra_WMS
docker compose --env-file .env.docker up -d --build --no-deps --wait --wait-timeout 180 frontend
```

Sau đó nhấn **Ctrl+F5** trên trình duyệt.

## 3. Chỉ cập nhật backend

```powershell
cd C:\software_TDS\Supra_WMS
docker compose --env-file .env.docker build backend

# Chỉ thực hiện bước này khi build thành công
docker compose --env-file .env.docker up -d --no-build --wait --wait-timeout 180
docker compose --env-file .env.docker ps
```

Chạy `up` cho cả project để các worker và scheduler Celery cũng nhận image backend mới.

## 4. Xem log khi có lỗi

```powershell
docker compose --env-file .env.docker logs --tail 100 backend frontend
docker compose --env-file .env.docker logs --tail 100 celery-worker-logic celery-worker-status celery-beat
```

## 5. Lưu ý khi cập nhật

- Chọn thời điểm tạm ngừng thao tác kho và không có tác vụ robot đang chạy khi cập nhật backend.
- Build phải thành công trước khi chạy bước cập nhật container.
- Docker nhận code mới qua image đã build; chỉ restart container sẽ tiếp tục dùng image cũ.
- Nếu thay đổi cấu trúc bảng database, cần sao lưu và chạy migration tương ứng theo thay đổi đó.
- Dữ liệu PostgreSQL/Redis nằm trong volume. Không dùng `docker compose down -v` hoặc xóa volume khi cần giữ dữ liệu.
- Giữ kín `.env.docker` và `backend/.env` vì có thông tin đăng nhập và khóa bí mật.

Địa chỉ phần mềm: **https://192.168.50.200:5173**.

Hướng dẫn triển khai, kết nối pgAdmin và tự khởi động cùng Windows:
[docker-windows.md](docker-windows.md).



Mở Databases → masan_wms → Schemas → public → Tables để xem bảng. Nhấp phải database → Query Tool để chạy SQL.