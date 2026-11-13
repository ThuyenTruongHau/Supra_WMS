# Định nghĩa chỉ số — hiện trạng theo source

Ngày đối chiếu: **2026-10-19** (nhóm tuổi tồn ở mục 6; kỳ xu hướng/xếp hạng mục 3–5 cập nhật 2026-10-16; các nhóm khác giữ bản khảo sát 2026-10-14). Các công thức dưới đây mô tả code hiện tại, không khẳng định đã được nghiệp vụ xác nhận. Thay đổi nghĩa chỉ số phải được ghi rõ trong nhiệm vụ và [sổ quyết định](../decisions.md).

## 1. KPI tổng quan

Nguồn điều phối: [dashboard_service.py](../../backend/app/modules/warehouse/dashboard/dashboard_service.py).

| Field | Cách tính hiện tại | Phạm vi/thời gian |
|---|---|---|
| `total_inbound_orders` | Đếm `InboundOrder.id` | Kho được chọn, mọi trạng thái, mọi thời điểm |
| `total_outbound_orders` | Đếm `OutboundOrder.id` | Kho được chọn, mọi trạng thái, mọi thời điểm |
| `total_inventory_value` | Tổng `ItemStock.quantity × price` | Tồn hiện tại theo bộ lọc storage ở mục 2 |
| `unsolved_notifications` | Đếm `Notification.id` với `status='unsolved'` | Kho được chọn, không giới hạn thời gian |

Nguồn: `count_inbound_orders()` trong [inbound service](../../backend/app/modules/warehouse/inbound_order/inbound_order_service.py), `count_outbound_orders()` trong [outbound service](../../backend/app/modules/warehouse/outbound_order/outbound_order_service.py), `compute_total_inventory_value()` trong [item service](../../backend/app/modules/warehouse/item/item_service.py), `count_unsolved_notifications()` trong [notification service](../../backend/app/modules/warehouse/notificcation/notification_service.py).

Không diễn giải số đơn này thành số đơn hoàn tất hoặc sản lượng thực tế. Frontend định dạng giá trị tồn thành VND.

## 2. Tổng tồn live và giá trị tồn

Nguồn: `_storage_stock_filters()`, `compute_live_total_quantity()`, `compute_live_total_inventory_value()` trong [snapshot service](../../backend/app/modules/warehouse/dashboard/dashboard_snapshot_service.py). KPI value dùng hàm riêng ở item service, hiện có bộ lọc/công thức tương ứng; khi sửa phải đối chiếu cả hai.

Các bảng join: `ItemStock → Item`, `ItemStock → Location → Zone`.

Điều kiện hiện tại:

- `Item.warehouse_id` bằng kho được chọn; `Item.is_active=true`.
- `ItemStock.is_active=true`, `quantity>0`, `stock_level IS NULL OR stock_level<=1`.
- `Location.is_active=true`, `Zone.code IN settings.zone_storage`.
- Không có điều kiện status tồn riêng trong bộ lọc này; không tự mặc định chỉ lấy `available`.
- Phạm vi kho được lọc theo Item; không có điều kiện `Location.warehouse_id` riêng trong helper này.

```text
total_quantity = SUM(ItemStock.quantity)
price = cast bỏ dấu phẩy trong Item.details['price'] thành Numeric(18,2)
total_inventory_value = SUM(quantity × COALESCE(price, 0))
```

Giá null/rỗng được tính 0; chuỗi không chuyển được thành số không có cơ chế bỏ qua trong biểu thức cast. Tổng rỗng trả 0. Source không thực hiện quy đổi đơn vị tại phép tổng hợp này.

## 3. Xu hướng nhập/xuất

Nguồn: `_count_orders_by_day()` và `get_report_trends()` trong [trend service](../../backend/app/modules/warehouse/dashboard/dashboard_trend_service.py).

- Đếm **đơn**, không cộng số lượng hàng.
- Lấy ngày từ `InboundOrder.created_at`/`OutboundOrder.created_at`, chuyển timezone `Asia/Ho_Chi_Minh` rồi lấy date.
- Lọc kho, khoảng ngày; không lọc trạng thái đơn.
- Kỳ được tạo bởi [build_trend_periods()](../../backend/app/modules/warehouse/dashboard/dashboard_trend_periods.py), thứ tự từ cũ đến mới; mọi kỳ kết thúc ở hôm nay theo timezone Việt Nam.

| Lựa chọn UI / API | Phạm vi hiện tại | Đơn vị mỗi điểm |
|---|---|---|
| 1 tuần / `week` (mặc định) | Thứ Hai của tuần hiện tại đến hôm nay | Ngày, tối đa 7 điểm |
| 1 tháng / `month` | Ngày 1 tháng hiện tại đến hôm nay | Ngày, tối đa 28–31 điểm |
| 1 quý / `quarter` | Ngày 1 tháng đầu quý hiện tại đến hôm nay | Tháng, tối đa 3 điểm |
| 1 năm / `year` | Ngày 1/1 năm hiện tại đến hôm nay | Tháng, tối đa 12 điểm |

