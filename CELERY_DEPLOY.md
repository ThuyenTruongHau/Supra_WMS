# Kế hoạch triển khai Celery cho Supra WMS

> Tài liệu tham chiếu khi deploy Celery worker cùng hệ thống hiện tại.
> Trạng thái tại thời điểm viết: `redis` **đã có** trong `docker-compose.yml`, backend **chưa có bất kỳ code Celery nào**.

---

## 0. Checklist tổng quan

| # | Việc cần làm | File | Loại |
|---|---|---|---|
| 1 | Thêm dependency `celery[redis]`, `redis`, `flower` | `backend/requirements.txt` | Sửa |
| 2 | Đồng bộ dependency cho môi trường dev | `backend/pyproject.toml` | Sửa |
| 3 | Thêm setting broker / result backend | `backend/app/core/config.py` | Sửa |
| 4 | Tạo Celery app + config + logging signal | `backend/app/core/celery_app.py` | **Mới** |
| 5 | Thêm `db_session()` context manager cho worker | `backend/app/core/database.py` | Sửa |
| 6 | Tách logic HTTP khỏi `HTTPException` | `backend/app/modules/robot/robot_service.py` | Sửa |
| 7 | Viết task đầu tiên (push ICS) | `backend/app/modules/robot/robot_task.py` | **Mới** |
| 8 | Gọi task từ API (thay vì chạy đồng bộ) | `backend/app/modules/robot/robot_api.py` | Sửa |
| 9 | Healthcheck redis + `image:` name + service worker | `docker-compose.yml` | Sửa |
| 10 | Thêm biến môi trường Celery | `backend/.env` | Sửa |
| 11 | **Chốt `DATABASE_URL`** (xem mục "Cần quyết định") | `backend/.env` | Quyết định |

`Dockerfile` **không cần sửa gì** — image đã chứa toàn bộ source, chỉ cần override `command` trong compose.

---

## Cần quyết định trước khi bắt đầu

### A. Postgres: container hay server ngoài?

`backend/.env` hiện tại:

```
DATABASE_URL=postgresql://postgres:postgres123@10.73.231.5:5432/vcc_wms
```

Nhưng `docker-compose.yml` tạo Postgres với `postgres/thado123` và DB `WMS_db`. Nghĩa là **service `db` trong compose đang chạy mà không ai dùng** — backend đi ra Postgres ngoài. Đây là lỗi có sẵn, không phải do Celery, nhưng thêm worker sẽ nhân đôi vấn đề vì worker dùng chung `.env`.

Chọn một:

- **Dùng container `db`** → sửa `.env`: `DATABASE_URL=postgresql://postgres:thado123@db:5432/WMS_db`
- **Giữ Postgres ngoài** → xóa service `db` và `postgres_data` volume khỏi compose, bỏ luôn `depends_on: db` ở backend/worker.

### B. Worker chạy trong docker hay trên host?

Quyết định giá trị `CELERY_BROKER_URL`:

- Trong docker network → `redis://redis:6379/0`
- Trên host (như `uvicorn` đang chạy tay hiện tại) → `redis://10.73.231.5:6379/0`

### C. Bảo mật Redis

`redis` đang publish `6379:6379` ra ngoài **không có password**. Nếu máy này truy cập được từ mạng khác thì:

- Bỏ `ports:` (chỉ dùng nội bộ docker network), hoặc
- Thêm `command: redis-server --appendonly yes --requirepass <password>` và đổi URL thành `redis://:<password>@redis:6379/0`

---

## 1. `backend/requirements.txt`

File này là thứ `Dockerfile` thực sự dùng để cài (`COPY requirements.txt .` → `pip install -r requirements.txt`), nên **bắt buộc** phải có.

Thêm vào cuối:

```txt
celery[redis]==5.4.0
redis==5.0.8
flower==2.0.1
```

`flower` là tùy chọn — UI monitor task ở port 5555.

---

## 2. `backend/pyproject.toml`

Thêm vào `dependencies` để môi trường dev (`uv`) không lệch với container:

```toml
dependencies = [
    # ... các dependency hiện có ...
    "celery[redis]==5.4.0",
    "redis==5.0.8",
    "flower==2.0.1",
]
```

Sau đó chạy `uv lock` để cập nhật `uv.lock`.

---

## 3. `backend/app/core/config.py`

Thêm vào class `Settings` (sau block `#ICS`):

```python
    #Celery
    celery_broker_url: str = "redis://localhost:6379/0"
    celery_result_backend: str = "redis://localhost:6379/1"
```

`Config.case_sensitive = False` đã có sẵn nên biến env viết HOA vẫn map đúng.

