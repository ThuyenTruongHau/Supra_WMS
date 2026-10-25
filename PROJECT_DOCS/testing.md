# Chọn và ghi nhận kiểm tra

Mốc khảo sát: 20/10/2026. Trang này phân biệt lệnh có trong source với kết quả đã
thực sự quan sát. Không lấy kết quả của lần làm việc trước làm baseline hiện tại.

## Tài liệu và chỉ mục

Từ thư mục gốc, Python 3.10+ với Git có sẵn:

```powershell
python scripts/build_code_index.py
python scripts/build_code_index.py --check
git diff --check
```

Lệnh đầu ghi lại ba chỉ mục trong `PROJECT_DOCS/index/`; `--check` chỉ kiểm tra.
Script dùng AST/regex, không import ứng dụng, đọc `.env`, kết nối DB/Redis/RCS hoặc
đọc docs cũ. Kiểm tra link chỉ xét file mới trong root và `PROJECT_DOCS`.

Chỉ mục dựa vào `git ls-files --cached --others --exclude-standard`: file bị ignore
không được lập chỉ mục. Mở source khi cần xác nhận tất cả hàm, import hoặc logic.
Link `#L...` là vị trí lúc tạo chỉ mục và có thể thay đổi sau sửa code.

## Frontend

Nguồn lệnh: [package.json](../frontend/package.json).

```powershell
cd frontend
npm.cmd run test:robot
npm.cmd run build
npm.cmd run lint
```

- `test:robot` chạy `tests/robotStatus.test.mjs` bằng Node test runner. File này
  kiểm tra hàm dựng trạng thái, dùng dữ liệu giả lập, không gọi robot/server.
- **Đã chạy ngày 20/10/2026: 8/8 đạt.** Tên một số test còn chữ FK, nhưng dữ liệu
  kỳ vọng hiển thị hiện tại là FL 01/FL 02.
- `build` là `vite build`; không phải một lệnh typecheck toàn dự án riêng biệt.
- `lint` là ESLint toàn frontend. Không mặc định repo có script `npm test` chung.
- Các lệnh build/lint chưa chạy trong tác vụ dựng bộ tài liệu này.
- Test import file `.ts` trực tiếp; kiểm tra Node đang dùng nếu môi trường khác
  không chạy được cơ chế này. Repo chưa khai báo `engines` trong package hiện tại.

Nếu cần kiểm tra TypeScript riêng, cấu hình app nằm ở
[tsconfig.app.json](../frontend/tsconfig.app.json); có thể chạy compiler hiện cài:

```powershell
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json
```

Kết quả và các lỗi có sẵn cần ghi riêng với lỗi do thay đổi đang làm. Không sửa
hàng loạt lỗi ngoài phạm vi chỉ để làm một thay đổi nhỏ trông như đã qua kiểm tra.

## Backend

Các file `backend/test/test_*.py` hiện có các nhóm unittest; thư mục
`backend/tests` cũng có các hàm test riêng trên máy/repo tùy trạng thái Git.
Kiểm tra cách tổ chức và dependency thực tế trước khi chọn runner.

Ví dụ lệnh unittest sau khi đã đọc fixture và chọn môi trường cách ly:

```powershell
cd backend
.\.venv\Scripts\python.exe -m unittest test.test_robot_data test.test_warehouse_view_access -v
```

Đây là ví dụ lệnh, **chưa chạy lại trong đợt tài liệu này**. Các module này có fake
Redis/override dependency, nhưng cần đối chiếu code và fixture hiện tại khi chạy.

`test_inbound_robot_assignment.py` còn giả lập dispatcher theo cách chọn dòng cũ,
trong khi dispatcher hiện có truy vấn tên vị trí, gom nhóm và ghi Redis. Trước
khi chạy nhóm này, phải kiểm tra/cách ly những dependency mới; không coi patch
`apply_async` là đã cách ly mọi tác động của service.

Settings đọc biến môi trường tiến trình và `.env`. Khi kiểm tra cần ghi DB/Redis
đang dùng là môi trường nào, không công bố giá trị chứa bí mật. Không chạy toàn
bộ test với `.env` server thật chỉ vì tên thư mục là `test`.

## Kiểm tra theo loại thay đổi

| Thay đổi | Bằng chứng phù hợp |
| --- | --- |
| Tài liệu | Link tồn tại, chỉ mục khớp source, mô tả không vượt mức bằng chứng |
| Utility thuần | Ví dụ đầu vào/đầu ra và unit test theo quy tắc cần giữ |
| UI | Build nếu cần, mở màn hình, loading/rỗng/lỗi, bố cục và thao tác ảnh hưởng |
| API/service | Validation, quyền, tác động DB/cache/queue và hợp đồng với bên gọi |
| Celery | Param qua hàng đợi, worker tương thích, retry và môi trường thực thi |
| Robot | JSON ở đúng tầng, kết quả HTTP/nghiệp vụ RCS và callback theo orderId; chỉ xác nhận tích hợp khi thực sự đã quan sát |

Việc sửa docs không mặc định cần build ứng dụng hoặc chạy test có side effect.
Chọn kiểm tra theo thay đổi, không mặc định chạy mọi thứ cho mỗi tác vụ.

## Kiểm tra phần còn thiếu outbound ngày 21/10/2026

- Trong `backend`: `.\.venv\Scripts\python.exe -m unittest test.test_outbound_remaining_quantity test.test_masan_outbound_parse -q`:
  **17/17 đạt**. Module mới ép cấu hình kết nối về địa chỉ không sử dụng, tạo
  schema SQLite in-memory, fake cache và ICS; không chạy lifespan/worker.
  Bao phủ retry failed/cancelled, completed 7 còn 12, partial, chống gọi trùng,
  hết/clear/sai kho, Locator name/code, nhiều dòng 204 trên tồn 198, assign CC
  và API worker trả None. Đây chưa phải test khóa đồng thời trên PostgreSQL.
- Trong `frontend`: `npm.cmd run test:outbound` **5/5**, `npm.cmd run test:robot`
  **8/8**, `npm.cmd run build` **đạt**; build còn cảnh báo bundle lớn hiện có.
- Đã dùng **transaction READ ONLY trên DB thật** với biểu thức ORM mới: đơn
  29 còn đúng 12, ba đơn hôm qua còn 0 theo số lượng trong DB; không sửa dữ liệu
  hoặc gửi lại robot. Xem [task](tasks/2026-10-21-outbound-remaining-quantity.md).

## Return tại VT sau khi dọn CC ngày 21/10/2026

Trong `backend`:
`.\.venv\Scripts\python.exe -m unittest test.test_sorting_return_tasks -v`
**11/11 đạt** với SQLite in-memory, cache/ICS giả lập và địa chỉ dịch vụ không
sử dụng. Bao phủ CC trống, đúng kho/VT, return cancelled/issued/callback, tồn
đã clear/hết/chuyển đi, outbound chưa xác nhận, retry thành công, nhiều đơn
chung stock/task, đích sai, xác thực/validation và GET chỉ chạy SELECT.
FE `test:outbound` 5/5 (utility cũ và payload Execute), build và lint hook mới
đạt. Truy vấn READ ONLY trên DB thật tìm được task chờ VT14 → G366; API đang
chạy đã đăng ký route, Vite đang phục vụ hook mới. Chưa bấm Execute trên robot
thật. Xem [hồ sơ return VT14](tasks/2026-10-21-vt14-return-discovery.md).

Sau phản hồi FE vẫn không thấy return: đã sửa ánh xạ Zone.id/code bị đảo và
callback đóng picker xóa lựa chọn trên overview. Với Vite đang chạy, từ root:
`backend/.venv/Scripts/python.exe frontend/tests/outboundReturnBrowser.py -v`
**4/4 đạt**. Script dùng Playwright/Chromium đã cài trong môi trường backend,
chặn API/WS bằng dữ liệu giả lập; không dùng tài khoản hay gửi lệnh server.
Bao phủ hai đường vào popup, đúng/sai khu và tablet. Map drawing giả lập lỗi
404; chỉ kiểm tra luồng gọi lệnh, bảng return và nút Execute. FE build và
5 utility test outbound chạy lại đạt.

## Số xe CC sau khi hoàn tất phiên ngày 21/10/2026

Sau yêu cầu reset toàn bộ station, bổ sung test flag chặn phiên cũ mà không
chặn phiên mới: nhóm `test.test_completed_cc_cleanup` **17/17 đạt** trên host
và image mới với network none. Đã đối chiếu PostgreSQL/Redis thật sau reset:
28 location empty, 0 tồn active ở VT/CC, 0 cache gán xe/hàng chờ qua nhiều lượt
beat. Xem [hồ sơ reset](tasks/2026-10-21-full-vt-cc-reset.md).

`test.test_completed_cc_cleanup`: **16/16 đạt** bằng SQLite/cache giả lập.
Image worker mới chạy nhóm này cùng outbound remaining/parse và stocktake:
**47/47 đạt** với network none. Lua compare/replace/delete/TTL được kiểm tra
riêng trong Redis container tạm không có mạng. Đã cập nhật logic worker và thấy
log thực tế dọn 5 CC, 16 reverse key, lưu lịch sử CC cho 16 detail completed;
đối chiếu Redis/DB độc lập còn đúng các phiên đang chạy. Không dùng thao tác
confirm/dispatch/RCS thật để test. Xem
[hồ sơ số xe](tasks/2026-10-21-completed-cc-vehicle-cleanup.md).

## Kiểm kê ô trống ngày 21/10/2026

Trong `backend`: `.\.venv\Scripts\python.exe -m unittest test.test_stocktake_empty_location -q`
**14/14 đạt**, schema SQLite trong bộ nhớ, TestClient override dependency, không
chạy lifespan hay kết nối DB/Redis/RCS thật. Bao phủ tạo phiếu ở ô trống, thêm
SKU/lô, xác nhận mới kích hoạt tồn, không khôi phục tồn cũ đã clear, trùng, sai
kho, số 0, payload lỗi và API create → add → GET → confirm. Chưa kiểm thử khóa
đồng thời trên PostgreSQL. Build frontend đạt; kiểm tra TypeScript toàn dự án
còn lỗi ngoài phạm vi. Xem [luồng kiểm kê](flows/stocktake.md) và
[task](tasks/2026-10-21-stocktake-empty-location.md).

