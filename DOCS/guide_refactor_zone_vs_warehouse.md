# Hướng dẫn Phân biệt và Refactor: useWarehouse vs useZone

Tài liệu này được lập ra để giúp đội ngũ Frontend nhận biết chính xác khi nào nên sử dụng `useWarehouse` (Kho) và khi nào nên dùng `useZone` (Khu vực), tránh lỗi sai logic hàng loạt do dùng script tự động (Find & Replace).

---

## 1. Định nghĩa chuẩn trong Supra WMS
- **Warehouse (Kho):** Là cấp cao nhất, đại diện cho một cơ sở vật chất toàn cục (Ví dụ: Kho Hà Nội, Kho Bình Dương). Kho chứa nhiều Khu vực bên trong.
- **Zone (Khu vực):** Là cấp con, đại diện cho một khu vực vật lý nằm bên TRONG Kho (Ví dụ: Khu Inbound, Khu Lưu trữ, Zone Lạnh 1.1).

---

## 2. Dấu hiệu nhận biết khi nào dùng `useWarehouse`

Nên sử dụng `useWarehouse` và truyền biến `warehouseId` (hoặc `selectedWarehouseId`) trong các trường hợp sau:

1. **Dữ liệu Master (Master Data):** 
   - Hàng hóa (Items/Products), Đơn hàng (Orders), Điểm xuất/nhập (Entry/Exit Points). Các dữ liệu này quản lý tập trung theo Kho.
   - **Ví dụ:** File `ItemPage.tsx`, `EntryPointSettingPage.tsx` bắt buộc phải dùng `useWarehouse`.

2. **Giao diện App Shell (Global Header):**
   - Dropdown chọn Kho ở góc trên cùng giao diện để load dữ liệu cho toàn bộ ứng dụng.

3. **API Contract (Backend Router):**
   - Mở file router Backend (như `warehouse_api.py`), nếu Endpoint định nghĩa nhận `warehouse_id` (ví dụ: `def list_locations(warehouse_id: int)`), thì Frontend phải truyền `warehouseId` xuống.

---

## 3. Dấu hiệu nhận biết khi nào dùng `useZone`

Nên sử dụng `useZone` và truyền biến `zoneId` trong các trường hợp sau:

1. **Thao tác vật lý nội bộ kho:**
   - Các trạm chia chọn (Sorting Stations), công việc lấy hàng theo Wave (chỉ định cho một khu vực cụ thể).
   - Danh sách vị trí (Locations) nếu bạn đang muốn render một phần nhỏ của Bản đồ (ví dụ: chỉ vẽ Bản đồ của Zone 1.1).

2. **API Contract (Backend Router):**
   - Nếu Backend có một API cụ thể dành cho Zone, ví dụ: `/api/v1/zones/{zone_id}/locations`, thì chắc chắn phải truyền `zoneId`.

---

## 4. Cách Refactor Code (Đổi tên) đúng chuẩn

Nếu bạn phát hiện ra một tính năng trước đây dùng `useZone` nhưng thực tế logic của nó là Quản lý Kho, hãy làm theo 2 bước sau:

**❌ KHÔNG ĐƯỢC LÀM (Như script tự động vừa nãy):**
```typescript
// Chỉ đổi tên biến mà không đổi key gửi đi
export async function getLocations(warehouseId: number) {
  // Gửi warehouseId vào biến zone_id -> SAI LOGIC nếu Backend có phân biệt 2 ID này
  await axios.get('/api/locations', { params: { zone_id: warehouseId } });
}
```

**✅ CÁCH LÀM ĐÚNG:**
```typescript
// Bước 1: Sửa tên hàm và biến thành Warehouse
export async function getLocationsByWarehouse(warehouseId: number) {
  // Bước 2: Sửa key API gửi đi thành warehouse_id (Khớp với Backend)
  await axios.get('/api/locations', { params: { warehouse_id: warehouseId } });
}
```

**⚠️ Trường hợp ngoại lệ (Legacy API):** 
Nếu Backend vẫn là code cũ, ngoan cố đòi biến `zone_id` mặc dù nó xử lý logic của Kho, thì hãy viết như sau:
```typescript
export async function getLocationsByWarehouse(warehouseId: number) {
  await axios.get('/api/locations', { 
    params: { 
      // TODO: Backend đang dùng tên biến zone_id cho Warehouse. Cần Backend đổi lại thành warehouse_id
      zone_id: warehouseId 
    } 
  });
}
```

---

**Kết luận:** Hãy luôn kiểm tra định nghĩa tham số (`params`) ở Backend FastAPI trước khi thực hiện đổi tên biến ở Frontend để đảm bảo hệ thống không bị lỗi ngầm.