Dùng DB số khác nhau cho broker (`/0`) và result backend (`/1`) để tránh key lẫn nhau khi debug.

---

## 4. Tạo mới `backend/app/core/celery_app.py`

```python
from celery import Celery
from celery.signals import worker_process_init

from app.core.config import settings
from app.core.logger import setup_logger

celery_app = Celery(
    "wms",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=[
        "app.modules.robot.robot_task",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="Asia/Ho_Chi_Minh",
    enable_utc=False,
    # Chỉ ack sau khi task xong -> task không bị mất nếu worker chết giữa đường
    task_acks_late=True,
    # Không cho worker giành sẵn nhiều task (quan trọng với task chậm/gọi HTTP)
    worker_prefetch_multiplier=1,
    task_time_limit=300,
    task_soft_time_limit=270,
    result_expires=3600,
    broker_connection_retry_on_startup=True,
)


@worker_process_init.connect
def init_worker_logging(**_kwargs):
    """Worker không import main.py nên phải tự gắn handler cho logger 'main'."""
    setup_logger(
        name="main",
        log_level="INFO",
        service_name="celery",
        log_dir="logs/celery",
    )
```

### Lưu ý về `include`

Mọi module chứa task **phải** được liệt kê ở đây. Thiếu thì worker báo:

```
Received unregistered task of type 'robot.push_task_to_ics'
```

### Lưu ý về logging

`robot_service.py` lấy logger bằng `get_logger("main")`, mà handler chỉ được gắn khi `main.py` gọi `setup_logger(name="main", ...)`. Worker **không** import `main.py`, nên nếu thiếu signal `worker_process_init` ở trên thì log của task sẽ không ghi vào file, chỉ hiện ở stdout của Celery.

---

## 5. `backend/app/core/database.py`

`get_db()` là generator dependency của FastAPI, **worker không dùng được**. Thêm context manager riêng:

```python
from contextlib import contextmanager


@contextmanager
def db_session():
    """Session DB cho code ngoài FastAPI (Celery task, script, CLI)."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

Nhớ thêm `from contextlib import contextmanager` ở đầu file.

### Cảnh báo connection pool

`engine` hiện đang là `pool_size=10, max_overflow=20`. Celery prefork tạo **pool riêng cho mỗi child process**, nên `--concurrency=4` có thể sinh tới ~120 connection, cộng thêm phần của API. Postgres mặc định `max_connections=100`.

Xử lý: giữ `--concurrency` ở 2-4, hoặc tách engine riêng cho worker với pool nhỏ hơn:

```python
import os

_IS_WORKER = os.getenv("RUN_MODE") == "worker"

engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    pool_size=2 if _IS_WORKER else 10,
    max_overflow=3 if _IS_WORKER else 20,
)
```

Rồi set `RUN_MODE=worker` trong `environment:` của service worker.

---

## 6. `backend/app/modules/robot/robot_service.py`

Vấn đề hiện tại: `add_task()` bắt lỗi httpx rồi `raise HTTPException(502/503)`. Trong Celery worker, `HTTPException` **không có ý nghĩa gì** — chỉ là exception thường. Retry vẫn chạy được nhưng logic không sạch.

Tách phần gọi HTTP thuần ra, để API layer tự map sang HTTP status:

```python
class IcsError(Exception):
    """Lỗi khi giao tiếp với ICS. Dùng chung cho cả API và Celery task."""

    def __init__(self, message: str, *, retryable: bool = True):
        super().__init__(message)
        self.retryable = retryable


class TaskStatusService:
    def add_task(self, payload: dict) -> dict:
        try:
            with httpx.Client(timeout=httpx.Timeout(5.0)) as client:
                response = client.post(ICS_ADD_TASK_PATH, json=payload)
                response.raise_for_status()
                data = response.json()
            logger.info(f"ICS addTask response: {data}")
            return data
        except httpx.HTTPStatusError as e:
            logger.error(f"ICS HTTP error: {e.response.text}")
            # 4xx từ ICS = payload sai, retry vô nghĩa
            retryable = e.response.status_code >= 500
            raise IcsError("ICS server error", retryable=retryable) from e
        except httpx.RequestError as e:
            logger.error(f"ICS connection error: {e}")
            raise IcsError("Cannot reach ICS server", retryable=True) from e
```

Sau đó ở API layer bắt `IcsError` và đổi thành `HTTPException(502)` / `HTTPException(503)`.

Bỏ luôn `self.current = None` trong `__init__` — `task_status_service` là singleton dùng chung, giữ state per-request trên đó sẽ bị race condition, và với Celery prefork thì càng khó debug.

---

## 7. Tạo mới `backend/app/modules/robot/robot_task.py`

```python
from app.core.celery_app import celery_app
from app.core.database import db_session
from app.core.logger import get_logger
from app.modules.robot.robot_service import IcsError, task_status_service

