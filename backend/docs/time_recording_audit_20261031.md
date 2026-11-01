# Rà soát thời gian ghi nhận thao tác — 31/10/2026

Đối chiếu mã nguồn, truy vấn chỉ đọc PostgreSQL và mô phỏng chuyển múi giờ.
Các kết quả rà soát bên dưới mô tả tình trạng trước khi sửa. Kết quả khắc phục
được ghi ở cuối tài liệu.

## Kết quả đã xác minh

- Phiên PostgreSQL đang dùng `Asia/Bangkok` (UTC+07:00); máy Windows kiểm tra
  cũng đang UTC+07:00. Các cột thời gian nghiệp vụ kiểm tra là `timestamp with time zone`.
- Có **434 allocation kết thúc chia chọn thuộc 6 đơn**, lệch sớm 7 giờ so với
  `history.created_at` của chính giao dịch xác nhận. Việc đối chiếu dựa vào
  `history.details.allocations[].allocation_id`, không chỉ dựa vào `updated_at`.
  Các giao dịch đối chiếu nằm từ 29/10/2026 14:58:43 đến 31/10/2026 11:25:18,
  theo giờ Việt Nam. Đây là phạm vi xác minh được, chưa phải số lượng toàn bộ
  mốc bắt đầu/kết thúc có thể cần khôi phục.
- Trong các mốc robot có callback hoàn thành để đối chiếu, **98 allocation
  xuất/hoàn trả** có `end_time` lệch khoảng 7 giờ so với callback mã 8:
  97 dòng ngày 28/10 và 1 dòng ngày 30/10. Các dòng này cần đối chiếu trước khi sửa.
- **125 mốc kết thúc nhập kho** có callback tương ứng kiểm tra được đều cách
  callback dưới 1 phút, không có trường hợp lệch 7 giờ trong mẫu này.
- Có **115 allocation xuất** đã có giờ kết thúc chia chọn nhưng thiếu giờ bắt đầu.
  Đây là vấn đề độ đầy đủ của dữ liệu, cần xem riêng với vấn đề múi giờ.

| Đơn xuất | Số allocation kết thúc chia chọn lệch 7 giờ |
| --- | ---: |
| OUT-20261031-101541 | 22 |
| OUT-20261031-065830 | 92 |
| OUT-20261030-163858 | 112 |
| OUT-20261030-114004 | 99 |
| OUT-20261030-065826 | 82 |
| OUT-20261029-132234 | 27 |

### Ví dụ đối chiếu

Allocation **2340**, đơn **OUT-20261031-101541**, ngày 31/10/2026:

| Mốc | Giá trị đang lưu/đối chiếu theo UTC+07:00 |
| --- | --- |
| Robot kết thúc | 11:24:38.484120 |
| Bắt đầu chia chọn | 04:25:14.150497 |
| Kết thúc chia chọn | 04:25:18.011297 |
| Lịch sử xác nhận hoàn tất | 11:25:18.019211 |

Log API cũng ghi `04:25:18` tại thời điểm xác nhận này, cho thấy tiến trình
ghi log/thao tác dùng giờ UTC lúc đó. Khi được ghi thiếu múi giờ vào phiên DB
UTC+07:00, giờ `04:25` bị lưu thành `04:25+07:00` thay vì `11:25+07:00`.

## Nguyên nhân và các điểm cần sửa

1. **Ghi giờ không có múi giờ**:
   - `app/modules/masan/masan_outbound_service.py:2526`: bắt đầu chia chọn dùng
     `datetime.now()`, trả nguyên biến này sau commit.
   - Cùng file, dòng 2302: kết thúc chia chọn trong luồng thường và
     `manual_services` dùng `datetime.now()`.
   - `app/modules/robot/robot_service.py`: cả 5 chỗ ghi giờ bắt đầu/kết thúc
     robot dùng `datetime.now()`.
   - Giờ ghi phụ thuộc tiến trình chạy Windows hay container UTC. Nhánh
     `masan_auto_service.now()` đã dùng giờ UTC có múi giờ, vì vậy cùng hệ thống
     có cả mốc đúng và mốc sai.

2. **Phản hồi API không đồng nhất**:
   - Lần bắt đầu mới có thể trả `2026-10-31T04:25:14` không có offset.
   - Lần đọc lại từ PostgreSQL trả thời gian có offset `+07:00`.
   - Frontend `MonitorZoneInteractiveMap.tsx:17` dùng `dayjs(value)` theo múi
     giờ thiết bị, không chỉ định giờ Việt Nam. Chuỗi thiếu offset không cho
     frontend biết đó là giờ UTC. Header và nhiều bảng cũng dùng múi giờ thiết bị.

3. **Excel chưa chuẩn hóa múi giờ**:
   - `_format_outbound_report_datetime()` và `_format_inbound_report_datetime()`
     gọi `strftime()` trực tiếp. Khi đầu vào là UTC có múi giờ, Excel vẫn in giờ UTC.
   - Dữ liệu sai sẵn trong DB cũng được xuất nguyên giá trị đang sai.

4. **Ý nghĩa thời điểm ghi nhận**:
   - Bắt đầu chia: khi API xử lý yêu cầu nhấn chọn VT; lần nhấn lại trả giờ bắt
     đầu cũ (`already_started=true`), không phải giờ của lần nhấn hiện tại.
   - Kết thúc chia: khi server xử lý xác nhận CC. Luồng thường ghi lần đầu,
     xử lý từng allocation nên các dòng trong một thao tác có thể lệch nhau ít giây.
   - Robot: bắt đầu khi xử lý callback `subTaskStatus=2/subTaskSeq=2`;
     kết thúc khi xử lý callback `status=8`. Payload đang dùng không có mốc
     thời gian sự kiện robot; thời gian này là lúc WMS xử lý, có thể chậm theo hàng đợi.
   - `created_at` dùng `func.now()` là giờ bắt đầu transaction PostgreSQL,
     không phải chính xác lúc commit hoặc lúc người dùng chạm màn hình.

