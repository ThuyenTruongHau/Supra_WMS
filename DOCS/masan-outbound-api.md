# Masan Outbound — Tài liệu API

Tài liệu mô tả các API backend phục vụ luồng **Import Masan (BM.04)** và **Export SO (Biểu mẫu lấy hàng theo khách hàng)**: đọc file Excel xuất kho, tạo đơn xuất, tra cứu đơn và xuất Excel lấy hàng theo SO.

**Base URL mặc định:** `http://{host}:8001/api/v1`

**Xác thực:** Các API Masan outbound và outbound order yêu cầu header `Authorization: Bearer {token}` với quyền tương ứng (`outbound:create`, `outbound:read`, …).

---

## 1. Tổng quan luồng Import Masan (BM.04)

Khác inbound (BM.06), luồng outbound **không có bước suggest-allocation**. Parse trả sẵn `line_items` để gửi thẳng sang API tạo đơn.

```mermaid
sequenceDiagram
    participant Client
    participant Parse as POST parse-preview
    participant Create as POST outbound-orders
    participant List as GET outbound-orders
    participant Detail as GET outbound-orders/id/{id}/details
    participant Export as GET export-so

    Client->>Parse: file Excel + warehouse_id + outbound_type
    Parse-->>Client: preview_rows + line_items

    Note over Client: line_items từ Parse → payload create (1 file = 1 đơn)

    Client->>Create: OutboundOrderCreate + query outbound_type
    Create-->>Client: OutboundOrder (id, order_code, ...)

    Client->>List: warehouse_id + page_size
    List-->>Client: danh sách đơn xuất

    Client->>Detail: order_id
    Detail-->>Client: OutboundOrderDetailResponse[]

    Note over Client: Sau phân bổ (calculate) — tùy chọn

    Client->>Export: order_id
    Export-->>Client: Excel multi-sheet theo khách hàng
```

**Quy tắc nghiệp vụ import:**

| Quy tắc | Mô tả |
|---------|-------|
| 1 file Excel | Tạo **1** đơn xuất |
| 1 dòng Excel | Tạo **1** `OutboundOrderDetail` |
| Carry-down | Cột `Số xe`, `Tên khách hàng`, `Trip`, `NVT` — nếu dòng trống thì kế thừa giá trị dòng trên |
| Metadata | Lưu trong `detail.details`: `vehicle_no`, `customer_name`, `trip`, `nvt`, `lot_number`, `lot_status`, `pallet_count`, `locator` |
| Không set `order.details.type` | Tránh kích hoạt logic đặc biệt (Tuyển chọn / Lấy lỗi / Lấy lẻ) ghi đè số lượng |
| Phân bổ stock | **Không** thực hiện khi import — gọi `POST /outbound-orders/calculate` riêng sau khi tạo đơn |

**File mẫu import:** `docs/TSC.FMCG.BM.04_Remake02 - Import Xuất kho.xlsx` (header hàng 2, data từ hàng 3).

---

## 2. API Parse Preview Import

Đọc file Excel BM.04, validate SKU / số lượng / LOT, trả preview và payload sẵn sàng tạo đơn.

```http
POST /api/v1/masan/outbound-orders/parse-preview
Content-Type: multipart/form-data
Authorization: Bearer {token}
```

**Quyền:** `outbound:create`

### Request (form-data)

| Field | Kiểu | Bắt buộc | Mô tả |
|-------|------|----------|-------|
| `file` | file | Có | File Excel `.xlsx` hoặc `.xls` (BM.04, header hàng 2, data từ hàng 3) |
| `warehouse_id` | int | Có | ID kho đang import |
| `outbound_type` | string | Không | `"auto"` (mặc định) hoặc `"manual"` — dùng validate LOT |

**Ví dụ cURL:**

