# Chạy Supra WMS bằng Docker trên Windows

Bộ này dành cho máy chủ LAN `192.168.50.200`, tự chạy **sau khi đăng nhập Windows**.
Các lệnh thực hiện tại `C:\software_TDS\Supra_WMS` trong PowerShell.

## Trạng thái triển khai ngày 13/11/2026

Đã chuyển hệ thống sang project `supra-wms`: BE, FE, PostgreSQL 18, Redis và ba
Celery đều chạy với healthcheck. Địa chỉ sử dụng: `https://192.168.50.200:5173`.
Đã kiểm tra HTTPS, API có xác thực, WebSocket, xuất PDF và gửi/nhận tác vụ tính toán
qua cả hai hàng đợi `logic`/`status`, không gửi lệnh thử tới robot.

Bản sao lưu chuyển chính thức: `backups/cutover-20261113-final`, gồm 37 bảng
PostgreSQL và 15 khóa Redis DB 0. Số dòng từng bảng và checksum đã được đối chiếu.
Ba Celery cũ đã dừng và được đặt `restart=no`. PostgreSQL Windows, Redis và dữ liệu
project cũ được giữ lại để đối chiếu/khôi phục; không bật lại Celery cũ cùng bộ mới.

Docker Desktop hiện đã bật `AutoStart`; các dịch vụ mới có `restart: unless-stopped`.
Chưa thực hiện reboot Windows. Chứng chỉ công khai để cài cho máy LAN nằm tại
`wms-server.crt`; private key chỉ nằm trong volume frontend.

**Khi vận hành hiện tại, dùng các lệnh ở mục “Vận hành và rollback”.** Các bước
sao lưu legacy/phục hồi bên dưới là quy trình chuyển lần đầu, không chạy lại trên
database Docker đang có dữ liệu. Các script Windows dùng `backend/.env` vẫn trỏ
về nguồn PostgreSQL/Redis cũ; ứng dụng Docker dùng địa chỉ nội bộ được Compose ghi đè.
Nhật ký kiểm tra và thông tin triển khai nằm trong `.docker/deployment-*.log`,
`.docker/deployment-status.json` và `.docker/deployment-containers.txt`.
Kết nối TCP từ container tới ICS `192.168.50.250:7000` đã đạt. Orchestrator riêng
trên Windows cổng `6868` hiện chưa chạy; luồng `/qrtablet` cần dịch vụ này để gọi
`/task/add-task`.

## Thành phần và địa chỉ

| Thành phần | Trong Docker | Truy cập từ Windows/LAN |
|---|---|---|
| Frontend React + nginx | HTTPS 443 | `https://192.168.50.200:5173` |
| Backend FastAPI | `backend:8000` | `http://192.168.50.200:8001` (API/callback ICS) |
| PostgreSQL 18 | `db:5432`, database `masan_wms` | `127.0.0.1:15432` (quản trị trên máy chủ) |
| Redis 7.4 | `redis:6379` | Không công bố cổng Redis |
| Celery logic/status/beat | Cùng database và Redis với backend | Không cần cổng LAN |

Frontend dùng cùng origin cho `/api/` và WebSocket; nginx chuyển tiếp tới backend.
IP máy khách không cần thêm vào `.env`. HTTPS giữ được khả năng quét QR bằng camera
trên máy khác khi chứng chỉ được thiết bị tin cậy.

### Kết nối pgAdmin 4 trên máy chủ Windows

Mở pgAdmin 4, nhấp phải **Servers → Register → Server**. Trong General, đặt tên
`Supra WMS Docker`. Trong Connection, nhập:

| Trường | Giá trị |
|---|---|
| Host name/address | `127.0.0.1` |
| Port | `15432` |
| Maintenance database | `masan_wms` |
| Username | `wms` (hoặc `POSTGRES_USER` trong `.env.docker`) |
| Password | Giá trị `POSTGRES_PASSWORD` trong `.env.docker` |

