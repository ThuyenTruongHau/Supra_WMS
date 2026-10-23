# Rollback lệnh robot outbound fail (đơn OUT-20261023-133756)

Ngày xử lý: **23/10/2026**, Asia/Saigon. Trạng thái: **đã rollback dữ liệu trên DB/Redis
thật** cho một lệnh robot bị ICS báo failed. Không đổi code nghiệp vụ.

## Phạm vi

- Một robot task outbound: `robot_task.id=1304`, `order_id=TDS_Outbound_d7c8fa25`.
- Đơn xuất: `OUT-20261023-133756`, `outbound_order.id=40`, kho `1`, zone CC `Zone_CC_01`.
- Bốn allocation outbound failed: `925, 926, 929, 930` (tổng quantity `17`, stock `408`, nguồn
  `G330` → VT `10002606` / `location_id=3447`).
- Không có allocation return `initialize` cần xóa.

## Bằng chứng trước rollback

| Dữ liệu | Quan sát |
| --- | --- |
| `task_status` | Một bản ghi ICS `7` (failed) cho `TDS_Outbound_d7c8fa25` |
| Allocation 925–930 | `failed`, `from_location_id=3049`, `to_location_id=3447` |
| Detail 946, 950, 959, 976 | `quantity` giữ nguyên (5, 5, 2, 5); chưa confirm VT |
| Redis CC | Bucket đã bị trừ quantity tại dispatch (`_apply_clear_outbound_masan_details`) |

## Thao tác

Script: [`backend/.recovery/rollback_outbound_robot_task.py`](../../backend/.recovery/rollback_outbound_robot_task.py)

```powershell
cd backend
.\.venv\Scripts\python.exe .recovery\rollback_outbound_robot_task.py --robot-task-id 1304
.\.venv\Scripts\python.exe .recovery\rollback_outbound_robot_task.py --robot-task-id 1304 --commit
```

- Chế độ allocation: `keep_failed` (mặc định) — giữ audit failed, xóa timestamp/device phụ.
- Khôi phục Redis: cộng lại quantity theo detail tại CC locations `3496, 3501, 3502, 3504`.
- **Không** sửa `robot_task` / `task_status`; **không** gọi RCS.
- Snapshot trước commit:
  `backend/.recovery/outbound_robot_rollback_before_20261023T074340431237Z.json`.

## Kiểm chứng sau commit

| Kiểm tra | Kết quả |
| --- | --- |
| `get_item_needed_to_sorting(1, Zone_CC_01)` | SKU `02XX00203`, `total_quantity=17` (gom unallocated) |
| `outbound:assigned_cc_details:1:{946,950,959,976}` | Meta zone/location_id còn |
| Allocation 925–930 | Vẫn `failed`; device/time đã clear |
| Robot task 1304 | Giữ nguyên; status suy ra vẫn failed |

## Bước tiếp theo (người vận hành)

1. Chạy **calculate / send_outbound** như quy trình hiện tại (task RCS mới, allocation
   `initialize` mới).
2. **Gọi lệnh** trên operator khi sorting-items-needed và pending-stock CC khớp.

## Tái sử dụng script

| Tham số | Ý nghĩa |
| --- | --- |
| (không tham số) | Tự chọn robot outbound failed/cancelled mới nhất |
| `--robot-task-id` / `--order-id` | Chỉ định task |
| `--allocation-mode reset_initialize` | Reset allocation cùng task về initialize |
| `--restore-cache-only` | Chỉ Redis CC + dọn stock_ready |
| `--commit` | Ghi DB + Redis (mặc định dry-run) |

Điều kiện dừng: allocation `pre_completed` / `confirmed` / `completed`; callback terminal
không phải failed/cancelled.