```bash
curl -X POST "http://localhost:8001/api/v1/masan/outbound-orders/parse-preview" \
  -H "Authorization: Bearer {token}" \
  -F "file=@TSC.FMCG.BM.04.xlsx" \
  -F "warehouse_id=1" \
  -F "outbound_type=auto"
```

### Response `200`

```json
{
  "preview_rows": [
    {
      "row_no": 3,
      "vehicle_no": "51C-12345",
      "customer_name": "Khách hàng A",
      "trip": "SO-001",
      "nvt": "NV001",
      "sku": "ITEM-001",
      "item_name": "Sản phẩm A",
      "lot_number": "LOT001",
      "lot_status": "GOOD",
      "quantity": 100,
      "pallet_count": "2",
      "locator": null,
      "item_id": 7,
      "unit_id": 1,
      "error": null
    }
  ],
  "line_items": [
    {
      "item_id": 7,
      "quantity": 100,
      "unit_id": 1,
      "detail_type": "auto",
      "details": {
        "vehicle_no": "51C-12345",
        "customer_name": "Khách hàng A",
        "trip": "SO-001",
        "nvt": "NV001",
        "lot_status": "GOOD",
        "pallet_count": "2",
        "lot_number": "LOT001"
      }
    }
  ],
  "total_rows": 31,
  "valid_rows": 30,
  "invalid_rows": 1,
  "warnings": ["1 dòng bị bỏ qua khỏi payload tạo đơn"]
}
```

### Ý nghĩa field quan trọng

| Field | Mô tả |
|-------|-------|
| `preview_rows` | Toàn bộ dòng đọc từ Excel; dòng lỗi có `error` |
| `line_items` | **Payload gửi thẳng sang API create** (chỉ gồm dòng hợp lệ) |
| `vehicle_no` / `customer_name` / `trip` / `nvt` | Carry-down từ dòng trên nếu ô trống; `trip` placeholder (`…`, `...`, `-`) cũng được carry-down |
| `lot_number` | Map từ cột LOT trong Excel |
| `locator` | Giá trị import (dùng fallback khi export nếu chưa phân bổ) |

### Cột Excel BM.04 (header hàng 2)

| Cột | Alias header | Field nội bộ |
|-----|--------------|--------------|
| Số xe | `số xe` | `vehicle_no` |
| Tên khách hàng | `tên khách hàng` | `customer_name` |
| Trip | `trip` | `trip` |
| NVT | `nvt` | `nvt` |
| Mã Item | `mã item` | `sku` |
| Tên Item | `tên item` | `item_name` (preview only) |
| LOT | `lot` | `lot_number` |
| Lot status | `lot status` | `lot_status` |
| Số lượng | `số lượng` | `quantity` |
| Số pallet | `số pallet` | `pallet_count` |
| Locator | `locator` | `locator` |

### Lỗi thường gặp (`400`)

| HTTP | `detail` (ví dụ) | Nguyên nhân |
|------|------------------|-------------|
| 400 | `File phải là Excel (.xlsx hoặc .xls)` | Sai định dạng file |
| 400 | `File rỗng` | File upload không có nội dung |
| 400 | `Không tìm thấy cột "Mã Item" ở hàng 2` | Header Excel không đúng BM.04 |
| 400 | `Không có dòng hợp lệ trong file Excel` | Không có dòng SKU |
| 400 | `Không có dòng hợp lệ để tạo đơn xuất...` | Mọi dòng đều lỗi SKU/số lượng/LOT |
| 401/403 | — | Thiếu token hoặc không có quyền `outbound:create` |

---

## 3. Luồng Create Order

Sau Parse, client ghép `line_items` vào payload create và gọi API tạo đơn xuất.

### Bước 3.1 — Ghép payload Create (phía client)

Lấy **nguyên** `parseResponse.line_items` — không cần bước trung gian.

**Quy tắc mapping:**

