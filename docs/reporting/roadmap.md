# Đề xuất cải tiến reporting

Ngày ghi: **2026-10-14**, cập nhật **2026-10-19**. Các hạng mục dưới đây vẫn là **đề xuất**, trừ phần đã triển khai được ghi riêng. Người dùng đã xác nhận hướng cải thiện trình bày và bổ sung báo cáo, chưa chọn danh sách cuối cùng hoặc công thức mới.

## Đã triển khai ngày 2026-10-16

Theo yêu cầu người dùng, bộ chọn xu hướng đổi từ 12 ngày/12 tuần thành 1 tuần/1 tháng/1 quý/1 năm. Triển khai kỳ lịch hiện tại đến hôm nay: tuần/tháng theo ngày, quý/năm theo tháng; UI ghi khoảng ngày và hiển thị điểm đơn khi kỳ mới bắt đầu. Chi tiết ở [metrics](metrics.md). Chưa thay công thức số đơn, bộ lọc tồn, snapshot hoặc các báo cáo khác.

Tiếp theo, theo yêu cầu người dùng, xếp hạng sản phẩm thêm kỳ **3 tháng (90 ngày gần nhất)** và **Top 5/10/15**. Bộ chọn Top áp dụng cả nhập/xuất/tồn; kỳ thời gian vẫn chỉ áp dụng nhập/xuất, tồn là hiện tại. Chart có chiều cao theo số hàng và vùng cuộn. Mặc định 1 tuần, Top 5; công thức số lượng và phạm vi tồn giữ nguyên.

## Đã triển khai ngày 2026-10-19

Tuổi tồn đổi thành bốn nhóm 0–90, 91–180, 181–360, trên 360 ngày cho API tổng quan/chi tiết, biểu đồ và legend. Nhóm thứ ba bắt đầu từ 181 để không trùng ngày 180. Giữ nguyên cách tính tuổi, nguồn tồn và ngưỡng cảnh báo riêng của phân hệ thông báo.

## Mục tiêu thiết kế

- Quản lý kho: nắm tổng quan, xu hướng và nhóm hàng cần chú ý.
- Nhân viên vận hành: đi từ chỉ số tới danh sách có SKU, lô, vị trí và số lượng để xem xét xử lý.
- Phân biệt chỉ số theo kỳ, số liệu tại một thời điểm và cảnh báo hiện tại; bộ lọc thời gian phải ghi rõ áp dụng cho khối nào.

## Đề xuất bố cục

```text
Kho đang chọn · Kỳ báo cáo · Thông tin cập nhật/phạm vi dữ liệu

KPI: SKU có tồn | Dưới ngưỡng | Vượt ngưỡng | Vị trí có hàng

Xu hướng nhập/xuất              Xu hướng tồn số lượng hoặc giá trị

Sử dụng vị trí theo khu vực      Cơ cấu tuổi tồn và nhóm >360 ngày

Danh sách cần chú ý: thiếu hàng · vượt ngưỡng · tồn lâu
```

Đây là phác thảo để thảo luận; chưa thay thế layout hiện tại. Không gắn nhãn “cập nhật lúc” bằng thời gian render nếu đó không phải thời điểm dữ liệu được lấy/chốt.

## Nhóm A — Trình bày, giữ nghĩa dữ liệu

| Đề xuất | Lý do/tiêu chí |
|---|---|
| Đổi area nhập/xuất thành cột nhóm | Dễ so sánh từng kỳ; vẫn ghi rõ “số đơn” nếu giữ API hiện tại |
| Chuyển giữa số lượng tồn và giá trị tồn | Tránh hiểu sai tương quan khi dùng hai trục Y; đơn vị luôn hiện rõ |
| Thay nhãn tháng cố định | Hiển thị đúng phạm vi từng khối; KPI all-time không mang nhãn tháng |
| Nhất quán màu, tooltip và format | Cùng chỉ số giữ màu; không chỉ dựa vào màu để truyền ý nghĩa |
| Loading/empty/error/retry theo khối | Phân biệt không có dữ liệu, dữ liệu thiếu, lỗi tải và số 0 thật |
| Responsive và tên SKU dài | Không cắt mất thông tin cần phân biệt; tooltip/nhãn đầy đủ |

