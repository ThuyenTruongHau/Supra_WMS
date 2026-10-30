# Chỉnh sửa hàng tại buffer chờ nhập

Trên `/import`, nhấp đúp ô buffer → **Chỉnh sửa** ở dòng hàng → sửa số lượng, LOT, hạn dùng → **Lưu**. Có thể sửa sau khi gọi robot nếu hàng vẫn ở buffer. Mỗi lần chỉ sửa một ItemStock; không đổi SKU, vị trí, đơn vị hoặc trạng thái.

## API

Tái sử dụng API hiện có. Công nhân nhập hàng có quyền `inbound:update` được sửa qua nhánh buffer trong kho được gán; không cần cấp quyền sửa tồn chung `item_stock:update`. Tài khoản đã có quyền `item_stock:update` (hoặc admin/operator theo RBAC hiện tại) giữ nguyên quyền truy cập.

```http
PATCH /api/v1/item-stocks/123?inbound_buffer_location_id=101
Content-Type: application/json

{"quantity":90,"lot_number_from":"071026","lot_number_to":"081026","expiry_date":null}
```

FE chỉ gửi trường đã thay đổi. LOT được chuẩn hóa bằng parser hiện có; xóa LOT bằng cách gửi cả `lot_number_from` và `lot_number_to` bằng `null`. Hạn dùng là chuỗi tối đa 50 ký tự, cho phép `null`. Response giữ nguyên `ItemStockResponse`.

Query `inbound_buffer_location_id` kích hoạt kiểm tra buffer và đồng bộ đơn nhập. Request không có query này giữ hành vi sửa ItemStock cũ.

Quyền `inbound:update` chỉ áp dụng khi có query này và kho của vị trí thuộc danh sách kho được gán cho người dùng. Nhánh nghiệp vụ tiếp tục kiểm tra stock thực sự nằm tại buffer đó, chưa nhập xong và chỉ cho sửa số lượng/LOT/hạn dùng. Request sửa ItemStock chung vẫn yêu cầu `item_stock:update`; quyền nhập hàng không cho đổi SKU, vị trí, đơn vị hay trạng thái tồn.

- Kiểm tra stock active còn nằm đúng buffer đầu vào của dòng nhập chưa completed, trong kho của đơn và zone thuộc `settings.zone_inbound` (khớp code hoặc name).
- Chỉ chấp nhận số lượng nguyên từ 0 đến 999999999 theo đơn vị stock. Dùng hệ số quy đổi hiện có để đổi về đơn vị allocation; kết quả phải là số nguyên và nằm trong giới hạn Integer.
- Chỉ sửa stock có duy nhất một inbound allocation đúng dòng nhập, không có liên kết cha/con, không phải stock virtual/cấp con.
- Stock, allocation và tổng lượng các task chưa kết thúc của dòng nhập được cập nhật trong một transaction. Task completed/failed/cancelled giữ nguyên. Lượng 0 không hủy task.
- Không gửi lại ICS: payload tạo lệnh robot hiện chỉ chứa tuyến đi và thông tin điều phối, không chứa quantity.
- FE làm mới thông tin vị trí, bản đồ, danh sách đơn và lệnh gọi sau lưu.

## Lỗi và xử lý đồng thời

- `400`: trường không được phép, số lượng không hợp lệ hoặc không quy đổi chính xác.
- `403`: không có quyền phù hợp (`item_stock:update`, hoặc `inbound:update` cho nhánh buffer) hoặc kho không được gán.
- `409`, `detail.code=inbound_buffer_changed`: hàng đã rời buffer, inactive, không còn dòng nhập phù hợp hoặc đã completed. FE đóng biểu mẫu, tải lại vị trí và hiện thông báo.
- `409`, `detail.code=inbound_stock_conflict`: không phải buffer nhập, liên kết phân cấp hoặc allocation không duy nhất. FE giữ biểu mẫu và hiện lý do.
- `422`: request không hợp lệ theo schema hiện có.

Sửa buffer, tạo task nhập và callback cùng khóa dòng `InboundOrderDetail` bằng `SELECT … FOR UPDATE OF inbound_order_detail`, rồi đọc lại dữ liệu. Nhánh sửa lấy thêm khóa stock sau khóa detail. Callback tải lại stock trước settle để dùng số lượng đã sửa; callback hoàn tất trước thì lần sửa sau bị từ chối. Các cập nhật của lần sửa cùng rollback nếu lỗi. Không cần migration DB.

## Kiểm chứng

```powershell
# Tại backend; database SQLite riêng và cache/ICS giả lập.
./.venv/Scripts/python.exe -m unittest test.test_inbound_buffer_stock -v

# Tại frontend, khởi động Vite; sau đó chạy từ thư mục gốc.
# Mọi API/WS của trình duyệt đều được chặn và giả lập.
./backend/.venv/Scripts/python.exe frontend/tests/inboundBufferStockBrowser.py -v
```

Browser mặc định dùng `https://localhost:5177`; đổi qua `INBOUND_BROWSER_BASE_URL` khi cần. Kiểm thử BE bao gồm hai thứ tự edit/callback, dữ liệu cũ trong identity map, quy đổi đơn vị, rollback và SQL khóa biên dịch cho PostgreSQL. SQLite không kiểm chứng việc hai transaction PostgreSQL thực sự chặn nhau; cần kiểm tra đó trên PostgreSQL riêng trước khi triển khai nếu yêu cầu xác nhận đồng thời ở mức DB.

## Đã nạp ngày 30/10/2026

- Phát hiện API Windows ở địa chỉ LAN đã nạp source mới nhưng `localhost:8001` vẫn đi vào container Docker dùng image cũ. Đã build lại image, chạy 35 kiểm thử trong container tắt network: tất cả đạt.
- Đã dừng Beat, đợi hai worker hết task đang chạy, dừng nhẹ worker rồi recreate API và worker; sau khi hai worker trả `pong`, recreate và bật lại Beat. Cả bốn container dùng image `sha256:1f8f974932089308d686fcc9b5df4f560ccb4e5d1fca050d1c6ec400fe87defb`, trạng thái running, restart count bằng 0 tại thời điểm kiểm tra.
- `/health` qua `127.0.0.1`, `localhost` và địa chỉ LAN đều healthy; OpenAPI đều có `inbound_buffer_location_id`. Hash năm module liên quan trong container API khớp source. Đã kiểm tra chỉ đọc trên dữ liệu thật: tài khoản `inbound_user` được cho phép sửa buffer nhập trong kho được gán. Không sửa tồn hoặc gửi lệnh robot để thử chức năng trong lần nạp này.
