# Chạy và kiểm tra dự án

Ngày đối chiếu cấu hình: **2026-10-14**. Các lệnh dưới đây là hướng dẫn theo source; chưa chạy ứng dụng hoặc cài lại dependency trong đợt xây docs.

## Cấu hình và dependency

- Backend đọc `.env` theo thư mục làm việc qua [Settings](../backend/app/core/config.py); chạy lệnh backend tại `backend/`.
- Docker backend cài [requirements.txt](../backend/requirements.txt). Môi trường uv có [pyproject.toml](../backend/pyproject.toml) và `uv.lock`; chưa xác nhận hai nguồn đồng bộ hoặc có thể cài sạch.
- `requirements.txt`: `packaging` (Kombu Redis transport) và pin `kombu<5.7` để tương thích `celery[redis]` + `redis==5.0.8`.
- Frontend có `package-lock.json`, scripts trong [package.json](../frontend/package.json); Docker dùng Node 22 và `npm ci`.
- Không sao chép giá trị thật của `.env` vào tài liệu, screenshot hoặc báo cáo lỗi.

| Biến/nhóm biến | Vai trò |
|---|---|
| `DATABASE_URL` | PostgreSQL đích của backend/worker |
| `REDIS_URL`, `REDIS_KEY_PREFIX`, `REDIS_CACHE_TTL` | Redis ứng dụng và cache |
| `CELERY_BROKER_URL`, `CELERY_BROKER_RESULT_URL` | Broker và result backend; dùng đúng tên `RESULT_URL` theo code |
| `SECRET_KEY`, nhóm thời hạn token | Xác thực |
| `ICS_BASE_URL`, process code nhập/xuất | Kết nối điều phối AMR |
| `ZONE_STORAGE`, `ZONE_SPLIT` và các zone khác | Phạm vi dữ liệu nghiệp vụ/reporting |
| `VITE_API_URL` | Axios base URL; không đặt thì dùng origin và proxy khi dev |
| `VITE_SNAPSHOT_MODE` | Bật adapter demo offline |

## Chạy local

Chỉ dùng môi trường phát triển có database/Redis riêng và cấu hình phù hợp. Khởi chạy worker/Beat có thể xử lý công việc và ghi snapshot; không dùng cấu hình vận hành để thử UI.

Backend, tại `backend/`, sau khi chuẩn bị Python và dependency:

```powershell
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

API có `/`, `/health`, tài liệu FastAPI mặc định `/docs`, route nghiệp vụ dưới `/api/v1`. Lifespan gọi Redis và khởi động WebSocket manager; `/health` chỉ trả trạng thái tĩnh, không phải kiểm tra đầy đủ DB/worker/AMR.

Frontend, tại `frontend/`:

```powershell
npm ci
npm run dev
```

[vite.config.ts](../frontend/vite.config.ts) bật HTTPS, proxy `/api` đến backend cấu hình trong file và `/task` đến orchestrator riêng. Kiểm tra đích proxy và `VITE_API_URL` trước khi dùng; không mặc định dev server đang gọi backend local.

## Worker và lịch snapshot

[Celery config](../backend/app/core/celery_app.py) khai báo queue `logic`, `status` và lịch Beat. Task `dashboard.snapshot_inventory_daily` chạy theo lịch **23:00**, timezone `Asia/Ho_Chi_Minh` (một bản ghi/kho/ngày trong `inventory_daily_snapshot`). API báo cáo chỉ đọc snapshot; không ghi snapshot khi mở trang.

Lệnh cấu hình tương ứng trên môi trường hỗ trợ worker Celery, tại `backend/`, mỗi tiến trình một terminal:

```text
celery -A app.core.celery_app.celery_app worker -Q logic --loglevel=INFO
celery -A app.core.celery_app.celery_app worker -Q status --loglevel=INFO
celery -A app.core.celery_app.celery_app beat --loglevel=INFO
```

Đây là tham chiếu tiến trình, chưa kiểm tra chạy native Windows. Worker Linux trong Docker là cách được thể hiện trong source. Chỉ chạy một scheduler Beat cho cùng lịch/môi trường khi vận hành; không tự bật thêm để debug biểu đồ.

## Docker Compose (local)

[Compose](../docker-compose.yml): `db`, `redis` (có healthcheck), `backend`, `frontend`, `celery-worker-logic`, `celery-worker-status`, **`celery-beat`**. Trong container, compose **ghi đè**:

- `DATABASE_URL=postgresql://postgres:thado123@db:5432/WMS_db`
- `CELERY_BROKER_URL` / `CELERY_BROKER_RESULT_URL` → `redis://redis:6379/1` và `/2`

