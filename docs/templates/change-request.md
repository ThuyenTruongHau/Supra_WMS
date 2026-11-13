# Mẫu nhiệm vụ thay đổi

AI điền dựa trên yêu cầu và khảo sát; lược bỏ phần không áp dụng. Đây là cấu trúc làm việc, không phải biểu mẫu bắt buộc người dùng điền.

## Mục tiêu và hiện trạng

- Vấn đề/kết quả muốn đạt:
- Người sử dụng:
- Hành vi hiện tại và nguồn xác minh:
- Hành vi mong muốn, ví dụ trước/sau:
- Loại thay đổi: giao diện / công thức / API / dữ liệu / hiệu năng / kết hợp.

## Phạm vi và cách thực hiện

- File/API/model dự kiến liên quan:
- Logic có thể tái sử dụng:
- Ảnh hưởng tới màn hình khác, quyền, snapshot hoặc dữ liệu:
- Thông tin còn thiếu và phần có thể làm ngay:

## Định nghĩa chỉ số, nếu có

- Nguồn và công thức:
- Đơn vị/quy đổi/làm tròn:
- Phạm vi kho, zone, active, stock level, status:
- Trường thời gian, timezone, ranh giới kỳ:
- Phân biệt tồn hiện tại và dữ liệu lịch sử:
- Null, 0, dữ liệu thiếu, lỗi API:
- Giới hạn/phân trang và truy xuất chi tiết:

## Tiêu chí nghiệm thu

| Tình huống | Dữ liệu/thao tác | Kết quả mong muốn |
|---|---|---|
| Luồng chính | Điền ví dụ cụ thể | Điền kết quả có thể kiểm tra |
| Trường hợp biên | Zero/null, mốc thời gian, trạng thái | Điền kết quả |
| Phân quyền/kho | Đổi kho, vai trò phù hợp | Điền kết quả |

## Bàn giao

- Source và docs đã đổi:
- Kiểm tra đã chạy và kết quả:
- Giới hạn/chưa kiểm chứng:
- Quyết định cần lưu và việc còn lại:
