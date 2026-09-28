# Masan Inbound — Tài liệu API

Tài liệu mô tả các API backend phục vụ luồng **Import Masan (BM.06)**: đọc file Excel, gợi ý vị trí cất, tạo đơn nhập, tra cứu đơn và lọc detail theo số xe / item.

**Base URL mặc định:** `http://{host}:8001/api/v1`

> **Chế độ tích hợp tạm thời:** Các API trong tài liệu này **không yêu cầu** header `Authorization` / Bearer token. Server tự gắn user `admin` khi tạo đơn nhập. Khi bật lại bảo mật production, cần khôi phục `require_permission` trên các route tương ứng.

---

## 1. Tổng quan luồng Import Masan

```mermaid
sequenceDiagram
    participant Client
    participant Parse as POST parse-preview
    participant Suggest as POST suggest-allocation
    participant Create as POST inbound-orders
    participant List as GET inbound-orders
    participant Details as GET masan/.../details

    Client->>Parse: file Excel + warehouse_id + inbound_type
    Parse-->>Client: preview_rows + suggest_allocation

    Note over Client: Lấy nguyên suggest_allocation từ response Parse

    Client->>Suggest: body = suggest_allocation
    Suggest-->>Client: line_items (target_location_id mỗi dòng)

    Note over Client: Ghép Parse + Suggest → payload create

    Client->>Create: InboundOrderCreate + query inbound_type
    Create-->>Client: InboundOrder (id, order_code, ...)

    Client->>List: warehouse_id + page_size
    List-->>Client: danh sách đơn nhập

    Client->>Details: vehicle_no XOR item_id
    Details-->>Client: InboundOrderDetailResponse[]
```

**Quy tắc ghép dữ liệu giữa các bước:**

| Bước | Input lấy từ đâu |
|------|------------------|
| Suggest | Gửi **nguyên** object `suggest_allocation` từ response Parse (không tự sửa) |
| Create | Ghép **Parse** + **Suggest** theo index `line_items[i]` (xem mục 3) |

---

## 2. API Parse Preview Import

Đọc file Excel BM.06, validate SKU / vị trí để, trả preview và payload sẵn sàng cho bước suggest.

```http
POST /api/v1/masan/inbound-orders/parse-preview
Content-Type: multipart/form-data
```

**Không cần xác thực.**

### Request (form-data)

| Field | Kiểu | Bắt buộc | Mô tả |
|-------|------|----------|-------|
| `file` | file | Có | File Excel `.xlsx` hoặc `.xls` (BM.06, header hàng 2, data từ hàng 3) |
| `warehouse_id` | int | Có | ID kho đang import |
| `inbound_type` | string | Không | `"auto"` (mặc định) hoặc `"manual"` |

**Ví dụ cURL:**

```bash
curl -X POST "http://localhost:8001/api/v1/masan/inbound-orders/parse-preview" \
  -F "file=@TSC.FMCG.BM.06.xlsx" \
  -F "warehouse_id=1" \
  -F "inbound_type=auto"
```

### Response `200`

```json
{
  "preview_rows": [
    {
      "row_no": 3,
      "inbound_datetime": "08/09/2026\n10:30",
      "vehicle_no": "51C-12345",
      "from_warehouse": "Kho A",
      "to_warehouse": "Kho B",
      "delivery": "Delivery 1",
      "nvt": "NV001",
      "sku": "ITEM-001",
      "item_name": "Sản phẩm A",
      "lot": "LOT001",
      "lot_status": "GOOD",
      "quantity": 100,
      "pallet_count": "2",
      "storage_location": "Buffer-A1",
      "from_location_id": 12,
      "from_location_name": "Buffer-A1",
      "locator": null,
      "item_id": 7,
      "unit_id": 1,
      "suggest_group_index": 0,
      "error": null
    }
  ],
  "suggest_allocation": {
    "warehouse_id": 1,
    "detail_type": "auto",
    "line_items": [
      {
        "items": [
          {
            "item_id": 7,
            "quantity": 100,
            "unit_id": 1,
            "lot_number_from": null,
            "lot_number_to": null,
            "lot_number": "LOT001"
          }
        ],
        "details": {
          "row_no": 3,
          "vehicle_no": "51C-12345",
          "sku": "ITEM-001",
          "storage_location": "Buffer-A1",
          "from_location_id": 12,
          "from_location_name": "Buffer-A1",
          "source": "masan_import"
        }
      }
    ]
  },
  "total_rows": 10,
  "valid_rows": 9,
  "invalid_rows": 1,
  "group_count": 9,
  "warnings": ["1 dòng bị bỏ qua khỏi payload gợi ý vị trí"]
}
```

