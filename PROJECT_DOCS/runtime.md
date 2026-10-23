# Chạy và kiểm tra môi trường

Mức bằng chứng: **đọc cấu hình trong repo** ngày 20/10/2026. Các lệnh dưới là
hướng dẫn có điều kiện; không phải xác nhận dịch vụ trên máy/server đã được chạy.
Không đọc hoặc sao chép giá trị bí mật từ `.env` vào bộ tài liệu này.

## Chọn một cách chạy backend

| Cách chạy | API | Worker | Điều cần đối chiếu |
| --- | --- | --- | --- |
| Host | Uvicorn trên Windows | Host hoặc Docker | API và worker phải dùng đúng DB/Redis, prefix và phiên bản code |
| Compose | `backend`, map host 8001 → container 8000 | Hai worker và beat trong Compose | Địa chỉ dịch vụ bên trong Docker khác địa chỉ nhìn từ host/trình duyệt |

Không khởi động thêm backend Docker trên cùng cổng 8001 khi backend host đã chiếm cổng.

## Frontend dev

Từ thư mục gốc, cài dependency bằng lockfile khi cần:

```powershell
cd frontend
npm.cmd ci
npm.cmd run dev
```

[vite.config.ts](../frontend/vite.config.ts) bật HTTPS, host mạng và proxy:

| Đường dẫn trên FE dev | Đích cấu hình |
| --- | --- |
| `/api` (bao gồm WebSocket) | `http://localhost:8001` |
| `/task` | `http://localhost:6868` |

`localhost` ở đích proxy là máy chạy Vite. Dùng URL Local/Network mà terminal Vite
in ra; cổng dev có thể đổi nếu cổng mặc định đã bận.

[axiosInstance.ts](../frontend/src/api/axiosInstance.ts) dùng URL tương đối trong
dev. Bản build production mới dùng `VITE_API_URL` nếu được cấu hình. Thay biến VITE
cho production cần build lại; không coi chỉnh `.env` sau build là đã đổi bundle.

## Backend host

Manifest ở [pyproject.toml](../backend/pyproject.toml),
[requirements.txt](../backend/requirements.txt); có `uv.lock`. Docker backend
hiện dùng Python 3.12 và cài từ requirements, trong khi pyproject khai báo dải
Python `>=3.10,<3.14`. Khi cần đổi dependency phải kiểm tra cả hai manifest.

Ví dụ PowerShell từ thư mục gốc, sau khi đã chuẩn bị Python và cấu hình local:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

Nếu đã có `.venv` phù hợp, dùng lại thay vì tạo lại. Các lệnh cài/start ở trên
không được thực hiện tự động trong tác vụ dựng tài liệu.

Settings đọc `.env` theo working directory và tên biến không phân biệt hoa/thường.
Do đó chạy backend từ `backend/`; không mặc định `.env` ở root được sử dụng.
`DEBUG` phải là giá trị bool mà Settings chấp nhận, ví dụ `true`/`false`.
Biến môi trường tiến trình có thể ghi đè file `.env`.

Các địa chỉ kiểm tra API host:

- `http://localhost:8001/docs`: Swagger nếu app khởi động thành công.
- `GET /health`: trả trạng thái đơn giản; không phải kiểm tra đầy đủ DB/worker/RCS.
- `GET /metrics`: được Instrumentator gắn ở code khởi tạo.

App gọi Redis ping và khởi động WebSocket manager trong lifespan. Khi không lên
API, đọc lỗi startup trước khi quy mọi vấn đề về endpoint đang thử.

## Nhóm biến cấu hình cần đối chiếu

Nguồn: [config.py](../backend/app/core/config.py),
[warehouseMode.ts](../frontend/src/config/warehouseMode.ts),
[sendCallerAddTasks.ts](../frontend/src/utils/sendCallerAddTasks.ts).

| Nhóm | Tên biến |
| --- | --- |
| Backend/cơ sở dữ liệu | `APP_NAME`, `DEBUG`, `DATABASE_URL` |
| Phiên đăng nhập | `SECRET_KEY`, `ALGORITHM`, `ACCESS_TOKEN_EXPIRE_MINUTES`, `REFRESH_TOKEN_EXPIRE_MINUTES` |
| Cache | `REDIS_URL`, `REDIS_KEY_PREFIX`, `REDIS_CACHE_TTL` |
| Hàng đợi | `CELERY_BROKER_URL`, `CELERY_BROKER_RESULT_URL` |
| Robot | `ICS_BASE_URL`, `INBOUND_PROCESS_CODE`, `OUTBOUND_PROCESS_CODE`, `ROBOT_DATA_TTL_SECONDS` |
| Phân vùng/chế độ backend | Các `ZONE_*`, `MANUAL_WAREHOUSE_IDS`, cấu hình hạn sử dụng trong Settings |
| FE chế độ kho | `VITE_INBOUND_MANUAL_WAREHOUSES`, `VITE_OUTBOUND_MANUAL_WAREHOUSES` |
| FE production/orchestrator | `VITE_API_URL`, `VITE_TASK_ADD_URL`, `VITE_TASK_ADD_MOVE_MODE` |