Thay đổi kỳ xu hướng đã thực hiện ở trên. Các thay đổi tiếp theo như khoảng ngày tùy chọn, chọn kỳ quá khứ hoặc đổi công thức tồn gộp vẫn thuộc nhóm B/C vì cần xem hợp đồng dữ liệu.

## Nhóm B — Chỉ số và báo cáo mới

| Ứng viên | Cơ sở hiện có | Điểm cần chốt |
|---|---|---|
| Số SKU có tồn | Item và ItemStock | Đếm distinct Item có tồn dương; phạm vi storage/split và active |
| SKU dưới ngưỡng | `analyze_items().total_low_stock` | Ưu tiên tái sử dụng; làm rõ tồn storage và min đã cấu hình |
| SKU vượt ngưỡng | `Item.max_quantity` | max=0 có nghĩa gì, phạm vi tồn, đơn vị và điều kiện `>` |
| Tỷ lệ vị trí có hàng | Location và stock, zone | Số vị trí có tồn / số vị trí lưu trữ hợp lệ; reserved/in_transit hiển thị thế nào |
| Báo cáo thiếu/dư hàng | Min/max và tồn theo SKU | Số lượng thiếu/dư, SKU có tồn bằng 0, lọc/sắp xếp/phân trang |
| Tồn lâu theo SKU/lô/vị trí | Báo cáo tuổi tồn hiện có | Chuẩn ngày tính tuổi, phạm vi lọc, bổ sung location/zone vào response |
| Đối chiếu kỳ trước | Nguồn đơn và snapshot | Kỳ so sánh tương đương, tuần chưa đủ, dữ liệu thiếu, mẫu số 0 |

“Tỷ lệ vị trí có hàng” chưa phải “phần trăm sức chứa vật lý”. Muốn báo cáo thể tích/tải trọng/công suất kho phải có dữ liệu sức chứa và quy tắc phù hợp. Không suy ra hiệu suất AMR từ số đơn nhập/xuất.

Đề xuất thực hiện theo lát cắt: A trước; sau đó một KPI kèm danh sách chi tiết ở B; kiểm chứng rồi mở rộng. Chưa cần thêm toàn bộ ứng viên vào một màn hình.

## Nhóm C — Quyết định dữ liệu và quyền

| ID mở | Nội dung cần quyết định | Hiện trạng tham chiếu |
|---|---|---|
| O01 | Tồn gộp theo tháng ở chế độ quý/năm là tổng ngày, cuối tháng hay trung bình? | Đang cộng ngày; bộ chọn kỳ mới chưa chốt đổi phép tổng hợp |
| O02 | Ngày thiếu snapshot hiển thị thiếu dữ liệu, carry-forward hay 0? | Quá khứ thiếu trả 0 |
| O03 | Chỉ số nhập/xuất đếm đơn tạo, đơn hoàn tất hay quantity hoàn tất? | Trends đếm đơn theo created_at, mọi trạng thái |
| O04 | Bộ lọc chung áp dụng khối nào; có cần chọn kỳ quá khứ? | Trends kỳ lịch tuần/tháng/quý/năm hiện tại; top 7/30/90 ngày, Top 5/10/15; KPI đơn all-time |
| O05 | Tồn/tuổi tồn lấy zone, stock level, status nào? | Các báo cáo đang có phạm vi khác nhau |
| O06 | Số lượng/giá quy đổi theo đơn vị nào, làm tròn thế nào? | Numeric/Decimal backend; có cắt thập phân frontend/top |
| O07 | Vai trò nhân viên nào được xem báo cáo và được xem kho nào? | UI reporting qua AdminRoute; API theo tập quyền |
| O08 | Snapshot cần mốc giờ nào và phản ánh hôm nay ra sao? | Lịch 23:00 VN; biểu đồ chỉ đọc snapshot, không live |
| O09 | Chi tiết bucket phân trang và giới hạn xuất dữ liệu? | Tối đa 500 bản ghi, không metadata phân trang |

Không bắt buộc giải quyết toàn bộ câu hỏi trước khi sửa một chart. Chỉ làm rõ các quyết định ảnh hưởng nhiệm vụ đang triển khai, ghi kết quả đã chốt vào [decisions](../decisions.md), rồi cập nhật [metrics](metrics.md).
