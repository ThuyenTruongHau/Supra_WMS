# Kiểm kê tồn kho

Đối chiếu source ngày 21/10/2026. Áp dụng màn hình `/inventory`, không phải thao
tác gửi robot. API kiểm kê gọi service trực tiếp trong tiến trình FastAPI.

## Thao tác trên FE

1. Chọn kho, vào **Kiểm kê** → **Tạo sự kiện kiểm kê**.
2. Chọn cả kho, theo mã sản phẩm hoặc **Theo vị trí**. Chọn ô trống theo vị trí
   vẫn tạo được phiếu; không còn báo “Tồn tại vị trí không có hàng”.
3. Sau khi tạo, FE mở chi tiết `/inventory/:id`. Checklist có các dòng tồn đang
   hoạt động, số lượng > 0. Nếu mọi ô đã chọn đều trống, checklist chưa có dòng.
4. Với hàng tìm thấy ở ô trống hoặc SKU/lô chưa có tại vị trí, bấm **Thêm hàng
   kiểm kê**. Chọn đúng vị trí, sản phẩm, nhập lô, hạn sử dụng nếu có và số lượng
   thực đếm theo đơn vị gốc của sản phẩm. Không mặc định số lượng theo tồn cũ.
5. Bấm **Ghi nhận**. Dòng có SL hệ thống 0, SL thực tế đã nhập và đang chờ xác nhận.
6. Kiểm tra lại, bấm **Xác nhận SL** để cập nhật tồn. Ghi nhận đơn thuần chưa tạo
   tồn có thể xuất. Nếu thực tế 0, dòng tồn vẫn không hoạt động.

Với dòng tồn đã có, giữ luồng ghi nhận ở tab checklist hoặc QR tablet, rồi xác
nhận ở chi tiết. Không dùng nút thêm hàng để nhân đôi dòng tồn đã tồn tại.
Thao tác thêm mới trong lần sửa này đặt ở trang chi tiết desktop/tablet;
không thêm màn hình riêng vào QR tablet.

## Backend và dữ liệu

- `POST /api/v1/stocktakes`: `stocktake:create`; tạo header và snapshot dòng tồn.
  Theo vị trí rỗng vẫn thành công. Vị trí phải hoạt động, thuộc kho; cả kho hoặc
  theo mã/lô không có tồn vẫn báo không tìm thấy tồn như trước.
- `POST /api/v1/stocktakes/{stocktake_id}/items`: `stocktake:update`; nhận
  `item_id`, `location_id`, `actual_quantity >= 0`, `lot_number`, `expiry_date`
  tùy chọn, `status` mặc định `available`. SKU/vị trí phải hoạt động cùng kho.
  Cho phép trạng thái `available`, `split`, `damaged`, `quarantine`, `expired`.
- Service tạo **dòng ItemStock mới**, quantity 0, `is_active=false`, đơn vị gốc
  của SKU; liên kết `StocktakeItemStock` desired 0, actual theo thực đếm,
  status `in_progress`. Hai dòng được commit cùng transaction.
- `POST /api/v1/stocktakes/{stocktake_id}/items/{stocktake_item_id}/confirm-quantity`:
  giữ quyền `stocktake:update`, ghi quantity thực đếm; chỉ kích hoạt tồn khi > 0.
  Actual khác desired có trạng thái `discrepancy`, bằng nhau là `completed`.
  Trạng thái chênh lệch không có nghĩa cập nhật tồn thất bại.
- Khóa vị trí khi thêm/xác nhận, khóa dòng kiểm kê khi xác nhận. Chặn SKU/lô/hạn
  đã có tồn hoạt động hoặc có dòng thêm mới chờ xác nhận ở phiếu khác; kiểm tra
  lại tồn khi xác nhận để tránh cộng trùng nếu hàng đã xuất hiện giữa hai bước.
- Không tái sử dụng bản ghi tồn lịch sử đã clear. Dòng kiểm kê cũ gắn với tồn đã
  bị clear/ngừng hoạt động không được xác nhận để khôi phục số lượng cũ; phải
  ghi nhận dòng mới theo thực đếm.
- Không có migration, Redis, Celery hoặc lệnh RCS trong luồng này. FE làm mới
  query tồn/map sau xác nhận; không tự phát lại outbound còn thiếu.

Phạm vi vị trí lúc tạo hiện không lưu thành bảng riêng. Nó lọc snapshot lúc
tạo; khi thêm hàng, chọn lại đúng vị trí trong kho của phiếu. Nếu ô thực sự
trống và không có hàng để thêm, phiếu rỗng giữ trạng thái `initialize`; chưa có
thao tác đóng phiếu rỗng riêng.

## File chính và kiểm chứng

- BE: [API](../../backend/app/modules/warehouse/stocktake/stocktake_api.py),
  [schema](../../backend/app/modules/warehouse/stocktake/stocktake_schema.py),
  [service](../../backend/app/modules/warehouse/stocktake/stocktake_service.py).
- FE: [trang chi tiết](../../frontend/src/pages/StocktakeDetailPage.tsx),
  [form thêm hàng](../../frontend/src/pages/components/StocktakeAddItemModal.tsx),
  [hooks](../../frontend/src/hooks/useStocktake.ts).
- [Test SQLite/API giả lập](../../backend/test/test_stocktake_empty_location.py):
  14 test đạt; không dùng DB/Redis/RCS thật. Bao phủ create/add/GET/confirm, ô rỗng,
  tồn đã clear, 0, dữ liệu sai kho, trùng, tồn đến giữa hai bước, luồng tồn cũ.
  Khóa đồng thời trên PostgreSQL chưa được kiểm thử tích hợp.
- Xem [ghi chú xử lý](../tasks/2026-10-21-stocktake-empty-location.md).
