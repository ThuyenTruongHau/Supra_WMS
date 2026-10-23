# Ghi chú cho việc kéo dài nhiều phiên

Chỉ dùng khi việc đủ dài hoặc có quyết định cần nhớ. Việc nhỏ có thể thực hiện
trực tiếp từ chat theo [workflow](../workflow.md), không cần thêm hồ sơ riêng.

Đặt tên file `YYYY-MM-DD-ten-viec.md`. Đây là ghi chú làm việc cá nhân, không yêu
cầu tạo PR, phân công đội nhóm hoặc phê duyệt lại mọi bước kỹ thuật.

## Mẫu

```markdown
# Tên việc

Ngày bắt đầu:
Trạng thái: đang khảo sát / đang làm / cần thông tin / hoàn tất
Nhánh và commit bắt đầu:

## Mục tiêu và ví dụ
- Người dùng cần gì:
- Hiện tại:
- Mong muốn:
- Điều cần giữ nguyên:

## Phạm vi
- Được thay đổi:
- Môi trường/side effect được giao (nếu có):

## Hiện trạng đã đọc
- File/hàm và vai trò:
- Luồng dữ liệu/tác động:
- Phần chưa rõ hoặc mục Q liên quan:

## Việc cần làm
- [ ] ...

## Quyết định đã chốt
- Ngày — quyết định — lý do:

## Kiểm chứng
| Lệnh/thao tác | Môi trường | Kết quả quan sát | Giới hạn |
| --- | --- | --- | --- |

## Bàn giao phiên tiếp theo
- Đã làm:
- Còn lại:
- Bước tiếp theo:
- Tài liệu đã cập nhật:
- Cần build/restart/migration/triển khai gì:
```

Codex đọc ghi chú này cùng source hiện tại khi tiếp tục. Không cần chép toàn bộ
chat hoặc mọi bước tìm kiếm; lưu những kết luận và công việc giúp tiếp tục chính xác.
