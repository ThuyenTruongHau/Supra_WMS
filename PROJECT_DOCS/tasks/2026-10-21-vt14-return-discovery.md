# VT14 còn hàng nhưng không thấy lệnh return

Ngày: 21/10/2026. Trạng thái: đã sửa BE/FE, kiểm chứng đọc dữ liệu và UI với
API giả lập; chưa phát robot.

## Bằng chứng và nguyên nhân

- Đơn 32 `OUT-20261021-115720`, detail 723: outbound allocation 639 đã completed,
  lấy 3 đơn vị SKU `02XX00281` từ pallet ban đầu 8.
- Stock 381 còn 5 tại VT14. Return allocation 640 và task
  `TDS_Return_378f2e81` (1125) đã có, initialize, đường VT14 → G366
  (`10002603,10000860`).
- Cache assignment CC của kho 1 đã trống. Hook FE cũ suy order IDs từ CC lines,
  nên bỏ sót đơn chứa return sau khi xác nhận lấy hàng và dọn assignment.
- Không cần clear tồn hay tạo lại task return.

### Bổ sung khi người dùng báo vẫn không thấy lệnh

- Lần đầu chỉ kiểm tra service và FE nạp source nên bỏ sót ánh xạ khu. Đọc DB
  thật xác nhận Zone.id 9 chứa VT11–VT14 nhưng code là `Zone_sorting_2`;
  Zone.id 8 chứa VT21–VT24 nhưng code là `Zone_sorting_1`. FE hardcode ngược,
  nên chọn VT14 vẫn truy vấn khu không có return. Đã sửa hai code trong
  `outboundMapZones.ts`, giữ nguyên tên hiển thị và cặp VT–CC.
- Trang `/export` còn lỗi chuyển popup: picker gọi onSelect rồi onClose;
  onClose của trang tổng quan xóa cả sortingZone và dispatchVt. Đã dành
  onClose cho hủy; từng parent quản lý chuyển popup sau khi chọn. Trang chi
  tiết khu đóng riêng picker và giữ dispatchVt.

## Thay đổi

- GET `/api/v1/masan/outbound-orders/sorting-zone/return-tasks` nhận warehouse_id
  và Zone.code của VT, yêu cầu quyền outbound:read. Service mới đọc task,
  allocation và stock trực tiếp; không phụ thuộc cache/queue.
- Chỉ trả task/allocations initialize có tồn active tại đúng VT, outbound
  liên quan completed và đầu/đích hợp lệ. Failed/cancelled attempt cũ không
  chặn retry; còn outbound chưa xác nhận trên cùng stock vẫn chặn return.
- Giữ toàn bộ allocation của task, kể cả task liên quan nhiều đơn.
- Hook FE poll 5 giây theo kho/VT khi modal mở; bảng Hàng quay đầu và Execute
  dùng payload hiện có. Không thay API dispatch, callback, worker hay schema DB.

## Kiểm chứng

- `test.test_sorting_return_tasks`: 11/11 đạt, SQLite và dịch vụ giả lập.
  API test kiểm tra chưa đăng nhập, payload query lỗi và chỉ có SELECT.
- `npm.cmd run test:outbound`: 5/5 đạt; `npm.cmd run build`: đạt (cảnh báo
  bundle lớn hiện có). Lint hook mới đạt.
- READ ONLY trên PostgreSQL thật: Zone_sorting_2 trả đúng task 1125,
  allocation 640, 5 đơn vị VT14 → G366; Zone_sorting_1 không có return sẵn sàng.
- GET OpenAPI của API 8001 xác nhận route đã nạp; nguồn Vite 5173 xác nhận
  hook mới đã được phục vụ. Sau sửa bổ sung, Vite qua địa chỉ LAN cũng phục
  vụ đúng ánh xạ 8 → Zone_sorting_1, 9 → Zone_sorting_2.
- `backend/.venv/Scripts/python.exe frontend/tests/outboundReturnBrowser.py -v`
  từ root: **4/4 đạt**. Chromium chạy giao diện thật trên Vite với API/WS giả
  lập: mở từ chi tiết khu và tổng quan, chọn VT14 thấy task/5/VT14/G366/Execute;
  khu 8 không lẫn return; tablet 1024×768 nhìn thấy nút. Request return dùng
  đúng mã khu, không có request ghi. Map drawing được giả lập lỗi 404 và nằm
  ngoài phạm vi kiểm tra này; chưa gửi robot hay nghiệm thu API bằng phiên
  đăng nhập thật. Build và 5 utility test outbound chạy lại đạt.
- Không ghi DB/Redis, không gửi lệnh RCS trong tác vụ này.

## Áp dụng và thao tác

API host đang reload và Vite đã cập nhật source; không cần migration/rebuild
worker cho thay đổi chỉ đọc này. Tải lại FE, mở Gọi lệnh → VT14 → Hàng quay đầu,
kiểm tra dòng VT14 → G366 rồi bấm Execute khi sẵn sàng trả pallet.

Tài liệu đã cập nhật: luồng outbound, hướng dẫn FE, code-map, testing, Q18 và
chỉ mục source/API.