| Field Create | Nguồn |
|--------------|-------|
| `line_items[]` | `parseResponse.line_items` (giữ nguyên) |
| `line_items[i].item_id` | Từ lookup SKU trong kho |
| `line_items[i].quantity` | Cột Số lượng Excel |
| `line_items[i].unit_id` | `base_unit_id` của item |
| `line_items[i].detail_type` | Cùng `outbound_type` đã dùng ở Parse |
| `line_items[i].details` | Metadata BM.04 (xe, KH, trip, nvt, lot, …) |

**Ví dụ payload Create:**

```json
{
  "order_code": "OUT-20260917-233000",
  "note": "Import BM.04",
  "warehouse_id": 1,
  "line_items": [
    {
      "item_id": 7,
      "quantity": 100,
      "unit_id": 1,
      "detail_type": "auto",
      "details": {
        "vehicle_no": "51C-12345",
        "customer_name": "Khách hàng A",
        "trip": "SO-001",
        "nvt": "NV001",
        "lot_status": "GOOD",
        "pallet_count": "2",
        "lot_number": "LOT001",
        "locator": "KH1.2"
      }
    }
  ]
}
```

| Field header | Gợi ý |
|--------------|-------|
| `order_code` | Client tự sinh, ví dụ `OUT-{YYYYMMDD-HHmmss}` — **bắt buộc**, unique |
| `warehouse_id` | Cùng `warehouse_id` đã dùng ở Parse |
| `details` (order) | **Không** set `type` khi import BM.04 thông thường |
| `note` | Tùy chọn, ví dụ `"Import BM.04"` |

### Bước 3.2 — Tạo đơn xuất

```http
POST /api/v1/outbound-orders?outbound_type=auto
Content-Type: application/json
Authorization: Bearer {token}
```

**Quyền:** `outbound:create`

**Query param:**

| Param | Bắt buộc | Giá trị |
|-------|----------|---------|
| `outbound_type` | Có | `"auto"` hoặc `"manual"` — **phải khớp** `detail_type` đã dùng ở Parse |

**Request body:** Payload đã ghép ở bước 3.1.

**Response `201`:**

```json
{
  "id": 42,
  "order_code": "OUT-20260917-233000",
  "status": "initialize",
  "note": "Import BM.04",
  "created_by_id": 1,
  "warehouse_id": 1,
  "details": {},
  "created_at": "2026-09-17T23:30:00+07:00",
  "updated_at": "2026-09-17T23:30:00+07:00"
}
```

**Lưu `id` và `order_code`** — dùng cho tra cứu detail và export SO.

**Ví dụ cURL:**

```bash
curl -X POST "http://localhost:8001/api/v1/outbound-orders?outbound_type=auto" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d @create-outbound-order.json
```

### Bước 3.3 — Phân bổ stock (tùy chọn, sau create)

Import BM.04 **chỉ tạo đơn + detail**, chưa phân bổ tồn kho. Để hệ thống gán vị trí lấy hàng:

```http
POST /api/v1/outbound-orders/calculate?strategy=fefo
Content-Type: application/json
Authorization: Bearer {token}
```

**Quyền:** `outbound:update`

Body gồm `warehouse_id`, `outbound_order_id`, `line_items` (xem schema `CalculateOutboundDetail`).

Sau calculate thành công, mỗi detail có `OutboundOrderAllocation` với `from_location` — dùng cho cột **Locator** khi export SO.

### Lỗi thường gặp (Create)

| HTTP | Nguyên nhân |
|------|-------------|
| 400 | Payload không hợp lệ, SKU/unit không tồn tại |
| 400 | `order_code` trùng |
| 401/403 | Thiếu token hoặc không có quyền `outbound:create` |

---

## 4. API Danh sách đơn xuất (Outbound Orders)

```http
GET /api/v1/outbound-orders?warehouse_id={id}&page=1&page_size=20
Authorization: Bearer {token}
```

**Quyền:** `outbound:read`

### Query params