- Quý lịch: Q1 tháng 1–3, Q2 tháng 4–6, Q3 tháng 7–9, Q4 tháng 10–12. Tuần có thể bắt đầu ở năm trước.
- Tháng hiện tại trong chế độ quý/năm chỉ cộng từ đầu tháng đến hôm nay; không tạo điểm cho ngày/tháng tương lai. Vì thế đầu tuần/quý/năm có thể chỉ có một điểm.
- Đây là kỳ lịch hiện tại, không phải cửa sổ lùi 7/30/90/365 ngày và không phải 12 kỳ gần nhất. Chưa có tham số chọn năm/kỳ quá khứ.
- Ngày không có đơn trả 0; `period_start`, `period_end` trong response xác định khoảng của mỗi điểm.

## 4. Tồn lịch sử và snapshot

Nguồn: [trend service](../../backend/app/modules/warehouse/dashboard/dashboard_trend_service.py), [snapshot service](../../backend/app/modules/warehouse/dashboard/dashboard_snapshot_service.py), [task](../../backend/app/modules/warehouse/dashboard/dashboard_celery_task.py), [lịch Beat](../../backend/app/core/celery_app.py).

Số liệu tồn trên biểu đồ **chỉ** từ `inventory_daily_snapshot`:

1. Có snapshot đúng `snapshot_date` → dùng `total_quantity` / `total_inventory_value`.
2. Không có snapshot → quantity và value đều **0** (không dùng tồn live, không mô phỏng nhập/xuất).

Ở chế độ tuần/tháng, mỗi điểm là tồn cuối **một ngày** (theo snapshot). Ở chế độ quý/năm, mỗi điểm tháng là tồn cuối **ngày cuối tháng** (`period_end`); tháng đang diễn ra dùng đến hôm nay — nếu chưa có snapshot hôm nay (trước 23:00) thì điểm đó là 0.

Task Celery `dashboard.snapshot_inventory_daily` chạy **23:00** timezone Việt Nam, lấy mọi `Warehouse.id` và upsert một dòng/ngày/kho. Báo cáo (`get_report_trends`) không gọi upsert snapshot. Chạy lại cùng kho/ngày cập nhật quantity/value, không thêm dòng thứ hai.

Chưa có backfill tự động trong repo. Cần Beat + worker chạy liên tục để lịch sử đầy đủ; uvicorn một mình không tạo snapshot.

## 5. Xếp hạng sản phẩm — Top 5/10/15

Nguồn: [top products service](../../backend/app/modules/warehouse/dashboard/dashboard_top_products_service.py).

| Nhóm | Nguồn số lượng | Trường thời gian |
|---|---|---|
| `inbound_top` | Tổng `InboundOrderAllocation.quantity`; join detail → order, stock → item | `InboundOrderAllocation.created_at` |
| `outbound_top` | Tổng `OutboundOrderDetail.quantity`; join order và item | `OutboundOrderDetail.created_at` |
| `stock_top` | Tổng `ItemStock.quantity` theo storage filters | Tồn hiện tại, không theo kỳ week/month/three_months |

- `week`: từ hôm nay trừ 6 ngày; `month`: từ hôm nay trừ 29 ngày; `three_months`: từ hôm nay trừ 89 ngày. Đây là cửa sổ 7/30/90 ngày gồm hôm nay, không phải tuần/tháng/quý lịch. “3 tháng” được triển khai thành 90 ngày để nhất quán với hai kỳ rolling hiện có; khác bộ chọn kỳ lịch ở biểu đồ xu hướng.
- Hai nhóm nhập/xuất chỉ lọc ngày `>= start_date`, chưa có giới hạn ngày trên; không lọc trạng thái hoàn thành trong query hiện tại.
- Gom theo Item, xếp quantity giảm dần, sau đó `Item.id` tăng dần để ổn định thứ tự khi bằng nhau.
- `limit` nhận **5, 10 hoặc 15**, mặc định 5; cả ba truy vấn đều áp dụng giới hạn trong SQL. Có ít hơn N sản phẩm thì trả đúng số thực có, không thêm hàng giả. Giá trị ngoài tập này bị API từ chối HTTP 422.
- Response thêm `limit`, giữ `period` và ba danh sách `inbound_top`, `outbound_top`, `stock_top`. Client cũ không gửi limit vẫn nhận Top 5.
- `label` API vẫn ưu tiên SKU, sau đó name, sau đó item id để tương thích client cũ. Response mỗi sản phẩm bổ sung `sku` và `name` riêng (có thể null); frontend dùng để hiển thị **SKU – tên sản phẩm** thống nhất Top 5/10/15, chia hai dòng trên trục và đầy đủ trong tooltip. Dữ liệu API cũ thiếu hai trường này vẫn dùng label.
- SKU là chuỗi định danh, có thể chứa dấu chấm hoặc số 0 đầu; không parse thành số, làm tròn hoặc tự đổi mã. Đã đối chiếu chỉ đọc: `4603.637` có tên “Nút bịt lỗ ren M6”, `4506.326` có tên “Ke góc nhựa phom tủ”. Các mã này xuất hiện khi mở rộng Top vì có thêm sản phẩm, không phải phép chuyển đổi số của biểu đồ.
- Response `total_quantity` dùng `int(...)`, cắt phần thập phân nếu có.
- Nhập và xuất đang dùng hai cấp dữ liệu/mốc thời gian khác nhau; không mặc định đó là lượng vận chuyển thành công của AMR.

