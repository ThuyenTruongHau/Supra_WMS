# Quy trình làm việc với AI

## Mục tiêu

Hiểu hệ thống có căn cứ, sửa tính năng hiện có, phát triển tính năng mới và lưu lại kiến thức cho phiên tiếp theo. Ưu tiên hiện tại là reporting; các module khác được khảo sát sâu khi nhiệm vụ cần đến.

## 1. Bắt đầu phiên

AI đọc [AGENTS.md](../AGENTS.md), [mục lục](README.md), [bản đồ source](code-map.md), tài liệu phân hệ liên quan. Kiểm tra working tree và phần thay đổi có sẵn. Không coi toàn bộ source chưa commit là thay đổi do AI tạo.

Đọc docs theo nhu cầu, rồi xác minh các file thực sự sẽ sửa. Nếu docs và code khác nhau, xác định do docs cũ, code đang thay đổi hay yêu cầu nghiệp vụ mới; ghi nhận thay vì âm thầm chọn một phía.

## 2. Hiểu yêu cầu và tiêu chí nghiệm thu

Người dùng mô tả vấn đề hoặc kết quả muốn đạt. AI điền các phần cần thiết trong [mẫu nhiệm vụ](templates/change-request.md): người dùng, hiện trạng, mong muốn, phạm vi, ví dụ nghiệm thu. Không bắt người dùng điền hết biểu mẫu; AI tự tìm thông tin trong docs/source trước.

Chỉ hỏi điều còn thiếu có thể làm thay đổi cách triển khai. Tiến hành độc lập phần không phụ thuộc câu trả lời. Với reporting, xác định nhiệm vụ là trình bày, công thức, báo cáo mới, hiệu năng hay kết hợp.

## 3. Lần theo source và thiết kế thay đổi

- Chỉ ra page/hook/API/service/model liên quan và nơi có logic có thể tái sử dụng.
- Ghi tác động lên query keys, dữ liệu, quyền, lịch snapshot và các màn hình dùng chung nếu có.
- Với chỉnh giao diện: giữ nguyên nghĩa dữ liệu nếu yêu cầu không đổi công thức.
- Với chỉ số mới: xác định nguồn, đơn vị, phạm vi kho/zone/status, mốc thời gian, xử lý null/zero, phân trang/giới hạn và ví dụ tính tay.
- Thay đổi nhỏ có thể triển khai trực tiếp trong phạm vi đã giao. Thay đổi nghiệp vụ còn chưa rõ cần làm rõ điểm đó trước; không yêu cầu duyệt lại mọi bước thường lệ.

## 4. Triển khai theo phạm vi

Tái sử dụng logic phù hợp, giữ hợp đồng API/types nhất quán. Không tự tái cấu trúc luồng nhập/xuất hoặc gửi lệnh AMR khi nhiệm vụ chỉ là báo cáo. Không chạy tác vụ có hiệu ứng vận hành để kiểm thử một màn hình đọc dữ liệu.

## 5. Kiểm chứng

Chọn kiểm tra theo [development](development.md). Reporting dùng thêm [ma trận kiểm chứng](reporting/validation.md). Kiểm tra đủ UI và số liệu; một ảnh đẹp hoặc build thành công không chứng minh công thức đúng.

Nếu có lỗi kiểm tra sẵn từ trước, phân biệt với lỗi do thay đổi bằng bằng chứng phù hợp. Không tự sửa lỗi ngoài phạm vi chỉ để có kết quả xanh. Nêu những phần chưa kiểm tra được và lý do cụ thể.

## 6. Cập nhật docs trong cùng nhiệm vụ

| Thay đổi | Tài liệu cần xem/cập nhật |
|---|---|
| Đổi file đầu mối, route, module | `code-map.md`, `feature-catalog.md`, overview phân hệ |
| Đổi schema/quan hệ/đơn vị | `data-model.md`, API/metrics liên quan |
| Đổi công thức/phạm vi/thời gian | `reporting/metrics.md`, `reporting/validation.md` |
| Đổi biểu đồ/filter/tương tác | `reporting/overview.md`, tiêu chí UI trong validation |
| Thêm báo cáo/chỉ số | Catalog, overview, metrics, validation; cập nhật trạng thái roadmap |
| Đổi lệnh chạy/dependency/task định kỳ | `development.md`, overview liên quan |
| Chốt một lựa chọn có tác động dài hạn | `decisions.md` |
| Thay đổi thuần nội bộ, không đổi hợp đồng/hành vi | Chỉ cập nhật docs nếu bản đồ hoặc hướng dẫn thực sự bị ảnh hưởng |

Không chuyển đề xuất thành hiện trạng trước khi code được triển khai. Ghi ngày đối chiếu của phần thay đổi; không cập nhật ngày toàn bộ docs để tạo cảm giác mọi phân hệ đã được kiểm tra lại.

## 7. Bàn giao và tiếp nối

AI nêu kết quả, phần source/docs đã đổi, kiểm tra thực tế đã chạy, điểm chưa xác minh và quyết định còn mở. Cập nhật [lịch sử docs](changelog.md) cho thay đổi đáng chú ý. Không cần lưu toàn bộ hội thoại vào repo.

Nếu nhiệm vụ kéo dài nhiều phiên, tạo một ghi chú nhiệm vụ trong `docs/tasks/` khi cần, ghi mục tiêu, trạng thái, file liên quan, kiểm tra và việc còn lại. Chỉ lưu thông tin giúp tiếp tục công việc; khi hoàn thành, chuyển kiến thức lâu dài về tài liệu phân hệ.

## Ví dụ giao việc

> Dựa vào `AGENTS.md` và `docs/reporting/`, cải thiện biểu đồ nhập/xuất để dễ so sánh theo ngày. Giữ định nghĩa số đơn hiện tại. Đọc source, thực hiện thay đổi, kiểm tra và cập nhật tài liệu bị ảnh hưởng.

> Dựa vào docs, khảo sát cách đưa số SKU dưới mức tối thiểu lên báo cáo. Kiểm tra `analyze_items()` trước khi tạo API mới. Nêu rõ phạm vi tồn dùng để tính, bổ sung kiểm chứng và cập nhật docs trong cùng nhiệm vụ.