5. **Rủi ro khác trong rà soát**:
   - `masan_inbound_dispatch_service.py:321` dùng
     `timestamp.replace(tzinfo=timezone.utc)` ngay cả khi timestamp đã có offset.
     Việc gán lại múi giờ thay vì chuyển múi giờ làm thay đổi thời điểm thực,
     ảnh hưởng kiểm tra khoảng chờ phát lại công việc.
   - Một số nghiệp vụ QR/ngày báo cáo dùng `date.today()` theo máy chủ;
     cảnh báo lưu kho dùng ngày UTC. Cần thống nhất ngày nghiệp vụ Việt Nam,
     đặc biệt khoảng 00:00–06:59.
   - Log dùng múi giờ máy chủ và không in offset, gây khó đối chiếu giữa tiến trình.

## Hướng xử lý đề nghị

1. Dùng một hàm thời gian chung trả `datetime` có múi giờ UTC cho các mốc ghi
   nghiệp vụ; truyền ISO 8601 có `Z` hoặc offset qua API. Giữ nguyên thông tin
   múi giờ khi so sánh, dùng `astimezone()` để chuyển giờ đã có offset.
2. Giao diện, đồng hồ và Excel chuyển rõ sang `Asia/Ho_Chi_Minh` khi hiển thị;
   các phép lấy ngày nghiệp vụ dùng cùng múi giờ Việt Nam.
3. Kiểm thử với server UTC, DB UTC+07:00 và browser UTC/UTC+07:00; bao gồm
   ngày đổi lúc nửa đêm, lần bắt đầu mới/đọc lại, callback lặp và xuất Excel.
4. Sau khi sửa nguồn ghi, lập bản sao và kế hoạch khôi phục từng dòng dựa vào
   lịch sử/callback. Dữ liệu cũ có cả mốc đúng và mốc sai; cần phân loại theo
   bằng chứng trước khi cập nhật. Mốc bắt đầu thiếu cần đối chiếu riêng.

## Mô phỏng xác nhận

Trong phiên PostgreSQL UTC+07:00, các biểu thức SELECT chỉ đọc cho kết quả:

```text
'2026-10-31 04:25:18.011297'::timestamptz
    -> 2026-10-31 04:25:18.011297+07:00
'2026-10-31 04:25:18.011297+00:00'::timestamptz
    -> 2026-10-31 11:25:18.011297+07:00
```

Mô phỏng Pydantic và Day.js xác nhận phản hồi thiếu offset bị hiển thị `04:25`
trên thiết bị Việt Nam; cùng thời điểm có `Z` hiển thị đúng `11:25` trên thiết bị
Việt Nam. Formatter Excel hiện in `04:25` với đầu vào UTC có offset, cho thấy
cần sửa cả nguồn ghi lẫn định dạng đầu ra.

## Đã khắc phục ngày 31/10/2026

- Thêm `app/core/time.py`: mốc nghiệp vụ mới có offset `+07:00`, ngày nghiệp vụ
  dùng `Asia/Ho_Chi_Minh`. Kết nối PostgreSQL của ứng dụng chỉ định cùng timezone.
- Chuẩn hóa giờ chia chọn, robot, phản hồi bắt đầu chia, Excel, QR/ngày báo cáo,
  log có offset; sửa chuyển múi giờ trong phép so sánh khoảng chờ phát lệnh.
- Giao diện dùng chung `utils/vietnamTime.ts` cho giờ chia, bảng dữ liệu, đồng hồ,
  thông báo, mã đơn và ngày xuất. Bộ lọc ngày giờ diễn giải lựa chọn theo giờ Việt Nam.
- Đã khôi phục **532 allocation / 1.047 mốc thời gian** có bằng chứng đối chiếu:
  97 `start_time`, 98 `end_time`, 418 `start_sorting_time`, 434 `end_sorting_time`.
  Script `scripts/repair_event_timezones.py` mặc định chỉ đọc, kiểm tra phạm vi
  trước khi áp dụng, khóa dòng và lưu bản sao trước khi cập nhật. Việc kiểm tra
  toàn bộ dòng trước commit xác nhận các trường khác, kể cả `updated_at`, giữ nguyên.
- Bản sao: `.recovery/event_timezone_before_20261031T074941282592Z.json`.
  Chạy lại chế độ chỉ đọc sau commit trả **0 dòng cần sửa**.
- Allocation 2340 hiện bắt đầu chia `11:25:14`, kết thúc `11:25:18`, đúng với
  lịch sử. Excel xuất lại xác nhận giờ `11:25:18`:
  `.recovery/OUT-20261031-101541_BaoCaoXuat.xlsx`.
- Giữ nguyên **115 mốc bắt đầu còn thiếu** và các mốc đã đúng; dữ liệu thiếu
  cần chứng cứ riêng để điền, không suy đoán từ giờ kết thúc.
- Kiểm thử bao gồm UTC/UTC+07:00/New York, ranh giới ngày, ghi/đọc lại giờ chia,
  callback robot, Excel, log, ngày QR/tồn kho và tính an toàn của kế hoạch khôi phục.
  Frontend build thành công. TypeScript toàn kho vẫn có **125 lỗi có sẵn**;
  so sánh bằng compiler với nội dung file trước thay đổi cho thấy **0 lỗi mới**.
