# Kiểm kê vị trí chưa có tồn

Ngày: 21/10/2026. Trạng thái: đã sửa code, kiểm chứng cách ly và route đang chạy.

## Nguyên nhân và thay đổi

`create_stocktake` chỉ lấy ItemStock hoạt động, quantity > 0; không tìm thấy thì
rollback và ném `Selected locations have no stock`. FE dịch thành “Tồn tại vị
trí không có hàng”. Sau clear, không thể tạo phiếu để nhập lại tồn thực đếm.
Service cũng chưa có chức năng thêm hàng mới vào checklist và xác nhận trước
đây chỉ tắt is_active khi 0, không bật lại cho dòng tạo từ kiểm kê ô trống.

Đã cho tạo phiếu theo vị trí trống hợp lệ, thêm endpoint/form ghi nhận SKU/lô
mới theo thực đếm, rồi xác nhận mới kích hoạt tồn. Giữ lịch sử clear, chống
trùng, kiểm tra cùng kho; không thay đổi số lượng thật khi sửa lỗi này.
Chi tiết cách dùng và hợp đồng ở [luồng kiểm kê](../flows/stocktake.md).

## Kiểm chứng

- `backend/.venv/Scripts/python.exe -m unittest test.test_stocktake_empty_location -q`
  từ backend: **14/14 đạt**, SQLite memory, fake cấu hình kết nối, TestClient
  không chạy lifespan. Không ghi DB thật, không gửi robot.
- Bộ stocktake ban đầu 13 test cùng `test_outbound_remaining_quantity` và
  `test_masan_outbound_parse`: **30/30 đạt**. Sau đó bổ sung test chặn xác nhận
  tồn đã clear và chạy lại toàn bộ 14 test stocktake đạt.
- `npm.cmd run build`: đạt; còn cảnh báo bundle lớn.
- TypeScript toàn dự án chưa đạt vì nhiều lỗi ngoài các file sửa; đã sửa lỗi
  phát hiện trong form mới. Lọc kết quả sau sửa không còn lỗi ở các file thay
  đổi của chức năng kiểm kê.
- ESLint ban đầu còn hai lỗi có sẵn về setState trong useEffect tại
  StocktakePage và CreateStocktakeModal; lỗi cùng loại trong form mới đã sửa.
  Chạy lại lint form mới, StocktakeDetailPage, hooks, API và types kiểm kê: đạt.
- API host: GET `/health` HTTP 200 healthy, GET `/openapi.json` HTTP 200 có route
  POST `/api/v1/stocktakes/{stocktake_id}/items`. Chỉ kiểm tra GET trên dịch vụ thật.

## Áp dụng và giới hạn

Host API có reload đã nhận code. FE Vite dùng source; tải lại trang rồi thao tác
theo hướng dẫn. Không cần migration hoặc restart worker cho luồng kiểm kê trực
tiếp này. Không rebuild/thay container trong tác vụ; image Docker chưa chứa bản
sửa kiểm kê, cần build lại nếu chuyển chạy API từ image.

Chưa thao tác trình duyệt thật desktop/tablet hoặc kiểm thử khóa PostgreSQL
đồng thời. Không có số thực đếm do người dùng cung cấp nên chưa chỉnh tồn VT13,
VT14, G417 hay các ô khác trong DB thật.
