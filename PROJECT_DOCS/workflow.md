# Làm việc một mình với Codex

Phạm vi: quy trình được lựa chọn cho dự án này, bắt đầu 20/10/2026. Đây là quy ước
làm việc của chủ dự án, không phải tập tính năng bắt buộc của mọi công cụ AI.

## Tiếp nhận source lần đầu

1. Ghi nhánh/commit và `git status --short`, xác định có thay đổi chưa commit hay không.
2. Đọc manifest, entrypoint, router và cấu hình triển khai. Lập bản đồ hệ thống và các điểm vào.
3. Chọn một luồng đại diện để lần theo từ thao tác người dùng đến dữ liệu và hệ thống ngoài.
4. Phân biệt hiện trạng code với nghiệp vụ mong muốn. Ghi phần chưa rõ vào [questions.md](questions.md).
5. Chạy kiểm tra phù hợp có thể cách ly; ghi chính xác phạm vi và kết quả. Chưa khảo sát test thì chưa chạy cả bộ với cấu hình server thật.
6. Lưu kết quả vào bộ tài liệu mới; dùng làm điểm bắt đầu cho các tác vụ tiếp theo.

Các bước này không mặc định bao gồm sửa nghiệp vụ, nâng dependency, migration hoặc triển khai.

## Bắt đầu mỗi việc

Bạn cung cấp mục tiêu bằng ngôn ngữ nghiệp vụ, ví dụ, hành vi mong muốn và điều cần
giữ nguyên. Không cần tự đoán trước mọi file phải sửa.

Codex kiểm tra trạng thái Git, đọc docs phù hợp rồi lần theo code. Việc nhỏ có thể
triển khai trực tiếp trong phạm vi được giao; việc dài hoặc có quyết định thiết kế
quan trọng dùng [mẫu task](tasks/README.md). Không cần tạo một tài liệu riêng cho
mỗi thay đổi câu chữ hoặc CSS.

| Loại việc | Cách làm |
| --- | --- |
| Giải thích/tìm hiểu | Đọc source, đưa đường đi và bằng chứng; không sửa ứng dụng |
| Sửa lỗi | Lấy dấu hiệu lỗi/log, tìm tầng hỏng, sửa phạm vi cần thiết, kiểm tra lại tình huống |
| Thêm tính năng | Chốt hành vi, request/response, trạng thái UI và tiêu chí hoàn thành; triển khai đủ các tầng liên quan |
| Refactor | Ghi hành vi cần giữ, cách so sánh trước/sau và các bên gọi bị ảnh hưởng |
| Vận hành | Xác định đúng môi trường, phiên bản đang chạy, tác động và cách kiểm chứng; phân biệt với sửa code trên máy |

## Ba mẫu giao việc

### Tìm hiểu trước khi sửa

```text
Đọc AGENTS.md và tài liệu mới trong PROJECT_DOCS.
Hãy lần theo chức năng [tên chức năng] từ giao diện đến backend và dữ liệu.
Chỉ đọc và phân tích. Cho biết file/hàm chính, quy tắc thấy trong code,
phần chưa rõ và nơi cần sửa nếu muốn [thay đổi mong muốn].
Không dùng docs cũ làm căn cứ.
```

### Triển khai một thay đổi

```text
Mục tiêu: [kết quả người dùng cần].
Hiện tại: [thao tác và kết quả đang gặp].
Mong muốn: [ví dụ cụ thể, bao gồm trường hợp lỗi/rỗng nếu có].
Giữ nguyên: [quy tắc hoặc chức năng liên quan].
Phạm vi: [chỉ code/test/docs, hoặc có vận hành môi trường cụ thể].
Đọc tài liệu mới, đối chiếu code, triển khai và chạy kiểm tra phù hợp.
Báo rõ phần đã xác minh, phần chưa xác minh và cách áp dụng thay đổi.
```

### Điều tra sự cố

```text
Triệu chứng: [thông báo lỗi hoặc hành vi].
Thao tác trước lỗi: [các bước].
Thời điểm/môi trường: [nếu biết].
Mã tham chiếu: [orderId/job_id/detail_id nếu có].
Hãy đọc code và log liên quan, xác định lỗi nằm ở tầng nào bằng bằng chứng.
Phạm vi xử lý: [phân tích, hoặc sửa code, hoặc cập nhật dịch vụ cụ thể].
Không tự phát lại các lệnh robot cũ chưa xác định rõ.
```

## Kết thúc một việc

Kết quả bàn giao cần đủ để phiên sau tiếp tục:

- Hành vi đã thay đổi và các file chính.
- Lệnh kiểm tra đã chạy, kết quả và phạm vi: utility, API giả lập hay tích hợp thật.
- Hạn chế, lỗi còn tồn tại hoặc câu hỏi nghiệp vụ còn mở.
- Có cần migration, build image, cập nhật worker, thay cấu hình hoặc tải lại FE hay không.
- Tài liệu nào đã cập nhật; bước tiếp theo nếu công việc chưa hoàn tất.

Đã sửa code, build thành công, API trả 202 và robot hoàn thành là những mức bằng
chứng khác nhau. Khi báo kết quả, dùng đúng mức đã quan sát.

## Duy trì ngữ cảnh qua nhiều phiên

Mỗi task dài có một ghi chú trong `PROJECT_DOCS/tasks/`, bám mẫu đã cung cấp. Đầu
phiên mới yêu cầu Codex đọc ghi chú đó và kiểm tra lại source/runtime liên quan.
Những kết luận đã thành quy tắc chung được chuyển vào trang chức năng; trạng thái
đang làm nằm trong task note. Git lưu lịch sử thay đổi code và docs cùng nhau.

## Vai trò của AGENTS.md

`AGENTS.md` chứa chỉ dẫn ngắn và liên kết; chi tiết hệ thống nằm trong các trang
theo nhu cầu. Codex hỗ trợ chỉ dẫn AGENTS theo phạm vi thư mục; cách nạp chỉ dẫn
được mô tả trong [hướng dẫn chính thức của OpenAI](https://learn.chatgpt.com/docs/agent-configuration/agents-md).

Quy trình ở trang này do dự án lựa chọn. Có thể điều chỉnh khi cách làm thực tế
cho thấy bước nào lặp lại, thiếu thông tin hoặc tốn công không cần thiết.