logger = get_logger("main")


@celery_app.task(
    name="robot.push_task_to_ics",
    bind=True,
    max_retries=3,
    default_retry_delay=10,
    autoretry_for=(),
)
def push_task_to_ics(self, payload: dict) -> dict:
    """Đẩy task sang ICS. Retry với backoff nếu lỗi mạng / 5xx."""
    try:
        return task_status_service.add_task(payload)
    except IcsError as exc:
        if not exc.retryable:
            logger.error(f"ICS từ chối payload, không retry: {payload}")
            raise
        countdown = 10 * (2 ** self.request.retries)  # 10s, 20s, 40s
        raise self.retry(exc=exc, countdown=countdown)


@celery_app.task(name="robot.persist_task_status")
def persist_task_status(payload: dict) -> int:
    """Ghi trạng thái nhận từ webhook ICS vào DB (chạy nền)."""
    with db_session() as db:
        record = task_status_service.receive_task_status(db, payload)
        return record.id
```

### Nguyên tắc viết task

- **Không** truyền object SQLAlchemy hay `Session` làm argument — chỉ truyền kiểu JSON được (id, dict, str). Task đi qua broker dưới dạng JSON.
- Mỗi task tự mở session bằng `db_session()`, không nhận từ ngoài.
- Task nên **idempotent** vì `task_acks_late=True` có thể khiến task chạy lại sau khi worker chết.

---

## 8. `backend/app/modules/robot/robot_api.py`

Chuyển endpoint webhook sang chế độ "nhận rồi trả ngay, xử lý nền". ICS sẽ không phải chờ DB write:

```python
from typing import Any

from fastapi import APIRouter, HTTPException, status

from app.modules.robot.robot_task import persist_task_status

router = APIRouter(tags=["Robot"])


@router.post("/receive-status", status_code=status.HTTP_202_ACCEPTED)
def receive_task_status(payload: dict[str, Any]) -> dict[str, Any]:
    if not payload.get("orderId"):
        raise HTTPException(status_code=400, detail="orderId is required")

    result = persist_task_status.delay(payload)
    return {"accepted": True, "task_id": result.id}
```

### Cân nhắc trước khi đổi

Endpoint hiện tại trả `201` kèm toàn bộ record đã ghi. Nếu phía ICS **dựa vào response body** đó thì **đừng đổi** — giữ nguyên xử lý đồng bộ, và chỉ dùng Celery cho `push_task_to_ics` (hướng WMS → ICS) thôi.

Nếu ICS chỉ cần biết "đã nhận" thì `202` + xử lý nền là lựa chọn tốt hơn: webhook phản hồi nhanh, DB chậm không làm ICS timeout và retry dồn.

---

## 9. `docker-compose.yml`

Ba thay đổi: healthcheck cho `redis`, đặt `image:` name cho `backend` để worker dùng chung, thêm service worker.

```yaml
services:
  db:
    image: postgres:16-alpine
    container_name: wms-db
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: thado123
      POSTGRES_DB: WMS_db
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d WMS_db"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: redis-wms
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    image: wms-backend:latest
    container_name: wms-backend
    ports:
      - "8000:8000"
    env_file:
      - ./backend/.env
    volumes:
      - ./backend/logs:/app/logs
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped

  celery-worker:
    image: wms-backend:latest
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: wms-celery-worker
    command: >
      celery -A app.core.celery_app.celery_app worker
      --loglevel=INFO
      --concurrency=4
      --max-tasks-per-child=200
    environment:
      RUN_MODE: worker
    env_file:
      - ./backend/.env
    volumes:
      - ./backend/logs:/app/logs
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
      args:
        VITE_API_URL: http://localhost:8000
    container_name: wms-frontend
    ports:
      - "3000:80"
    depends_on:
      - backend
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
```

### Vì sao đặt `image: wms-backend:latest` ở cả hai

Docker Compose sẽ build **một lần** và tái sử dụng image, thay vì build 2 image y hệt nhau. Worker chỉ khác `command`.

### `--max-tasks-per-child=200`

Restart child process sau 200 task để chống memory leak tích lũy — hữu ích với task gọi HTTP nhiều.

---

## 10. Service tùy chọn: beat và flower

Thêm nếu cần task định kỳ (đối soát trạng thái robot, tổng hợp tồn kho, dọn log...) hoặc UI monitor.

```yaml
  celery-beat:
    image: wms-backend:latest
    container_name: wms-celery-beat
    command: >
      celery -A app.core.celery_app.celery_app beat
      --loglevel=INFO
      --schedule=/tmp/celerybeat-schedule
    env_file:
      - ./backend/.env
    depends_on:
      redis:
        condition: service_healthy
    restart: unless-stopped

  flower:
    image: wms-backend:latest
    container_name: wms-flower
    command: celery -A app.core.celery_app.celery_app flower --port=5555
    ports:
      - "5555:5555"
    env_file:
      - ./backend/.env
    depends_on:
      redis:
        condition: service_healthy
    restart: unless-stopped
