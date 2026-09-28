# Đề xuất Kiến trúc Refactor Bản đồ Operator (Map Refactoring)

Dựa trên cấu trúc hiện tại của `InboundBufferMapCanvas` và `OutboundSortingMapCanvas`, dưới đây là phân tích và đề xuất quy hoạch lại kiến trúc Frontend và Backend để tối ưu hiệu năng và dễ dàng bảo trì về sau.

## 1. Đánh giá Thiết kế API (Gộp hay Tách?)

**Hiện trạng:** API `/inbound-buffers/view` đang gộp chung cả tọa độ tĩnh (`MapData`) và dữ liệu trạm (`points`/`status`) vào một payload duy nhất.

**Đánh giá:**
- Cấu trúc vật lý của kho (tọa độ x, y của kệ, đường line) **rất hiếm khi thay đổi**.
- Trong khi đó, trạng thái của các trạm (đang có bao nhiêu đơn, xe nào, trạng thái lấy hàng) lại **thay đổi liên tục** (realtime).
- Việc gộp chung khiến mỗi lần Operator cần cập nhật trạng thái mới nhất, hệ thống phải tải lại cả cục `MapData` khổng lồ, gây tốn băng thông và làm chậm ứng dụng.

**👉 Đề xuất cho Backend: NÊN TÁCH LÀM 2 API** (Giống như cách `WarehouseMapCanvas` của Admin đang làm).
*(Thông tin thêm: Hiện tại `WarehouseMapCanvas` của Admin đang lấy dữ liệu từ 2 APIs riêng biệt: 
1. Tọa độ tĩnh (Layout) gọi từ `GET /api/v1/warehouse-maps/{warehouseId}/map-data` 
2. Trạng thái động (Status) gọi từ `GET /api/v1/warehouse-locations/{warehouseId}/for-map`)*

### API 1: Lấy Tọa độ tĩnh (Static Layout)
- **Endpoint:** `GET /api/v1/warehouse-maps/zones/{zone_id}/map-data` (Tên API tương đồng với bản đồ Admin)
- **Params:** Chỉ cần `zone_id` trên path.
- **Output:** Trả về `MapData` (nodes, edges) của riêng `zone_id` đó.
- **Đặc điểm:** API này sẽ được Frontend cache cứng ở client (staleTime lớn).

### API 2: Lấy Trạng thái động (Dynamic Status)
- **Endpoint:** `GET /api/v1/warehouse-locations/zones/{zone_id}/for-map` (Tương tự Admin `for-map`)
- **Params:** Chỉ cần `zone_id` trên path.
- **Output:** Danh sách các trạm (`points`) thuộc `zone_id` kèm trạng thái (đang bận, rảnh, số lượng hàng, loại bypass/inbound).
- **Đặc điểm:** API này nhẹ, có thể cấu hình Polling (fetch liên tục mỗi 5s) hoặc dùng WebSocket để cập nhật trạng thái realtime mà không làm đơ giao diện.

---

## 2. Đánh giá Thiết kế Component (Gộp hay Tách Inbound/Outbound?)

**Hiện trạng:** `InboundBufferMapCanvas` (1013 dòng) và `OutboundSortingMapCanvas` (1014 dòng) đang copy-paste code của nhau đến 95%. Điểm khác biệt duy nhất là Inbound có thêm nét vẽ đường ranh giới phân cách giữa Buffer thường và Bypass.

**Đánh giá:**
- Việc duy trì 2 file khổng lồ với logic tính toán Canvas y hệt nhau là ác mộng bảo trì (sửa bug zoom/pan ở file này phải nhớ qua file kia sửa theo).
- Sự khác biệt về đường phân cách (Bypass/Thường) là rất nhỏ so với lượng code chung.

**👉 Đề xuất cho Frontend: NÊN GỘP THÀNH 1 COMPONENT CHUNG.**

Tạo ra một component mới tên là `OperatorMapCanvas` và chỉ nhận cờ (flag) để phân biệt lúc vẽ UI:

```tsx
interface OperatorMapCanvasProps {
  zoneId: number;
  showInboundSeparator?: boolean; 
  // Giải thích: 
  // Vì 1 zone ở thực tế tương ứng với chuyên biệt trạm nhập hoặc trạm xuất, 
  // API Backend KHÔNG cần truyền thêm `location_type` để lọc nữa (chỉ cần gọi theo zoneId là đủ).
  // Tuy nhiên ở Frontend, ta thêm cờ `showInboundSeparator` CỰC KỲ ĐƠN GIẢN chỉ để phục vụ mục đích UI:
  // - Nếu `showInboundSeparator = true` (khi dùng cho Inbound) -> UI vẽ thêm vạch kẻ phân chia Bypass.
  // - Mặc định (khi dùng cho Outbound hoặc các khu vực tương lai khác) -> UI không vẽ vạch.
}
```

### Cách xử lý đường phân cách Inbound bên trong render loop:
Bên trong file `utils/warehouseMapShelfDraw.ts`, chúng ta chỉ cần check cờ này:

```ts
if (showInboundSeparator) {
   drawInboundBypassSeparator(ctx, points);
}
```
Phần còn lại (tính toán Bounding Box, Zoom, Pan, Click event, Render kệ hàng, Render trạm) đều dùng chung 100% logic.

---

## 3. Kế hoạch Triển khai Frontend (Chi tiết)

Vì Backend sẽ tiến hành phát triển và cung cấp 2 API mới ngay lập tức, Frontend sẽ tích hợp trực tiếp mà không cần làm Mocking Adapter.

### Bước 1: Khởi tạo các Hook Fetch Data Mới
Khi Backend hoàn thành, tạo 2 hook React Query mới:
- `useOperatorMapLayout(zoneId)`: Gọi API `map-data`.
- `useOperatorMapStatus(zoneId)`: Gọi API `for-map`.

### Bước 2: Chuẩn hóa Interface cho Component Chung
Định nghĩa `OperatorMapCanvasProps` rõ ràng, tách bạch:
```tsx
interface OperatorMapCanvasProps {
  zoneId: number;
  showInboundSeparator?: boolean; // Cờ UI vẽ vạch phân cách
  onStationClick?: (stationId: number) => void;
  selectedStationId?: number | null;
  className?: string;
}
```

### Bước 3: Tách Canvas Logic ra Custom Hook (`useMapCanvas`)
Thay vì nhét 1000 dòng code tính toán Zoom, Pan, BoundingBox, Event Listeners vào trong Component React, ta sẽ chuyển toàn bộ logic tương tác Canvas vào một hook riêng `useMapCanvas(canvasRef, layoutData, statusData)`.
- Điều này giúp `OperatorMapCanvas.tsx` trở nên cực kỳ mỏng (chỉ khoảng 100-200 dòng) chuyên lo hiển thị React (DOM, Overlay, Loading spinner).

### Bước 4: Tách hàm vẽ Ranh giới Bypass
Hiện tại logic vẽ `drawInboundBypassSeparator` đang nằm "cứng" trong file Component. Ta sẽ tách hàm này đưa vào `utils/warehouseMapShelfDraw.ts` để gọi chung dựa trên cờ `showInboundSeparator`.
