# Kiểm chứng reporting

Ngày lập: **2026-10-14**, cập nhật **2026-10-19**. Các ma trận dưới đây là kế hoạch và ví dụ đối chiếu, không phải toàn bộ tình huống đều đã chạy. Kết quả kiểm tra tự động được ghi riêng ở các mục 5–8. Dùng môi trường test/mock; không gọi tác vụ vận hành AMR hoặc ghi DB production để chuẩn bị dữ liệu.

## 1. Đối chiếu hiện trạng trước khi sửa

Các kết quả dưới đây lấy theo [metrics hiện tại](metrics.md). Khi thay định nghĩa, cập nhật expected riêng cho nhiệm vụ; không dùng baseline để bắt giữ lại hành vi đã được yêu cầu thay đổi.

| Tình huống | Dữ liệu test | Kết quả theo source hiện tại |
|---|---|---|
| Đếm đơn mọi trạng thái | Cùng kho có 2 đơn hoàn tất, 1 đơn chưa hoàn tất | KPI đếm 3; trends đếm theo created_at nếu trong kỳ |
| Tách kho | Đơn ở kho A và B | Query kho A không cộng đơn kho B |
| Quantity khác số đơn | Một đơn có quantity 100 | Trends số đơn tăng 1, không tăng 100 |
| Loại cấp tồn con | Hai stock cấp 1/2 có cùng quantity 10 | Helper storage chỉ cộng cấp 1; null stock_level cũng được tính |
| Loại tồn rỗng/inactive | Stock qty=0 hoặc stock inactive | Không vào tổng tồn storage/aging |
| Storage khác split | Cùng SKU có 10 ở storage, 5 ở split | Tổng reporting storage=10; không mặc định bằng Item.quantity=15 |
| Tuổi tồn khác storage | Stock available ở ngoài storage, cùng Item hợp lệ | Aging có thể tính dù tổng storage không tính |
| Giá trị | Stock hợp lệ 10, price `1,000` | Giá trị backend=10.000; giá null/rỗng đóng góp 0 |
| Thiếu snapshot quá khứ | Không có dòng snapshot của ngày D | Điểm tồn ngày D trả 0 theo baseline |
| Snapshot hôm nay | Snapshot hôm nay qty=50, live qty=60 | Điểm hôm nay=50 theo thứ tự ưu tiên hiện tại |
| Tổng tháng trong quý/năm | Hai ngày cùng tháng có snapshot qty=100 và 90, các ngày khác không có | Điểm tháng=190 theo baseline |
| Ranh giới tuổi | Stock có tuổi 90,91,180,181,360,361 ngày | Lần lượt lte_90, days_91_180, days_91_180, days_181_360, days_181_360, gt_360 |
| Tỷ trọng tuổi | Bốn nhóm có quantity 10,20,30,40 | 10%,20%,30%,40%; tổng rỗng thì cả bốn bằng 0% |
| Top tồn độc lập kỳ | Giữ nguyên tồn, đổi top week/month | Top tồn không đổi do kỳ; top nhập/xuất có thể đổi |
| SKU thiếu hàng | Active SKU min=5, tồn storage=0 | `total_low_stock` có tính SKU này |
| Chạm min | Min=5, tồn storage=5 | Không dưới ngưỡng vì điều kiện là `<` |
| Tuần hiện tại | Hôm nay 16/10/2026 | 5 điểm từ 12/10 đến 16/10, mỗi điểm một ngày |
| Tháng hiện tại | Hôm nay 16/10/2026 | 16 điểm từ 01/10 đến 16/10 |
| Quý hiện tại | Hôm nay 15/03/2024 | 3 điểm tháng 1,2,3; tháng 2 có 29 ngày, tháng 3 chỉ đến ngày 15 |
| Năm hiện tại | Hôm nay 16/10/2026 | 10 điểm tháng 1–10; không tạo điểm tháng 11,12 |
| Đầu kỳ | Thứ Hai hoặc đầu quý/năm | Có thể chỉ một điểm; chart vẫn hiện dot và tooltip |
| API kỳ cũ | `granularity=day` | HTTP 422; không âm thầm đổi nghĩa tham số |
| Kỳ Top 3 tháng | Hôm nay 16/10/2026 | Ngày bắt đầu 19/07/2026, 90 ngày gồm hôm nay |
| Top 5/10/15 | Đổi limit trong cùng kỳ và kho | Cả nhập/xuất/tồn áp dụng đúng SQL LIMIT; query key gồm limit |
| Top không đủ N | Chỉ có 2 sản phẩm phù hợp | Trả 2 sản phẩm, không bổ sung hàng giả |
| Top số lượng bằng nhau | Nhiều SKU có tổng quantity bằng nhau | Xếp thêm theo Item.id tăng dần để ổn định |
| Nhãn SKU dạng số | SKU `4603.637`, tên “Nút bịt lỗ ren M6” | Hiển thị mã và tên riêng, giữ nguyên dấu chấm trong mã; tooltip có đầy đủ |
| SKU có số 0 đầu | SKU `001.020` | Giữ nguyên chuỗi, không chuyển thành 1.02 hoặc làm tròn |
| Nhãn Top 5/10/15 | Cùng một sản phẩm xuất hiện ở các giới hạn | Cùng cách hiển thị SKU + tên; không có nhánh đổi nhãn theo limit |
| Top limit không hợp lệ | Limit 4,6,12,16 hoặc chuỗi | HTTP 422, không gọi service |