### Ý nghĩa field quan trọng

| Field | Mô tả |
|-------|-------|
| `preview_rows` | Toàn bộ dòng đọc từ Excel; dòng lỗi có `error` và `suggest_group_index = null` |
| `suggest_allocation` | **Payload gửi thẳng sang API suggest** (chỉ gồm dòng hợp lệ) |
| `suggest_group_index` | Index trong `suggest_allocation.line_items`; map 1-1 với dòng Excel hợp lệ |
| `storage_location` / `from_location_id` | Cột **Vị trí để** → lookup `location_name` thuộc zone inbound |
| `group_count` | Số nhóm = số phần tử `suggest_allocation.line_items` (1 dòng Excel hợp lệ = 1 line_item) |

### Lỗi thường gặp (`400`)

| HTTP | `detail` (ví dụ) | Nguyên nhân |
|------|------------------|-------------|
| 400 | `File phải là Excel (.xlsx hoặc .xls)` | Sai định dạng file |
| 400 | `File rỗng` | File upload không có nội dung |
| 400 | `Không tìm thấy cột "Mã Item" ở hàng 2` | Header Excel không đúng BM.06 |
| 400 | `Không có dòng hợp lệ trong file Excel` | Không có dòng SKU |
| 400 | `Không có dòng hợp lệ để tạo payload gợi ý vị trí...` | Mọi dòng đều lỗi SKU/số lượng/vị trí |

---

## 3. Luồng Suggest Allocation → Create Order

Sau Parse, client gọi **2 API liên tiếp**. Dữ liệu từ response Parse được dùng trực tiếp hoặc ghép với response Suggest.

### Bước 3.1 — Suggest vị trí cất (`to_location`)

```http
POST /api/v1/inbound-orders/suggest-allocation
Content-Type: application/json
```

**Không cần xác thực.**

**Request body:** Lấy **nguyên** từ `parseResponse.suggest_allocation`

```json
{
  "warehouse_id": 1,
  "detail_type": "auto",
  "line_items": [
    {
      "items": [
        {
          "item_id": 7,
          "quantity": 100,
          "unit_id": 1,
          "lot_number": "LOT001"
        }
      ],
      "details": {
        "vehicle_no": "51C-12345",
        "from_location_id": 12,
        "from_location_name": "Buffer-A1",
        "source": "masan_import"
      }
    }
  ]
}
```

**Response `200`:**

```json
{
  "line_items": [
    {
      "detail_type": "auto",
      "target_location_name": "KH1.2",
      "target_location_id": 45,
      "line_items": [
        {
          "item_id": 7,
          "quantity": 100,
          "unit_id": 1,
          "lot_number_from": null,
          "lot_number_to": null,
          "lot_number": "LOT001",
          "details": {}
        }
      ]
    }
  ]
}
```

| Field response | Dùng cho bước Create |
|----------------|----------------------|
| `target_location_id` | `line_items[i].to_location_id` |
| `line_items[].item_id/quantity/unit_id/lot_number` | `line_items[i].allocations[]` |

Hệ thống tạm **reserve** vị trí cất trong Redis (`inbound:reserved:{location_id}`) sau khi suggest thành công.

**Ví dụ cURL:**

```bash
curl -X POST "http://localhost:8001/api/v1/inbound-orders/suggest-allocation" \
  -H "Content-Type: application/json" \
  -d @suggest-allocation.json
```

### Bước 3.2 — Ghép payload Create (phía client)