Bấm Save, mở **Databases → masan_wms → Schemas → public → Tables**, hoặc nhấp
phải database và chọn **Query Tool** để chạy SQL. Cổng này chỉ lắng nghe loopback
trên máy chủ; máy LAN không truy cập trực tiếp được. `192.168.50.200:5432` vẫn là
PostgreSQL Windows cũ. Đổi cổng bằng `POSTGRES_ADMIN_PORT` trong `.env.docker`;
thay đổi port cần tạo lại container DB, giữ nguyên volume dữ liệu.

`backend/.env` tiếp tục cung cấp khóa JWT, địa chỉ ICS và cấu hình kho.
Compose ghi đè địa chỉ database/Redis sang tên dịch vụ Docker và đặt `DEBUG=false`.
`ICS_BASE_URL` vẫn là địa chỉ robot/ICS ngoài Docker, hiện là `http://192.168.50.250`.
Script chuẩn bị tạo `.env.docker` với mật khẩu database ngẫu nhiên; giữ kín file này.
Không cần đổi `.env` đang phục vụ hệ thống cũ.

Project mới có tên `supra-wms`, dùng volume riêng so với project cũ `supra_wms`.
PostgreSQL hiện tại trên Windows là 18.6 nên bản Docker dùng PostgreSQL 18;
không đưa dữ liệu này vào image PostgreSQL 16 của Compose cũ.

## 1. Chuẩn bị khi phần mềm cũ vẫn đang chạy

Yêu cầu: Docker Desktop chạy Linux containers/WSL 2, có Internet cho lần build đầu.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\docker\Prepare-WmsDocker.ps1 -Build
```

Lệnh tạo cấu hình nếu chưa có và build hai image `supra-wms-backend:local`,
`supra-wms-frontend:local`. Không khởi động container ứng dụng và không dừng bản cũ.
Backend đã kèm Chromium và thư viện hệ thống để xuất picking list PDF.
Dependency Kombu được khóa ở `5.6.2`, tương thích với Celery `5.4.0` và Redis client
`5.0.8` đang dùng. Không nâng riêng Kombu mà chưa kiểm tra Redis transport.
Build kiểm tra khả năng tạo Redis client; khi start, hai worker phải trả lời ping
healthcheck trước khi scheduler được phép khởi động.

Có thể sao lưu thử mà không dừng bản cũ:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\docker\Backup-WmsLegacy.ps1
```

Backup nằm trong `backups\legacy-<thời gian>`, gồm PostgreSQL custom dump, Redis DB 0,
file map/upload/storage, số dòng từng bảng và checksum. Script dùng PostgreSQL 18
`pg_dump.exe` và Python từ `backend\.venv`, không in mật khẩu ra dòng lệnh.
PostgreSQL dump và số dòng được lấy từ cùng một snapshot transaction.
Backup trực tiếp lúc chạy chỉ dành cho diễn tập; DB và Redis không có chung transaction.
Chỉ backup khi đã dừng toàn bộ nguồn ghi mới dùng để chuyển chính thức.

