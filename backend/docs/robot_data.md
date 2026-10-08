# RCS robot telemetry

Configure RCS to send a **complete fleet snapshot** every 5 seconds to:

`POST http://192.168.50.200:8001/api/v1/robot_data`

No JWT is required for this callback, matching the existing RCS webhook.
The JSON body is an array; `deviceCode` must be a non-empty string. Optional
and vendor-specific fields are preserved, including Offline rows without
battery or position. Example payload (for illustration only):

```json
[
  {"deviceCode":"EE49822BAK00001","deviceName":"FL1","state":"Idle","deviceStatus":1},
  {"deviceCode":"EE49822BAK00002","deviceName":"FL2","state":"InCharging","deviceStatus":5}
]
```

Each POST replaces the previous list, including an empty array. Success returns
HTTP 200 with `{"code":1000}` only after Redis stores the snapshot. Invalid
payloads return 422 without changing the previous snapshot; Redis failures
return 503.

`GET /api/v1/robot_data` requires the existing WMS Bearer access token and returns
the latest array with `Cache-Control: no-store`. The snapshot is shared by API
workers through Redis and expires after 30 seconds without another POST. Before
the first POST and after expiry, GET returns `[]`. Override the positive timeout
in `backend/.env` with `ROBOT_DATA_TTL_SECONDS=30`; restart the backend after
changing configuration. No database migration is required.

The operator `/import` page polls GET every 5 seconds while visible and displays
only `EE49822BAK00001` as **FL 01** and `EE49822BAK00002` as **FL 02**, above the
inbound map. Other device codes remain available in the API but are not shown.
State labels: Idle → Rảnh; InTask → Làm nhiệm vụ; InCharging → Đang sạc;
Offline → Mất kết nối. Other state labels are retained. If state is missing,
deviceStatus 0/1/4/5 supplies the corresponding state. Missing robots or API
failures show Không có dữ liệu rather than a cached status.

Run isolated checks from their respective directories:

```powershell
# backend
python -m unittest test.test_robot_data -v

# frontend (Node.js 24 supports the TypeScript import in these tests)
npm run test:robot
npm run build
```