Client tự ghép **theo cùng index** `i` giữa Parse và Suggest:

```
parseResult.suggest_allocation.line_items[i]   ← metadata, from_location_id
suggestResult.line_items[i].target_location_id ← to_location_id
suggestResult.line_items[i].line_items         ← allocations
```

**Quy tắc mapping mỗi `line_items[i]`:**

| Field Create | Nguồn |
|--------------|-------|
| `from_location_id` | `parse.suggest_allocation.line_items[i].details.from_location_id` |
| `to_location_id` | `suggest.line_items[i].target_location_id` |
| `details` | `parse.suggest_allocation.line_items[i].details` (giữ nguyên metadata Masan) |
| `allocations[]` | từ `suggest.line_items[i].line_items` (map `item_id`, `quantity`, `unit_id`, `lot_number`) |

**Ví dụ payload Create sau khi ghép:**

```json
{
  "order_code": "IN-20260908-151521",
  "note": "Import Masan",
  "warehouse_id": 1,
  "details": {
    "source": "masan_import",
    "total_rows": 10,
    "valid_rows": 9,
    "invalid_rows": 1
  },
  "line_items": [
    {
      "from_location_id": 12,
      "to_location_id": 45,
      "details": {
        "vehicle_no": "51C-12345",
        "sku": "ITEM-001",
        "from_location_id": 12,
        "from_location_name": "Buffer-A1",
        "source": "masan_import"
      },
      "allocations": [
        {
          "item_id": 7,
          "quantity": 100,
          "unit_id": 1,
          "lot_number": "LOT001"
        }
      ]
    }
  ]
}
```

| Field header | Gợi ý |
|--------------|-------|
| `order_code` | Client tự sinh, ví dụ `IN-{YYYYMMDD-HHmmss}` — **bắt buộc**, unique |
| `warehouse_id` | Cùng `warehouse_id` đã dùng ở Parse |
| `details` (order) | Metadata tổng hợp import (optional) |

**Ràng buộc khi ghép:**

- `suggestResult.line_items.length` **phải bằng** `parseResult.suggest_allocation.line_items.length`
- Mỗi dòng phải có `details.from_location_id` hợp lệ (từ cột Vị trí để)
- `inbound_type` query param ở Create **phải khớp** `detail_type` đã dùng ở Parse/Suggest

### Bước 3.3 — Tạo đơn nhập

```http
POST /api/v1/inbound-orders?inbound_type=auto
Content-Type: application/json
```

**Không cần xác thực.** Server tự dùng user `admin` làm `created_by_id`.

**Query param:**

| Param | Bắt buộc | Giá trị |
|-------|----------|---------|
| `inbound_type` | Có | `"auto"` hoặc `"manual"` — **phải khớp** `detail_type` đã dùng ở Parse/Suggest |

**Request body:** Payload đã ghép ở bước 3.2.

**Response `201`:**

```json
{
  "id": 36,
  "order_code": "IN-20260908-151521",
  "status": "initialize",
  "note": "Import Masan",
  "created_by_id": 1,
  "warehouse_id": 1,
  "details": {
    "source": "masan_import",
    "total_rows": 10,
    "valid_rows": 9,
    "invalid_rows": 1
  },
  "created_at": "2026-09-08T15:15:21+07:00",
  "updated_at": "2026-09-08T15:15:21+07:00"
}
```

**Lưu `id` và `order_code`** — dùng cho API tra cứu detail (mục 5).

**Ví dụ cURL:**

```bash
curl -X POST "http://localhost:8001/api/v1/inbound-orders?inbound_type=auto" \
  -H "Content-Type: application/json" \
  -d @create-inbound-order.json
```

### Lỗi thường gặp (Suggest / Create)

| HTTP | Nguyên nhân |
|------|-------------|
| 400 | Số nhóm suggest ≠ số line_items create; thiếu `from_location_id` |
| 400 | `Not enough empty locations: need N, found M` — không đủ vị trí trống khi suggest |
| 400 | `order_code` trùng |
| 500 | User `admin` không tồn tại trong DB (khi tạo đơn) |