Để kiểm chứng đóng gói bằng backup thử vừa tạo:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\docker\Verify-WmsDocker.ps1 -BackupDirectory .\backups\legacy-YYYYMMDD-HHMMSS
```

Script tạo project diễn tập riêng, dùng cổng loopback `15173`/`18001`, phục hồi dữ liệu,
kiểm tra HTTPS/API/WebSocket/PDF rồi tạo lại container để kiểm tra dữ liệu còn nguyên.
Không chạy Celery hoặc gọi ICS. Kết thúc sẽ xóa container/network diễn tập; volume thử
được giữ lại và có tiền tố project `supra-wms-verify-...`, tách khỏi volume vận hành.

## 2. Chuyển chính thức vào thời điểm cho phép dừng tạm

1. Thông báo ngừng thao tác nhập/xuất kho, đóng frontend cũ/ngăn người dùng tạo lệnh.
2. Dừng scheduler cũ để không sinh thêm công việc:

   ```powershell
   docker stop -t 60 wms-celery-beat
   ```

3. Chờ các tác vụ robot đang chạy và callback hoàn tất; kiểm tra Celery không còn
   active/reserved/scheduled, queue `logic`/`status` rỗng và không còn unacknowledged.
   Có thể đọc trạng thái worker cũ bằng:

   ```powershell
   docker exec wms-celery-logic celery -A app.core.celery_app.celery_app inspect active
   docker exec wms-celery-logic celery -A app.core.celery_app.celery_app inspect reserved
   docker exec wms-celery-logic celery -A app.core.celery_app.celery_app inspect scheduled
   ```

   Chưa chuyển nếu còn tác vụ robot đang dang dở. Snapshot Redis chỉ mang DB 0
   (trạng thái/cache kho), không mang DB 1 (broker) hoặc DB 2 (kết quả).
   Script backup chính thức từ chối nếu còn queue/unacknowledged trong broker.

4. Dừng nhẹ nhàng worker cũ, backend Python và frontend Vite. Với BE/FE chạy bằng
   terminal, dùng Ctrl+C tại đúng terminal; nếu do service/task quản lý, dừng cơ chế đó.
   Không kill toàn bộ Python/Node trên máy.

   ```powershell
   docker stop -t 300 wms-celery-logic wms-celery-status
   docker update --restart=no wms-celery-beat wms-celery-logic wms-celery-status
   ```

   Tắt cơ chế tự mở BE/FE cũ nếu đã cấu hình trước đây. Bản mới dùng lại cổng
   `5173` và `8001`. Không chạy đồng thời hai bộ worker/scheduler.

5. Sao lưu cuối, sau khi tất cả nguồn ghi đã dừng:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\docker\Backup-WmsLegacy.ps1 -WritersStopped
   ```

   `-WritersStopped` là xác nhận của người vận hành, không tự dừng dịch vụ.

6. Phục hồi vào database Docker mới, thay đường dẫn backup bên dưới bằng đường dẫn thật:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\docker\Restore-WmsDocker.ps1 -BackupDirectory .\backups\legacy-YYYYMMDD-HHMMSS
   ```

   Script chỉ chạy DB/Redis, kiểm tra checksum, từ chối ghi đè DB/Redis đã có dữ liệu,
   dùng `pg_restore` trong một transaction, so sánh số dòng của toàn bộ bảng, phục hồi
   Redis DB 0 và kiểm tra các file upload/map đang bind mount từ Windows.
   Script chưa khởi động API hoặc worker. Không cần chạy Alembic cho bản sao đã có schema.
   Nếu validation lỗi, dừng tại đây và đọc lỗi trước khi khởi động.

7. Khởi động bản Docker:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\docker\Start-WmsDocker.ps1
   docker compose --env-file .env.docker ps
   ```

   Script không build lại và từ chối chạy ứng dụng khi DB chưa có bảng.
   Kiểm tra đăng nhập, dữ liệu tồn, bản đồ kho, xuất PDF và WebSocket từ một máy LAN
   trước khi cho vận hành lại. Kiểm tra kết nối ICS và callback về cổng `8001`.

PostgreSQL Windows và Redis cũ có thể giữ nguyên phục vụ đối chiếu/rollback; DB/Redis
mới không chiếm cổng host `5432`/`6379`. PostgreSQL Docker chỉ mở `127.0.0.1:15432`
để quản trị trên Windows. Chưa xóa dữ liệu hoặc volume cũ.

## 3. Tự chạy sau khi đăng nhập Windows

Sau khi đã chuyển và chạy ổn định:

1. Mở **Docker Desktop → Settings → General**.
2. Bật **Start Docker Desktop when you sign in to your computer** rồi áp dụng thay đổi.
3. Kiểm tra Windows **Settings → Apps → Startup** không tắt Docker Desktop.
4. Giữ máy chủ ở chế độ không tự Sleep khi cần các máy LAN truy cập.

Các dịch vụ có `restart: unless-stopped`. Sau khi đăng nhập, Docker Engine lên thì
các container đã tạo/chạy sẽ tự chạy lại; không cần mở VS Code, terminal, npm hoặc uvicorn.
Database/Redis dùng volume để giữ dữ liệu qua việc khởi động lại máy và tạo lại container.
Nếu chủ động `docker compose stop` thì container sẽ giữ trạng thái dừng;
chạy `Start-WmsDocker.ps1` để mở lại. Nếu `docker compose down` đã xóa container,
cũng phải chạy lại script start để tạo lại chúng.

