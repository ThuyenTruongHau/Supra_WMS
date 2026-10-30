# Robot performance charts

The Report page reads `GET /api/v1/dashboard/report-robot-performance` with the
existing Bearer authentication. Required query parameters: `warehouse_id`,
`start_date`, `end_date` (ISO calendar dates). Optional: `device_num`, `task_kind`
(`inbound`, `outbound`, `return`). Invalid date order returns 400; invalid query
types return 422. No completed tasks is a successful response with empty counts.

The response contains `summary`, `robots`, and zero-filled hourly/daily `points`.
`devices` lists identified robots in the warehouse/date/type selection before the
robot filter, so the selector remains usable. Unknown robots have `device_num:
null` and remain in totals and the table, but do not create speed chart lines.

One `robot_task.id` counts once. Outbound allocations for CC are grouped in SQL
before joining callbacks: maximum distance, earliest start, latest end. Sorting
timestamps and allocation business status do not determine robot completion.
The latest terminal callback (3 cancelled, 7 failed, 8 completed) before the
exclusive period end determines the outcome; it must also fall inside the period.
Equal callback timestamps use the greatest callback ID. Bounds and chart buckets
use `Asia/Ho_Chi_Minh`. Robot identity falls back from that terminal callback to
the latest nonblank callback robot before period end, then to the detail/allocation.

Only completed tasks contribute distance and speed. Missing/negative/nonfinite
distance is excluded; a speed sample also needs both clocks and positive duration.
`average_speed_mps` is `speed_distance_m / duration_seconds`, using only eligible
tasks. `distance_count` and `speed_eligible_count` describe coverage against
`completed_count`. No distance/speed samples produce null, not measured zero.
Distance is map-derived, and task duration may include waits and handling.

This endpoint has no writes, migrations or historical backfill. Excel continues
using its existing independent endpoint and aggregation rules.

Checks (PowerShell):

```powershell
# backend
.\.venv\Scripts\python.exe -B -m unittest test.test_robot_performance_charts test.test_robot_performance_report -v
# frontend
node --test tests/robotPerformance.test.mjs
npm.cmd run build
npm.cmd run preview -- --host 127.0.0.1 --port 4178
# separate terminal, repository root; browser API/WS requests are all mocked
backend\.venv\Scripts\python.exe -B frontend/tests/robotPerformanceBrowser.py -v
```