---

## 4. API Danh sách đơn nhập (Inbound Orders)

```http
GET /api/v1/inbound-orders?warehouse_id={id}&page=1&page_size=20
```

**Không cần xác thực.**

### Query params

| Param | Bắt buộc | Mặc định | Mô tả |
|-------|----------|----------|-------|
| `warehouse_id` | Có | — | Lọc theo kho |
| `page` | Không | `1` | Trang (≥ 1) |
| `page_size` | Không | `10` | Số bản ghi/trang (**limit**, max `100`) |
| `q` | Không | — | Tìm theo mã đơn hoặc người tạo |
| `status` | Không | — | Lọc trạng thái: `initialize`, `in_progress`, `completed` |

**Ví dụ — lấy 50 đơn trang 1:**

```http
GET /api/v1/inbound-orders?warehouse_id=1&page=1&page_size=50
```

**Ví dụ cURL:**

```bash
curl -X GET "http://localhost:8001/api/v1/inbound-orders?warehouse_id=1&page=1&page_size=50"
```

### Response `200`

```json
{
  "items": [
    {
      "id": 36,
      "order_code": "IN-20260908-151521",
      "status": "initialize",
      "note": "Import Masan",
      "created_by_id": 1,
      "warehouse_id": 1,
      "details": { "source": "masan_import" },
      "created_at": "2026-09-08T15:15:21+07:00",
      "updated_at": "2026-09-08T15:15:21+07:00"
    }
  ],
  "total": 120,
  "page": 1,
  "page_size": 50,
  "summary": {
    "total": 120,
    "initialize": 80,
    "in_progress": 30,
    "completed": 10
  }
}
```

| Field | Mô tả |
|-------|-------|
| `items` | Danh sách đơn trang hiện tại |
| `total` | Tổng số đơn thỏa filter (dùng phân trang) |
| `page_size` | Limit thực tế mỗi trang |
| `summary` | Thống kê nhanh theo trạng thái toàn kho |

---

## 5. API Lọc detail theo số xe hoặc item (Masan)

Lấy các **detail line** của một đơn nhập, lọc theo biển số xe hoặc `item_id`.

```http
GET /api/v1/masan/inbound-orders/{inbound_order_id}/details
```

**Không cần xác thực.**

### Path param

| Param | Bắt buộc | Mô tả |
|-------|----------|-------|
| `inbound_order_id` | Có | ID đơn nhập (`InboundOrder.id` từ response Create hoặc List) |

### Query params — bắt buộc đúng 1 trong 2 (XOR)

| Param | Kiểu | Mô tả |
|-------|------|-------|
| `vehicle_no` | str | Biển số xe — khớp `detail.details.vehicle_no` (metadata import Masan) |
| `item_id` | int (> 0) | ID sản phẩm — detail có allocation chứa item này |

**Validation:**

- Không truyền filter → `400`: `"Cần truyền vehicle_no hoặc item_id"`
- Truyền cả hai → `400`: `"Chỉ được truyền vehicle_no hoặc item_id, không truyền cả hai"`
- Order không tồn tại → `404`
- Không có detail khớp → `200` với `[]`

### Ví dụ — lọc theo biển số xe

```http
GET /api/v1/masan/inbound-orders/36/details?vehicle_no=51C-12345
```

```bash
curl -X GET "http://localhost:8001/api/v1/masan/inbound-orders/36/details?vehicle_no=51C-12345"
```

### Ví dụ — lọc theo item

```http
GET /api/v1/masan/inbound-orders/36/details?item_id=7
```

```bash
curl -X GET "http://localhost:8001/api/v1/masan/inbound-orders/36/details?item_id=7"
```

### Response `200` — `InboundOrderDetailResponse[]`