Kiểm chứng bằng lần reboot có kế hoạch, đăng nhập Windows, đợi Docker Desktop sẵn sàng,
mở `https://192.168.50.200:5173` từ máy khác rồi xem `docker compose --env-file .env.docker ps`.
Tài liệu Docker: [tự chạy Docker Desktop khi đăng nhập](https://docs.docker.com/desktop/settings-and-maintenance/settings/)
và [restart policy](https://docs.docker.com/engine/containers/start-containers-automatically/).

## HTTPS, camera và mạng LAN

Frontend tạo một chứng chỉ nội bộ ở lần chạy đầu và giữ trong volume `frontend_tls`.
Thiết bị truy cập cần tin cậy chứng chỉ để dùng camera ổn định. Xuất chứng chỉ:

```powershell
docker compose --env-file .env.docker cp frontend:/etc/nginx/tls/server.crt .\wms-server.crt
```

Mang `wms-server.crt` tới các máy khách qua kênh tin cậy. Với Windows, cài vào
**Trusted Root Certification Authorities** của tài khoản dùng phần mềm, hoặc chạy
`certutil -user -addstore Root .\wms-server.crt` trên chính máy khách đó.
Chỉ chia sẻ file `.crt`; giữ kín private key trong volume. Tablet/điện thoại cần
cài và bật tin cậy chứng chỉ theo hệ điều hành của thiết bị.
Có thể thay bằng chứng chỉ do CA nội bộ cấp, cùng tên `server.crt`/`server.key`.
Chứng chỉ tự tạo có hạn 825 ngày; khi gia hạn/thay IP, thay chứng chỉ rồi restart frontend.

Giữ IP `192.168.50.200` cố định. Nếu Windows Firewall đang chặn, quản trị viên có thể
cho phép TCP `5173` (frontend) và `8001` (API/callback) từ subnet LAN `192.168.50.0/24`.
Không cần mở PostgreSQL/Redis ra LAN.

Luồng `/qrtablet` còn gọi orchestrator ngoài WMS qua `/task/`. Nginx chuyển tới
`host.docker.internal:6868` theo `.env.docker`. Nếu dùng chức năng này, orchestrator
phải chạy và cho phép kết nối từ Docker; nếu ở máy khác, đổi `ORCHESTRATOR_HOST`.
Bộ này không tự đóng gói orchestrator vì source của nó không nằm trong dự án.

## Vận hành và rollback

```powershell
# Tình trạng và log (không in toàn bộ config vì có secret)
docker compose --env-file .env.docker ps
docker compose --env-file .env.docker logs --tail 100 backend frontend
docker compose --env-file .env.docker logs --tail 100 celery-worker-logic celery-worker-status

# Dừng hoặc mở lại ứng dụng
docker compose --env-file .env.docker stop
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\docker\Start-WmsDocker.ps1
```

Không dùng `down -v`, `docker volume prune`, hoặc Factory Reset Docker Desktop với
dữ liệu cần giữ. Volume không thay cho bản sao lưu ở ổ đĩa khác.
Backup legacy chỉ đọc PostgreSQL/Redis cũ; sau chuyển phải sao lưu dữ liệu từ container mới.

Nếu cần quay lại ngay trước khi phát sinh ghi mới: dừng toàn bộ project `supra-wms`,
mở lại BE/FE cũ, `docker start` ba container Celery cũ và trả restart policy về
`unless-stopped`. Nếu bản Docker đã phát sinh giao dịch mới, phải đối soát/chuyển dữ
liệu mới trước; không bật lại database cũ như thể vẫn còn đồng bộ.

Giữ nguyên `backend/.env`, `.env.docker`, thư mục map/upload/storage và các bản backup
khi chuyển máy. Image không chứa dữ liệu database hoặc các secret này.
Có thể dùng `docker image save -o <file.tar> supra-wms-backend:local supra-wms-frontend:local postgres:18-alpine redis:7.4-alpine`
để mang image sang máy khác; dữ liệu vẫn phải được sao lưu/phục hồi riêng.