Chạy từ thư mục `Supra_WMS` (không phải `backend/`):

```powershell
docker compose build --no-cache backend
docker compose up -d redis db backend celery-worker-logic celery-worker-status celery-beat
```

**Kiểm tra Celery sau khi up**

1. `docker compose ps` — logic, status, beat **Up** (không Restarting).
2. `docker compose logs celery-worker-logic --tail 20` — `celery@logic ready`.
3. `docker compose logs celery-beat --tail 20` — beat đã start.
4. `docker compose exec celery-worker-logic celery -A app.core.celery_app.celery_app inspect ping`
5. Gọi thử snapshot: `docker compose exec celery-worker-logic celery -A app.core.celery_app.celery_app call dashboard.snapshot_inventory_daily`

Chỉ **một** tiến trình Beat cho môi trường. Lịch snapshot: **23:00** `Asia/Ho_Chi_Minh`. Chi tiết lịch sử triển khai: [CELERY_DEPLOY.md](../CELERY_DEPLOY.md) mục trạng thái hiện tại.

## Kiểm tra theo loại thay đổi

| Loại | Kiểm tra phù hợp |
|---|---|
| Docs | Đường dẫn/liên kết, đối chiếu source, `git diff --check` |
| UI/types frontend | Tại `frontend/`: `npm run build`; `npm run lint`; xem thực tế responsive, loading, empty, error |
| API/service Python | Compile file liên quan; kiểm tra endpoint/response và trường hợp biên trên môi trường test |
| Công thức thống kê | Test dữ liệu nhỏ có kết quả tính tay, ranh giới thời gian/zone/status; đối chiếu API và UI |
| Snapshot/migration | Kiểm tra trên DB test: chạy lại, unique key, lịch chạy, dữ liệu thiếu; có kế hoạch chuyển dữ liệu |

Ví dụ compile một service, tại `backend/`:

```powershell
python -m py_compile app/modules/warehouse/dashboard/dashboard_trend_service.py
```

Compile chỉ kiểm tra cú pháp, không chứng minh query SQL đúng. Từ **2026-10-16** có test reporting dùng `unittest` chuẩn, không cần cài pytest. Chạy tại `backend/`:

```powershell
python -m unittest discover -s tests -p 'test_dashboard_*.py' -v
```

Test kỳ lịch không phụ thuộc DB; test Top biên dịch SQL mà không kết nối DB; test service/API mock các lần đọc và dùng cấu hình test, không truy cập DB/Redis/AMR thật. Xem [validation reporting](reporting/validation.md).

Ngoài ra có [test export SO](../backend/tests/test_masan_outbound_so_export.py). Nếu môi trường đã có pytest và dependency cần thiết, có thể chạy tại `backend/`:

```powershell
python -m pytest tests/test_masan_outbound_so_export.py
```

Frontend chưa có script `test` trong package hiện tại. Không báo “tests pass” khi chỉ build/lint hoặc chỉ đọc source.

`build:snapshot` dùng [vite.config.snapshot.ts](../frontend/vite.config.snapshot.ts), xuất ra thư mục `HTML` ở ngoài repo này; không dùng như kiểm tra mặc định cho một thay đổi báo cáo. Demo offline và API thật phải được phân biệt khi nghiệm thu.
