# Kế hoạch Refactor chi tiết: Sửa lỗi nhầm lẫn Zone và Warehouse ở Frontend

Bảng dưới đây liệt kê chi tiết các lỗi nhầm lẫn `zone_id` và `warehouse_id` ở Frontend. Tạm thời **KHÔNG ĐỤNG CHẠM GÌ ĐẾN CÁC TRANG ADMIN** để đảm bảo an toàn. Các phần lỗi của Operator (như `useProduct` hay `outboundTask`) sẽ được Note lại thành một cụm ở Phần 3 để bạn có thể rảnh rỗi xử lý sau.

---

## 1. Nhóm File API Vị trí (Location)

### 1.1 `frontend/src/api/warehouseLocation.ts`
- **Tình trạng hiện tại:** Hàm `getLocationsByZoneApi` và `getItemStockByZoneApi` đang bị sửa nhận vào `warehouseId` và gửi đi `params: { zone_id: warehouseId }`. 
- **Phân tích:** 
  - Đã rà soát lại: Các trang Admin Map hiện tại đang lấy dữ liệu qua file `warehouseMap.ts` (đã chuẩn), do đó Admin **không bị ảnh hưởng** bởi file `warehouseLocation.ts` này.
  - File `warehouseLocation.ts` này dường như chỉ phục vụ cho một số tính năng Operator / Xử lý lẻ tẻ. 
- **Hướng giải quyết (Tạm thời):** Tạm giữ nguyên chưa cần sửa vội để không làm hỏng Admin. Note lại để sửa sau cùng với các tính năng Operator (sẽ trả lại hàm này thành nhận `zoneId` chuẩn). 
- **Về hàm Tồn kho (`getItemStockByZone`):** Frontend đang gọi `/api/v1/item-stock`, nhưng Backend là `/item-stocks`. Dù sao tính năng này Frontend cũng chưa có UI nào render ra nên tạm thời cứ để đó.

---

## 2. Nhóm Chức năng Cũ / Đồ thừa (Đã chốt XÓA)

### 2.1 `frontend/src/api/node.ts` (Entry / Exit Point)
- **Kiểm tra Backend:** Đã scan và xác nhận Backend **hoàn toàn không tồn tại** bất kỳ API nào liên quan đến `/api/v1/nodes/`. 
- **Quyết định:** Giao diện `EntryPointSettingPage` và `ExitPointSettingPage` hiện tại không dùng tới. Bạn có thể tự tin **XÓA SẠCH** các file sau để dọn rác:
  - `frontend/src/api/node.ts`
  - `frontend/src/hooks/useNode.ts`
  - `EntryPointSettingPage.tsx`, `ExitPointSettingPage.tsx`, `NodeManagementPanel.tsx`.
- *(Không ảnh hưởng đến Admin).*

### 2.2 `frontend/src/api/inventoryAudit.ts`
- **Hiện trạng:** Code gọi `/api/v1/inventory-audits/` nhưng Backend lại xây dựng ở `/stocktakes`. Không có UI nào đang mount Hook này lên cả.
- **Quyết định:** Xóa file API này cho sạch (hoặc comment lại).

---

## 3. Nhóm Operator / Sorting (Note lại xử lý sau)

ĐÂY LÀ NHÓM CHƯA ĐỤNG VÀO (GIỮ NGUYÊN) ĐỂ TRÁNH SẬP GIAO DIỆN OPERATOR. BẠN CÓ THỂ XỬ LÝ VÀO DỊP KHÁC:

### 3.1 Vụ `useProduct` vs `useItem`
- **Tình trạng:** Trang Admin đang xài `useItem` (đã ngon lành). Chỉ có trang Operator đồ cổ xài `useProduct` (`frontend/src/api/product.ts`).
- **Ghi chú xử lý sau:** KHÔNG XÓA `useProduct` lúc này vì sẽ làm sập Operator. Khi nào bạn rảnh code lại luồng Operator, hãy chuyển dần các logic của `useProduct` sang `useItem` cẩn thận (vì Model dữ liệu trả về có thể khác nhau).

### 3.2 Vụ Map của Operator
- **Tình trạng:** Các trang như `OperatorMapCanvas` đang gọi chuẩn xác `useZoneMapLayout(zoneId)` (từ `warehouseMap.ts`) và chọc đúng API `/api/v1/warehouse-maps/zones/{zoneId}/map-data`. Chỗ này không bị lỗi script, **đang hoạt động đúng logic**.

### 3.3 Nhóm API Outbound Task / Sorting Order
- **Tình trạng:** Các file `outboundTask.ts`, `sortingOrder.ts`, `sortingWave.ts` bị script tự động sửa biến thành `warehouseId` nhưng URL vẫn gửi `zone_id`.
- **Ghi chú xử lý sau:** Vì khu vực chia chọn (Sorting) là cục bộ, chỗ này bắt buộc phải là Zone thật. Lần sau sửa, bạn hãy trả các biến này lại thành `zoneId: number` và giữ nguyên `params: { zone_id: zoneId }`. Các UI bị lỗi (do Backend thiếu Router) tạm thời bạn bọc `[]` như lúc nãy tôi làm ở Inbound để không bị crash. 
- Nhóm `api/outbound.ts` và `api/inboundOperator.ts` gọi các URL ảo (`/assign-sorting-position`, `/oldest-incomplete`): Có thể bỏ qua vì giao diện sẽ không load được data.