```

> **Quan trọng:** `celery-beat` chỉ được chạy **đúng 1 replica**. Nhân đôi sẽ bắn task trùng.

### Khai báo schedule

Thêm vào `celery_app.conf` trong `celery_app.py`:

```python
from celery.schedules import crontab

celery_app.conf.beat_schedule = {
    "reconcile-robot-status-every-5-min": {
        "task": "robot.reconcile_status",
        "schedule": crontab(minute="*/5"),
    },
}
```

`flower` không có auth mặc định — thêm `--basic-auth=user:pass` nếu expose ra mạng.

---

## 11. `backend/.env`

Thêm:

```
# Celery
CELERY_BROKER_URL=redis://redis:6379/0
CELERY_RESULT_BACKEND=redis://redis:6379/1
```

Nếu worker chạy trên host thay vì trong docker, đổi `redis` thành `10.73.231.5`.

Và **chốt lại `DATABASE_URL`** theo quyết định ở mục A phía trên.

---

## Lệnh deploy

```powershell
# Build lại image backend (đã có celery trong requirements)
docker compose build backend

# Khởi động
docker compose up -d db redis backend celery-worker

# Theo dõi worker
docker compose logs -f celery-worker
```

### Xác nhận worker OK

Worker khởi động thành công sẽ in banner Celery kèm danh sách task:

```
[tasks]
  . robot.persist_task_status
  . robot.push_task_to_ics
```

Nếu task không xuất hiện ở đó → `include` trong `celery_app.py` sai.

### Kiểm tra kết nối broker

```powershell
docker compose exec celery-worker celery -A app.core.celery_app.celery_app inspect ping
```

Kết quả mong đợi: `-> celery@<hostname>: OK  pong`

### Xem queue đang tồn bao nhiêu task

```powershell
docker compose exec redis redis-cli LLEN celery
```

### Test task thủ công

```powershell
docker compose exec backend python -c "from app.modules.robot.robot_task import persist_task_status; print(persist_task_status.delay({'orderId': 'TEST-001', 'status': '1'}).id)"
```

---

## Lỗi thường gặp

| Triệu chứng | Nguyên nhân | Cách sửa |
|---|---|---|
| `Received unregistered task of type '...'` | Module task không có trong `include` | Thêm vào `include` của `celery_app` |
| `Error 111 connecting to redis:6379` | Sai host broker | Trong docker dùng `redis`, ngoài docker dùng IP |
| `consumer: Cannot connect to redis://...` lặp vô hạn | Redis chưa sẵn sàng | Thêm healthcheck + `condition: service_healthy` |
| `FATAL: too many connections for role` | Pool × concurrency vượt `max_connections` | Giảm `--concurrency` hoặc pool riêng cho worker (mục 5) |
| Task chạy nhưng không có log trong `logs/` | Worker chưa init logger `"main"` | Thêm signal `worker_process_init` (mục 4) |
| `WorkerLostError` / bị kill | Hết RAM hoặc task quá lâu | Giảm concurrency, chỉnh `task_time_limit` |
| Task chạy 2 lần | `task_acks_late=True` + worker restart | Viết task idempotent |
| `TypeError: Object of type Session is not JSON serializable` | Truyền `Session`/model làm argument | Chỉ truyền id/dict, mở session trong task |

---

## Thứ tự thực hiện đề xuất

1. Chốt hai quyết định ở mục "Cần quyết định" (`DATABASE_URL`, nơi chạy worker).
2. Làm mục 1 → 5 (dependency, config, celery app, db session). Chưa cần task thật.
3. Sửa `docker-compose.yml` (mục 9), build, up, xác nhận worker `inspect ping` OK với task rỗng.
4. Sau khi hạ tầng chạy ổn mới viết task thật (mục 6 → 8).
5. Thêm `beat` / `flower` khi có nhu cầu thật (mục 10).

Tách bước 3 và 4 giúp phân biệt rõ lỗi hạ tầng với lỗi logic.