## 2. Ranh giới cần kiểm tra khi đổi công thức

- Ngày Việt Nam quanh nửa đêm; ngày tạo UTC phải được quy về đúng ngày địa phương.
- Tuần bắt đầu thứ Hai và có thể qua năm mới; tháng nhuận, đầu quý và năm chưa đủ 12 tháng; không tạo điểm tương lai hoặc so kỳ chưa đầy đủ mà bỏ qua khác biệt.
- Top 7/30/90 ngày gồm hôm nay; test bản ghi đúng ngày bắt đầu, trước một ngày và ngày tương lai.
- Null/zero price và chuỗi price không hợp lệ; xác định expected thay vì để chart ngầm biến lỗi thành 0.
- Decimal có phần lẻ: kiểm tra API, phép tổng và nhãn; số lượng 1.9 đang có đường hiển thị thành 1, top cũng ép int.
- Tồn có vị trí null, vị trí inactive, Item inactive, cấp tồn con, reserved/in_transit và allocation chưa hoàn tất.
- Ngày tạo tồn tương lai, tách/chuyển tồn; xác minh có cần giữ ngày nhập gốc.
- Snapshot chạy lại cùng kho/ngày, thiếu nhiều ngày, có snapshot hôm nay; kiểm tra scheduler riêng nếu nhiệm vụ liên quan lịch.
- Tỷ lệ với mẫu số 0, tổng lượng giữa các đơn vị, phép so sánh kỳ trước có giá trị 0.
- Cùng SKU nhiều lô/vị trí: không nhầm số bản ghi, số SKU và tổng quantity.

## 3. Nghiệm thu giao diện

| Trường hợp | Điều cần kiểm tra |
|---|---|
| Chưa chọn kho | Không gọi query reporting; thông báo rõ |
| Đổi kho | Mọi khối theo đúng kho, không giữ chi tiết nhóm kho cũ |
| Đổi kỳ | Request/query key/nhãn đúng kỳ và đúng khối áp dụng |
| Đổi số lượng Top | Request và query key có limit; tiêu đề Top N và cả ba chart đúng lựa chọn |
| Top 15 | Nhãn các hàng vẫn hiện, có thể cuộn xem hàng cuối; tooltip đúng SKU/số lượng |
| Nhãn dài | SKU/tên hai dòng được cắt gọn để vừa trục; title SVG và tooltip có toàn bộ nhãn |
| Không có dữ liệu | Trống có giải thích, không gợi ý có hoạt động hoặc lỗi |
| API lỗi | Hiển thị lỗi/tải lại theo thiết kế đã chốt; không trình bày như số liệu 0 |
| Dữ liệu lớn/SKU dài | Nhãn vẫn phân biệt được, tooltip đầy đủ, không tràn layout |
| Responsive | Desktop/tablet/mobile, trục/legend/tooltip không che nội dung chính |
| Đơn vị | Số đơn, số lượng, phần trăm, VND được phân biệt ở nhãn và tooltip |
| Chọn nhóm tuổi | Bấm chart/legend/chip hiển thị đúng nhóm và loading chi tiết |
| Nhóm tuổi mới | Pie/legend và nút chi tiết có 0–90, 91–180, 181–360, trên 360; ngày 180 chỉ thuộc nhóm thứ hai |
| Giới hạn 500 dòng | Không gọi danh sách giới hạn là toàn bộ khi còn dữ liệu |
| Quyền | Test admin và vai trò mục tiêu; UI guard và API độc lập; kiểm tra kho được phép |
| Demo offline | Ghi rõ dùng snapshot adapter; không coi là kiểm chứng backend thật |

Một số mục là tiêu chí cho giao diện tương lai, chưa có trong UI hiện tại. Kết quả nghiệm thu phải ghi rõ đang kiểm tra baseline hay một thay đổi cụ thể.

## 4. Các lớp kiểm tra cần báo cáo

1. **Tĩnh:** đường dẫn/types, `npm run build`, lint phù hợp, compile Python nếu có sửa backend.
2. **Số liệu:** dataset nhỏ tính tay → service/API → UI cùng phạm vi.
3. **Tương tác:** đổi kho/kỳ/nhóm, empty/loading/error, quyền và responsive.
4. **Vận hành dữ liệu:** chỉ khi có đổi snapshot/DB; kiểm tra môi trường test, thời gian và khả năng chạy lại.

Mẫu kết quả bàn giao:

```text
Đã chạy: <lệnh/tình huống>, kết quả <...>
Đối chiếu số liệu: <dataset/phạm vi>, expected <...>, actual <...>
Chưa chạy: <...>, lý do <...>
Source/docs đã cập nhật: <...>
```

Không ghi thông tin truy cập, token hoặc dữ liệu sản xuất vào bằng chứng. Với nhiệm vụ chỉ sửa docs, kiểm tra liên kết/source và diff là đủ; không cần chạy bộ kiểm tra ứng dụng.