| Param | Bắt buộc | Mặc định | Mô tả |
|-------|----------|----------|-------|
| `warehouse_id` | Có | — | Lọc theo kho |
| `page` | Không | `1` | Trang (≥ 1) |
| `page_size` | Không | `10` | Số bản ghi/trang (max `100`) |
| `q` | Không | — | Tìm theo mã đơn hoặc người tạo |
| `status` | Không | — | Lọc trạng thái: `initialize`, `in_progress`, `completed` |

**Ví dụ cURL:**

```bash
curl -X GET "http://localhost:8001/api/v1/outbound-orders?warehouse_id=1&page=1&page_size=50" \
  -H "Authorization: Bearer {token}"
```

### Response `200`

```json
{
  "items": [
    {
      "id": 42,
      "order_code": "OUT-20260917-233000",
      "status": "initialize",
      "note": "Import BM.04",
      "created_by_id": 1,
      "warehouse_id": 1,
      "details": {},
      "created_at": "2026-09-17T23:30:00+07:00",
      "updated_at": "2026-09-17T23:30:00+07:00"
    }
  ],
  "total": 85,
  "page": 1,
  "page_size": 50,
  "summary": {
    "total": 85,
    "initialize": 60,
    "in_progress": 20,
    "completed": 5
  }
}
```

---

## 5. API Chi tiết đơn xuất

Lấy toàn bộ **detail line** của một đơn xuất (kèm allocations sau khi calculate).

```http
GET /api/v1/outbound-orders/id/{order_id}/details
Authorization: Bearer {token}
```

**Quyền:** `outbound:read`

### Path param

| Param | Bắt buộc | Mô tả |
|-------|----------|-------|
| `order_id` | Có | ID đơn xuất (`OutboundOrder.id`) |

**Ví dụ cURL:**

```bash
curl -X GET "http://localhost:8001/api/v1/outbound-orders/id/42/details" \
  -H "Authorization: Bearer {token}"
```

### Response `200` — `OutboundOrderDetailResponse[]`

```json
[
  {
    "id": 101,
    "outbound_order_id": 42,
    "item_id": 7,
    "quantity": 100,
    "unit_id": 1,
    "status": "initialize",
    "detail_type": "auto",
    "details": {
      "vehicle_no": "51C-12345",
      "customer_name": "Khách hàng A",
      "trip": "SO-001",
      "nvt": "NV001",
      "lot_number": "LOT001",
      "lot_status": "GOOD",
      "pallet_count": "2",
      "locator": "KH1.2"
    },
    "sku": "ITEM-001",
    "item_name": "Sản phẩm A",
    "unit": "Cái",
    "created_at": "2026-09-17T23:30:00+07:00",
    "updated_at": "2026-09-17T23:30:00+07:00",
    "allocations": [
      {
        "id": 55,
        "outbound_order_detail_id": 101,
        "item_stock_id": 88,
        "quantity": 60,
        "status": "initialize",
        "from_location_id": 12,
        "to_location_id": null,
        "allocation_type": "outbound",
        "from_location_code": "205",
        "from_location_name": "KH1.2",
        "to_location_code": null,
        "to_location_name": null,
        "sku": "ITEM-001",
        "item_name": "Sản phẩm A",
        "lot_number": "LOT001",
        "created_at": "2026-09-17T23:35:00+07:00",
        "updated_at": "2026-09-17T23:35:00+07:00"
      }
    ]
  }
]
```

| Field | Mô tả |
|-------|-------|
| `details.customer_name` | Dùng để **gom sheet** khi export SO |
| `details.trip` / `vehicle_no` / `nvt` | Header mỗi sheet export |
| `allocations[].from_location_name` | Nguồn cột **Locator** sau phân bổ |

- Order không tồn tại → `404`
- Không có detail → `200` với `[]`

---

## 6. API Export SO — Biểu mẫu lấy hàng theo khách hàng

Xuất file Excel multi-sheet theo mẫu `docs/Biểu mẫu lấy hàng SO - Export Xuát hàng.xlsx`.

