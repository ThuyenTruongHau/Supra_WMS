# Báo cáo: Các vấn đề tồn đọng ở Frontend (Rename Zone/Warehouse & API Demo)

Tài liệu này ghi chú lại các lỗi phát sinh do việc chạy script tự động thay thế `zoneId` thành `warehouseId` trên Frontend và các tàn dư API chưa được Backend hỗ trợ. Bạn có thể dựa vào đây để tiếp tục xử lý vào lúc khác.

## 1. Vấn đề 1: Script đổi tên `zoneId` thành `warehouseId` bị sai logic API
**Nguyên nhân:**
Có một script tự động đã Find & Replace biến `zoneId` thành `warehouseId` trên toàn bộ Frontend (trong các file API, Hook, UI). Tuy nhiên, script này CHỈ đổi tên biến trong code TypeScript, nhưng khi fetch xuống Backend thì vẫn giữ nguyên key là `zone_id`.

**Ví dụ thực tế gây sập luồng (tại `warehouseLocation.ts`):**
```typescript
// Code hiện tại do script sửa:
export async function getLocationsByZoneApi(warehouseId: number) {
  // Gửi warehouse_id (ví dụ: ID = 2) vào biến zone_id của Backend
  const response = await axiosInstance.get('/api/v1/warehouse-locations/', {
    params: { zone_id: warehouseId }, // <-- LỖI LOGIC NGHIÊM TRỌNG!
  });
}
```
Ở Backend (`location_api.py`), hàm `list_locations` nhận cả 2 biến riêng biệt là `warehouse_id` và `zone_id`. Việc truyền ID Kho (2) vào param `zone_id` sẽ khiến Backend hiểu nhầm là đi tìm "Các vị trí thuộc Khu vực có ID = 2". Kết quả là API sẽ trả về rỗng, giao diện mất toàn bộ dữ liệu.

**Danh sách các file bị ảnh hưởng cần review lại:**
- `frontend/src/api/node.ts`
- `frontend/src/api/outboundTask.ts`
- `frontend/src/api/product.ts`
- `frontend/src/api/sortingOrder.ts`
- `frontend/src/api/sortingWave.ts`
- `frontend/src/api/warehouseLocation.ts`
- Các hook sử dụng chúng (`useWarehouseLocation`, `useSortingWaveMapContext`, v.v...)

**Cách khắc phục:**
Trong tương lai, khi sửa tên biến thành `warehouseId`, bạn bắt buộc phải sửa cả key truyền đi thành `params: { warehouse_id: warehouseId }` (nếu Backend mong đợi lấy theo Kho), HOẶC phải truyền đúng ID của Khu vực (Zone) vào biến `zone_id`.

---

## 2. Vấn đề 2: Các API Operator/Demo không tồn tại dưới Backend
Hệ thống Frontend đang tồn tại rất nhiều trang giao diện (chủ yếu bắt đầu bằng chữ `Operator...` hoặc `SortingWave...`) được ghép vào từ một nhánh/project khác. Các UI này gọi các API hoàn toàn không có định tuyến (Route) dưới Backend hiện tại.

**Các API/Hook ảo (gây lỗi 404, 405):**
1. **Outbound Operator:** 
   - Nằm ở file `frontend/src/api/outbound.ts` và phần `DEMO HOOKS` của `useOutbound.ts`.
   - Gọi các API như `/assign-sorting-position`, `/sorting-station-fills`, `/incomplete-vehicles`.
   - **Tình trạng:** Backend `outbound_order_api.py` không hề có các endpoint này.
2. **Inbound Operator:**
   - Trang `OperatorInboundOrderBrowser.tsx` gọi API `GET /api/v1/inbound-orders/oldest-incomplete`.
   - **Tình trạng:** Backend chỉ nhận `/{order_code}` nên quăng lỗi `405 Method Not Allowed`, làm sập UI (lỗi `orders.find is not a function`).
3. **Item Stock (Lấy tồn kho theo Zone):**
   - Nằm ở hàm `getItemStockByZoneApi` trong `warehouseLocation.ts`.
   - Gọi API: `/api/v1/item-stock?zone_id=...`
   - **Tình trạng:** Backend hiện tại là `/item-stocks` (có s) và hoàn toàn không nhận query param `zone_id`.

**Đề xuất giải quyết:**
- Xóa bỏ triệt để các file UI `Operator...` và các hàm giả này nếu chưa có nhu cầu sử dụng thực tế.
- Nếu giữ lại làm mẫu (Mock UI), cần viết các hàm intercept (giả lập trả về mảng rỗng `[]`) hoặc tạo router thực sự dưới Backend để xử lý.