## Đồ thị map và tuyến đường A* ngày 23/10/2026

Trong `backend`: `.\.venv\Scripts\python.exe -m unittest test.test_map_route_algo -v`
**15/15 đạt**. Đồ thị giả lập, ZIP map mới nhất của warehouse 1/2/4 đọc chỉ đọc,
FastAPI tối giản với user admin giả lập và `map_graph_service.get` được patch;
không chạy lifespan, không kết nối DB/Redis/RCS. Bao phủ parse `nodeKeys`/`lineKeys`,
cạnh một chiều, chặn xuyên kệ, A* khớp Dijkstra (ngẫu nhiên và map thật),
Held-Karp khớp vét cạn, 2-opt, mã lỗi 400/404/422. `test.test_warehouse_view_access`
chạy lại **10/10 đạt**. Uvicorn dev đang chạy tự reload và log nạp đồ thị
warehouse 1 (1257 node, 3312 cạnh); chưa gọi endpoint route trên server thật.
Xem [luồng tuyến đường](flows/map-route.md).

Bổ sung API `distance` cùng ngày: nhóm trên tăng lên **19/19 đạt** (SQLite in-memory
cho bảng `location`). Gọi `calculate_distance` trên DB thật trong transaction READ ONLY:
3 cặp location warehouse 1 trả 53,5 m / 81,3 m / 25,0 m, mã không tồn tại báo lỗi.

Đổi quy tắc cùng ngày: được đi qua node kệ (`avoid_shelf_transit` mặc định tắt). Nhóm
`test.test_map_route_algo` **21/21 đạt**, `test.test_warehouse_view_access` **10/10**.
Chạy lại READ ONLY: 3 cặp trên không đổi; còn 26/1257 node không tới được (không có cạnh vào).

Ghi `distance` trong callback robot: `test.test_robot_distance_callback` **5/5 đạt**
(SQLite, patch `calculate_distance`, telemetry, cache, websocket, thông báo). Bao phủ
nhập 6→6→8→8 chỉ tính một lần, không trùng Transaction/History, giữ giá trị đã có,
lỗi tính (RouteUnreachable/RuntimeError) không làm hỏng callback; xuất tính một lần
mỗi cặp from/to và không tính lại ở callback sau. Cùng lượt: map route, sorting return,
robot data, warehouse view access — tổng **56/56 đạt**. `test.test_outbound_remaining_quantity`
đang **lỗi 11** (bind `Decimal` ở `sending_masan_outbound_task`, logic phân bổ) do thay đổi
có sẵn trong `masan_outbound_service.py` (sửa lúc 15:11, trước tác vụ này); chưa xử lý.

Báo cáo Excel nhập/xuất Masan: `test.test_masan_report_columns` **2/2 đạt** — số cột khớp header,
cột **Người nhập/xuất** và **Quãng đường (m)**. 24/10/2026 thêm cột **Pin bắt đầu/Pin kết thúc**
(sau "Thời gian kết thúc"; nhập lấy `inbound_order_detail.start_battery/end_battery`, xuất lấy
`outbound_order_allocation.start_battery/end_battery`) — vẫn **2/2 đạt**. Cột "Người xuất" của
báo cáo xuất đổi tên thành **Người chia** (dữ liệu vẫn từ `sorting_persons`).

Đổi `distance` lưu DB sang mét (trước đó chưa có bản ghi nào khác NULL, kiểm tra READ ONLY) và
báo cáo robot đếm theo lệnh robot, thêm lệnh hoàn trả: `test.test_robot_performance_report`
**2/2 đạt** (SQLite: lệnh nhập 7→8 tính 1 lần, lệnh xuất 3 allocation tính 1 lần, lệnh return,
loại kho khác và trạng thái 6). Cùng lượt callback distance, cột báo cáo Masan, map route —
**30/30 đạt**. Chạy truy vấn READ ONLY kho 1 tuần 17–23/10: 140 nhập, 103 xuất, 80 hoàn trả.

## Kiểm tra mẫu SO ngày 21/10/2026

Sau khi thêm chân trang ký **Người chia hàng**, đã gọi trực tiếp
`build_so_customer_sheet` bằng dữ liệu giả lập 0, 3 và 80 dòng, không import
ứng dụng hoặc kết nối DB/Redis/RCS. Workbook được lưu và đọc lại bằng openpyxl;
đã kiểm tra khổ A4 dọc, fit ngang một trang, chiều dọc nhiều trang, lặp tiêu đề,
lề ký tên, footer phải và định dạng/dữ liệu bảng. Cũng đã kiểm tra footer trong
XML của file `.xlsx`. Các kiểm tra này đạt; chưa render bằng Excel/LibreOffice
hoặc kiểm tra bản in thực tế. Xem [hướng dẫn SO](guides/outbound-fe.md).