Không ghi lại giá trị secret hay connection string chứa mật khẩu. Danh sách này
không thay thế toàn bộ schema Settings hoặc mọi biến VITE được dùng trong code.

## Celery

Các lệnh tương ứng cấu hình task app:

```powershell
# Trong backend, với môi trường Python đã cài dependency.
.\.venv\Scripts\python.exe -m celery -A app.core.celery_app.celery_app worker -Q logic --loglevel=INFO --pool=solo -n logic@%h
.\.venv\Scripts\python.exe -m celery -A app.core.celery_app.celery_app worker -Q status --loglevel=INFO --pool=solo -n status@%h
```

`--pool=solo` là cách chạy local một process để kiểm tra thủ công trên Windows;
chưa chạy xác minh trong đợt này, không mô tả tương đương tải/concurrency Docker.
Hai lệnh chạy ở hai terminal khác nhau nếu chọn worker host. Xem beat schedule
trong [celery_app.py](../backend/app/core/celery_app.py) trước khi bật beat.

`DEBUG=true` chỉ ảnh hưởng các đường gọi `run_logic_task`; dispatcher nhập Masan
có `apply_async` trực tiếp nên vẫn cần worker cho phần đó.

## Docker Compose và cập nhật code

Nguồn: [docker-compose.yml](../docker-compose.yml),
[Dockerfile backend](../backend/Dockerfile), [Dockerfile frontend](../frontend/Dockerfile).

- Backend và các worker/beat dùng image `wms-backend:latest` theo Compose.
- API `8001:8000`; frontend `5173:80`; Redis `6379:6379`; PostgreSQL `5432:5432`.
- Backend image `COPY` source vào image; volume hiện khai báo log và dữ liệu import,
  không bind-mount toàn bộ source Python.
- Worker/beat có override broker Redis DB 1 và result DB 2 trong Compose. Phải đối
  chiếu backend host/API và cache URL riêng; không mặc định cùng URL là cùng vai trò.
- Frontend Docker được serve qua Nginx HTTP. HTTPS/proxy của Vite không đi vào bản
  production này. Nginx hiện không khai báo proxy `/api` hay `/task` trong file repo.

Ví dụ cập nhật riêng worker logic, sau khi phạm vi vận hành đã được giao và đã
kiểm tra công việc đang chạy:

```powershell
docker compose build backend
docker compose up -d --no-deps --force-recreate celery-worker-logic
```

Chỉ `docker restart` không thay code đã đóng trong image. Khi sửa code dùng chung
API/status worker/beat, xác định những process nào cũng phải dùng phiên bản mới;
không suy ra cập nhật logic worker là đã cập nhật cả hệ thống.

## Đọc log và kiểm tra trạng thái

Các lệnh đọc hữu ích từ root:

```powershell
git status --short
docker compose ps
docker logs --since 15m --tail 200 wms-celery-logic
docker logs --since 15m --tail 200 wms-celery-status
docker exec wms-celery-logic celery -A app.core.celery_app.celery_app inspect active --timeout 3 --json
docker exec wms-celery-logic celery -A app.core.celery_app.celery_app inspect reserved --timeout 3 --json
```

Đọc file tại `backend/logs/main/`, `backend/logs/celery/` và stdout container. Lỗi
trước khi task vào hàm, ví dụ sai keyword argument, có thể chỉ có trong stdout
Celery. Logger riêng của hàm chưa chắc ghi được lỗi đó.

Với robot, đối chiếu `job_id` → `detail_id` → `orderId`, JSON request, phản hồi ICS
và callback. Không suy từ thông báo FE/API 202 rằng RCS đã chấp nhận hoặc robot đã
hoàn thành. Log từ container có thể khác múi giờ hiển thị trên Windows; ghi rõ khi quy đổi.

## Migration và môi trường thực

Source migration nằm trong [backend/alembic](../backend/alembic). Trước thay đổi DB
phải xác định DB đích và migration hiện tại. Tác vụ viết tài liệu này không kết nối
DB, không chạy Alembic, không restart dịch vụ và không xác nhận topology server.