## 5. Kiểm tra tự động kỳ xu hướng — 2026-10-16

Tại `backend/`:

```powershell
.venv/Scripts/python.exe -m unittest discover -s tests -p 'test_dashboard_trend*.py' -v
```

- [test_dashboard_trend_periods.py](../../backend/tests/test_dashboard_trend_periods.py): ranh giới tuần/tháng/quý/năm, năm nhuận, thứ Hai/Chủ nhật, năm mới, thứ tự và tính liên tục, không có ngày tương lai.
- [test_dashboard_trend_service.py](../../backend/tests/test_dashboard_trend_service.py): dữ liệu nhỏ tính tay, gộp đơn/tồn theo tháng, tồn theo ngày, thiếu snapshot, ưu tiên snapshot hôm nay và API chấp nhận bốn mode/mặc định week/từ chối mode cũ.
- Đã chạy **18 tests, đều đạt**. Service đọc DB được mock, API dùng app test riêng và override DB/auth; không chứng minh truy vấn trên DB thật hoặc quyền vận hành thực tế.
- Frontend: bundle Vite trực tiếp vào thư mục tạm đã build thành công. `npm.cmd run build` vẫn dừng ở 30 lỗi TypeScript có sẵn; đã so sánh trước/sau, không có diagnostic mới hoặc thay đổi. Full lint trước sửa có 62 lỗi/8 cảnh báo; lint hai file frontend được sửa vẫn có đúng 2 lỗi effect có sẵn trong ReportPage, không phát sinh lỗi mới.
- Chưa kiểm tra trình duyệt hoặc dữ liệu DB thật; không coi backend tests/bundle build là nghiệm thu UI thực tế.

## 6. Kiểm tra Top 5/10/15 và kỳ 3 tháng — 2026-10-16

Tại `backend/`, chạy toàn bộ regression reporting:

```powershell
.venv/Scripts/python.exe -m unittest discover -s tests -p 'test_dashboard_*.py' -v
```

- [test_dashboard_top_products.py](../../backend/tests/test_dashboard_top_products.py): cửa sổ rolling 7/30/90 ngày qua tháng/năm nhuận; SQL biên dịch cho cả ba nhóm ở limit 5/10/15; chuyển kỳ/limit vào service; chín tổ hợp API; mặc định cũ và tham số không hợp lệ.
- Đã chạy **26 tests reporting, đều đạt** (18 tests xu hướng + 8 tests Top). SQL được biên dịch theo dialect PostgreSQL, việc đọc và DB/auth API được mock; chưa chạy trên database thật.
- Lint bốn file frontend liên quan không có diagnostic mới so với trước nhiệm vụ; ReportPage vẫn có hai lỗi effect có sẵn.
- Bundle Vite vào thư mục tạm đã build thành công. Build chuẩn vẫn dừng ở đúng 30 lỗi TypeScript có sẵn, không có diagnostic mới hoặc thay đổi. Kiểm tra liên kết docs, compile Python và `git diff --check` đạt; chưa kiểm tra trình duyệt/DB thật.

## 7. Nhãn SKU + tên sản phẩm — 2026-10-16

- Đối chiếu chỉ đọc ba dòng Item (id/sku/name) để xác minh SKU dạng số và tên thực; không cập nhật dữ liệu kho. Đây là xác minh nhãn, không phải đối chiếu tổng nhập/xuất/tồn.
- Thêm regression cho SKU dạng số, SKU chữ và số 0 đầu; API bổ sung sku/name, giữ label cũ.
- Đã chạy **27 tests reporting, đều đạt**. Chưa nghiệm thu bố cục hai dòng trên trình duyệt thực tế.
- Bundle Vite, compile Python, liên kết docs và diff check đạt. TypeScript vẫn có đúng 30 lỗi có sẵn, lint hai file frontend vẫn có hai lỗi effect cũ; không thêm diagnostic mới trong nhiệm vụ nhãn sản phẩm.

## 8. Bốn nhóm tuổi tồn — 2026-10-19

- [test_dashboard_stock_aging.py](../../backend/tests/test_dashboard_stock_aging.py): chạy CASE và biểu thức lọc chi tiết trên hằng số bằng SQLite in-memory; các mốc 0/90/91/180/181/360/361 và toàn bộ 0–366 ngày chỉ thuộc đúng một nhóm.
- Kiểm tra tổng quan trả đủ bốn nhóm, kho trống, tỷ trọng bốn nhóm, API nhận bốn mã mới và từ chối mã cũ/thiếu mã.
- Chạy `python -m unittest discover -s tests -p 'test_dashboard_*.py' -v`: **35 tests đạt** (27 tests cũ + 8 tests tuổi tồn). Không truy cập DB kho/Redis/AMR trong các tests; chưa kiểm tra UI trên trình duyệt.
- Bundle Vite, compile Python, liên kết docs và diff check đạt. Build TypeScript vẫn có đúng 30 lỗi cũ, không thêm diagnostic; lint hai file frontend có đúng hai lỗi effect cũ trong ReportPage.