```json
[
  {
    "id": 36,
    "inbound_order_id": 36,
    "from_location_id": 12,
    "to_location_id": 45,
    "from_location_code": "101",
    "from_location_name": "Buffer-A1",
    "to_location_code": "205",
    "to_location_name": "KH1.2",
    "status": "initialize",
    "detail_type": "auto",
    "details": {
      "vehicle_no": "51C-12345",
      "sku": "ITEM-001",
      "lot": "LOT001",
      "from_location_id": 12,
      "source": "masan_import"
    },
    "created_at": "2026-09-08T15:15:21+07:00",
    "updated_at": "2026-09-08T15:15:21+07:00",
    "allocations": [
      {
        "id": 40,
        "inbound_order_detail_id": 36,
        "item_stock_id": 88,
        "unit_id": 1,
        "quantity": 100,
        "status": "initialize",
        "item_id": 7,
        "sku": "ITEM-001",
        "item_name": "Sản phẩm A",
        "unit_name": "Cái",
        "lot_number": "LOT001",
        "lot_number_from": null,
        "lot_number_to": null,
        "expiry_date": null,
        "created_at": "2026-09-08T15:15:21+07:00",
        "updated_at": "2026-09-08T15:15:21+07:00"
      }
    ]
  }
]
```

---

## 6. Bảng tóm tắt API

| # | Method | Endpoint | Auth | Ghi chú |
|---|--------|----------|------|---------|
| 1 | POST | `/masan/inbound-orders/parse-preview` | Không | Upload Excel → preview + `suggest_allocation` |
| 2 | POST | `/inbound-orders/suggest-allocation` | Không | Body = `suggest_allocation` từ bước 1 |
| 3 | POST | `/inbound-orders?inbound_type=auto` | Không | Body ghép từ bước 1 + 2; `created_by` = admin |
| 4 | GET | `/inbound-orders?warehouse_id=&page_size=` | Không | Danh sách đơn, `page_size` = limit |
| 5 | GET | `/masan/inbound-orders/{id}/details?vehicle_no=` | Không | Lọc detail theo số xe |
| 6 | GET | `/masan/inbound-orders/{id}/details?item_id=` | Không | Lọc detail theo item |

---

## 7. Mã lỗi HTTP tổng hợp

| HTTP | Endpoint / ngữ cảnh | Ý nghĩa |
|------|---------------------|---------|
| 200 | GET list, GET details, POST parse/suggest | Thành công |
| 201 | POST create inbound | Đơn nhập được tạo |
| 400 | Parse | File sai định dạng, Excel không hợp lệ, không có dòng hợp lệ |
| 400 | Suggest | Không đủ vị trí trống trong zone storage |
| 400 | Create | Payload không hợp lệ, `order_code` trùng |
| 400 | Details | Thiếu filter hoặc truyền cả `vehicle_no` và `item_id` |
| 404 | Details | `inbound_order_id` không tồn tại |
| 500 | Create | User `admin` không tồn tại trong DB |

---

## 8. Checklist tích hợp nhanh

1. `POST /masan/inbound-orders/parse-preview` (file + `warehouse_id` + `inbound_type`)
2. Kiểm tra `preview_rows`: dòng có `error` cần xử lý trước khi tạo đơn
3. Lấy `response.suggest_allocation` → `POST /inbound-orders/suggest-allocation`
4. Ghép Parse + Suggest theo index → `POST /inbound-orders?inbound_type={cùng giá trị bước 1}`
5. Tra cứu danh sách: `GET /inbound-orders?warehouse_id=...&page_size=...`
6. Chi tiết theo xe/item: `GET /masan/inbound-orders/{id}/details?vehicle_no=...` **hoặc** `?item_id=...` (không dùng cả hai)

---

## 9. Ghi chú kỹ thuật (backend)

| Route | Thay đổi tạm thời |
|-------|-------------------|
| Masan parse / export / details | Bỏ `dependencies=[Depends(require_permission(...))]` |
| `GET /inbound-orders` | Bỏ `inbound:read` |
| `POST /inbound-orders` | Dùng `get_dev_admin_user` thay `require_permission("inbound:create")` |
| `POST /inbound-orders/suggest-allocation` | Không đổi (vốn không yêu cầu auth) |

Hàm `get_dev_admin_user` (`app/core/dependencies.py`) load user `username = "admin"`, `is_active = true`.