## 6. Tuổi tồn

Nguồn: [stock aging service](../../backend/app/modules/warehouse/dashboard/dashboard_stock_aging_service.py).

```text
holding_days = hôm nay theo timezone Việt Nam
               - ngày ItemStock.created_at theo timezone Việt Nam
```

Điều kiện: `Item.warehouse_id`, Item active, ItemStock active, status `available` hoặc `split`, quantity dương và cấp tồn được tính. Không join/lọc Location, Zone hoặc yêu cầu location active trong bộ lọc này.

| Bucket | Điều kiện | Tỷ trọng |
|---|---|---|
| `lte_90` | holding_days <=90; nhãn 0–90 ngày | Tổng quantity bucket / tổng quantity của bốn bucket ×100 |
| `days_91_180` | 91–180 ngày | Như trên |
| `days_181_360` | 181–360 ngày | Như trên |
| `gt_360` | >360 ngày | Như trên |

Từ 2026-10-19, API tổng quan, biểu đồ, legend và bộ lọc chi tiết dùng cùng bốn nhóm. Yêu cầu “180–360” được triển khai **181–360** vì ngày 180 đã thuộc nhóm 91–180; các khoảng không bị trùng hoặc hở. Ba mã bucket cũ không còn hợp lệ.

- Tỷ trọng tính theo **số lượng**, không phải số SKU, số bản ghi hay giá trị tiền; backend làm tròn 2 chữ số thập phân.
- Tổng rỗng: bốn bucket có quantity/percent bằng 0.
- Source chưa chặn tuổi âm; bản ghi có ngày tạo tương lai sẽ vào nhóm `lte_90`. Đây là hành vi có sẵn được giữ lại, cần quyết định riêng nếu muốn đổi.
- “Tồn lâu nhất”: tối đa 8 **bản ghi tồn**, xếp tuổi giảm dần, quantity giảm dần, id giảm dần. Một SKU có thể xuất hiện nhiều lần.
- Chi tiết nhóm: tối đa 500 bản ghi với cùng thứ tự, chưa phân trang hoặc trả tổng số bản ghi.
- `created_at` là ngày tạo bản ghi tồn; chưa xác nhận luôn tương ứng ngày nhập thực tế, nhất là khi tách/chuyển tồn.

## 7. Logic có thể tái sử dụng cho chỉ số mới

Đã có `analyze_items()` tại [item_service.py](../../backend/app/modules/warehouse/item/item_service.py), API `GET /api/v1/items/analyze-items/{warehouse_id}` tại [item_api.py](../../backend/app/modules/warehouse/item/item_api.py), yêu cầu `item:read`.

| Field hiện có | Nghĩa hiện tại |
|---|---|
| `total_items` | Số Item active trong kho; **không phải số SKU đang có tồn** |
| `total_quantity` | Tổng tồn storage theo bộ lọc tương ứng mục 2 |
| `total_inventory_value` | Giá trị tồn storage |
| `total_low_stock` | Số Item active có tổng tồn storage `< Item.min_quantity`; không có tồn thì coi 0 |

Frontend đã có `analyzeItemsApi()` trong [api/item.ts](../../frontend/src/api/item.ts), `useItemAnalyze()` trong [hooks/useItem.ts](../../frontend/src/hooks/useItem.ts). Khi đưa chỉ số thiếu hàng lên reporting, khảo sát tái sử dụng thay vì tạo công thức gần giống.

Trong khi đó, `Item.quantity` dùng storage và split; dùng trực tiếp property này có thể khác `total_low_stock` nêu trên. Thống nhất phạm vi trước khi dùng cho chỉ số vượt ngưỡng.

## 8. Các quyết định còn mở

Xem [roadmap](roadmap.md): định nghĩa tồn gộp theo tháng, thiếu snapshot, đơn hoàn thành, thời gian chung, đơn vị/giá, phạm vi tuổi tồn, quyền cho nhân viên, drill-down và phân trang. Kỳ xu hướng đã đổi ngày 2026-10-16; các quyết định công thức khác chưa được chốt.