```http
GET /api/v1/masan/outbound-orders/{order_id}/export-so
Authorization: Bearer {token}
```

**Quyền:** `outbound:read`

### Path param

| Param | Bắt buộc | Mô tả |
|-------|----------|-------|
| `order_id` | Có | ID đơn xuất |

### Response `200`

- **Content-Type:** `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- **Content-Disposition:** `attachment; filename="{order_code}_LayHangSO.xlsx"`
- Body: file Excel binary

**Ví dụ cURL:**

```bash
curl -X GET "http://localhost:8001/api/v1/masan/outbound-orders/42/export-so" \
  -H "Authorization: Bearer {token}" \
  -o OUT-20260917-233000_LayHangSO.xlsx
```

### Cấu trúc file Excel (mỗi sheet = 1 khách hàng)

| Hàng | Nội dung |
|------|----------|
| 1 | `BIỂU MẪU LẤY HÀNG THEO SO` (merge A1:H1) |
| 2 | `(Cung cấp thông tin xuất hàng)` (merge A2:H2) |
| 3 | `Khách hàng: {name}` (A3:D3) \| `Số đơn hàng: {trips}` (E3:H3) |
| 4 | `Địa chỉ giao hàng: —` (A4:D4) |
| 5 | `Đơn vị vận chuyển: {nvt}` (A5:D5) \| `Số xe: {vehicles}` (E5:H5) |
| 6 | Header: STT, Mã Item, Tên Item, LOT, Lot status, Số lượng, Số pallet, **Locator** |
| 7+ | Dòng hàng — **1 `OutboundOrderDetail` = 1 dòng** |

### Quy tắc gom nhóm

| Quy tắc | Mô tả |
|---------|-------|
| Group key | `details.customer_name`; thiếu → sheet `Unknown` |
| Sheet name | Tên khách hàng (max 31 ký tự, loại ký tự Excel cấm); trùng tên → thêm `_2`, `_3`, … |
| Header aggregation | `trips`, `vehicles`, `nvts` = unique, giữ thứ tự xuất hiện trong nhóm |
| Số dòng | Mỗi sheet = số detail thuộc khách hàng đó (sort theo `detail.id`) |

### Mapping cột dữ liệu

| Cột Excel | Nguồn |
|-----------|-------|
| STT | 1..N trong sheet |
| Mã Item | `detail.item.sku` |
| Tên Item | `detail.item.name` |
| LOT | `details.lot_number` |
| Lot status | `details.lot_status` hoặc mặc định `GOOD` |
| Số lượng | `detail.quantity` (tổng yêu cầu, **không** tách theo allocation) |
| Số pallet | `details.pallet_count` hoặc trống |
| **Locator** | Xem bảng dưới |

### Quy tắc cột Locator

Hệ thống **không** tách 1 detail thành nhiều dòng Excel dù có nhiều allocation. Chỉ cột Locator gom nhiều vị trí:

| Trạng thái | Locator |
|------------|---------|
| Đã phân bổ, nhiều vị trí lấy | `"KH1.2, KH2.5, KH3.1"` — unique, giữ thứ tự `allocation.id` |
| Đã phân bổ, 1 vị trí | `"KH1.2"` |
| Chưa phân bổ, import có `details.locator` | Giá trị import |
| Chưa phân bổ, không có locator | `"..."` |

**Nguồn vị trí:** `OutboundOrderAllocation.from_location` (`location_name`, fallback `location_code`) với `allocation_type = "outbound"`.

### Lỗi thường gặp (Export)

| HTTP | `detail` (ví dụ) | Nguyên nhân |
|------|------------------|-------------|
| 404 | `Outbound order {id} not found` | ID đơn không tồn tại |
| 400 | `Outbound order has no details to export` | Đơn không có detail line |
| 401/403 | — | Thiếu token hoặc không có quyền `outbound:read` |

---

## 7. Bảng tóm tắt API

| # | Method | Endpoint | Quyền | Ghi chú |
|---|--------|----------|-------|---------|
| 1 | POST | `/masan/outbound-orders/parse-preview` | `outbound:create` | Upload Excel BM.04 → preview + `line_items` |
| 2 | POST | `/outbound-orders?outbound_type=auto` | `outbound:create` | Body = `line_items` từ bước 1 |
| 3 | POST | `/outbound-orders/calculate?strategy=fefo` | `outbound:update` | Phân bổ stock (tùy chọn, sau create) |
| 4 | GET | `/outbound-orders?warehouse_id=&page_size=` | `outbound:read` | Danh sách đơn |
| 5 | GET | `/outbound-orders/id/{id}/details` | `outbound:read` | Chi tiết dòng + allocations |
| 6 | GET | `/masan/outbound-orders/{id}/export-so` | `outbound:read` | Export Excel SO multi-sheet |

---

## 8. Mã lỗi HTTP tổng hợp

| HTTP | Endpoint / ngữ cảnh | Ý nghĩa |
|------|---------------------|---------|
| 200 | GET list, GET details, POST parse, GET export-so | Thành công |
| 201 | POST create outbound | Đơn xuất được tạo |
| 400 | Parse | File sai định dạng, Excel không hợp lệ, không có dòng hợp lệ |
| 400 | Create | Payload không hợp lệ, `order_code` trùng |
| 400 | Export | Đơn không có detail để export |
| 404 | GET details / export | `order_id` không tồn tại |
| 401/403 | Tất cả | Thiếu/x sai token hoặc thiếu quyền |

---

## 9. Checklist tích hợp nhanh

### Import BM.04

1. `POST /masan/outbound-orders/parse-preview` (file + `warehouse_id` + `outbound_type`)
2. Kiểm tra `preview_rows`: dòng có `error` sẽ bị bỏ khỏi `line_items`
3. Ghép `line_items` → `POST /outbound-orders?outbound_type={cùng giá trị bước 1}`
4. (Tùy chọn) `POST /outbound-orders/calculate` để phân bổ vị trí lấy hàng
5. Tra cứu: `GET /outbound-orders?warehouse_id=...` hoặc `GET /outbound-orders/id/{id}/details`

### Export SO

1. Đảm bảo đơn đã có detail (và đã calculate nếu cần Locator từ vị trí thật)
2. `GET /masan/outbound-orders/{id}/export-so` → lưu file `{order_code}_LayHangSO.xlsx`
3. Kiểm tra: mỗi khách hàng 1 sheet; 1 detail = 1 dòng; Locator gom nhiều vị trí bằng dấu phẩy

---

## 10. Ghi chú kỹ thuật (backend)

| Module | Mô tả |
|--------|-------|
| `masan_outbound_excel.py` | Layout BM.04 import: 11 cột, carry-down, alias header |
| `masan_outbound_service.py` | Parse preview, `_resolve_locator`, `export_outbound_order_so` |
| `masan_outbound_so_excel.py` | Layout export SO: 8 cột, merge header, styling |
| `masan_api.py` | Route Masan: `parse-preview`, `export-so` |

**Khác biệt so với inbound (BM.06):**

| | Inbound BM.06 | Outbound BM.04 |
|---|---------------|----------------|
| Bước trung gian | `suggest-allocation` bắt buộc | Không có |
| Output Parse | `suggest_allocation` + preview | `line_items` + preview |
| Export | 1 sheet báo cáo nhập | Multi-sheet theo `customer_name` |
| Locator export | Từ allocation / import | Gom nhiều `from_location`, join `, ` |

**Out of scope (export SO hiện tại):**

- Địa chỉ giao hàng thật (luôn hiển thị `—`)
- Tách 1 allocation = 1 dòng Excel
- Export batch nhiều đơn cùng lúc
