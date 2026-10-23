# HTTP và WebSocket route từ source

Sinh bằng `python scripts/build_code_index.py`; không import ASGI app hay gọi API.

**177 khai báo route**: decorator HTTP/WebSocket ở các router được `app/main.py` đăng ký trực tiếp, cộng route trực tiếp của app.
Prefix được ghép từ khai báo `include_router` và `APIRouter`. Thứ tự giữ theo đăng ký trong main và khai báo trong module.
Không bao gồm route tự sinh của thư viện (Swagger/OpenAPI/metrics), mount, include lồng hoặc route được tạo động.
Bảng không mô tả quyền, schema, trạng thái triển khai hoặc thay thế OpenAPI thực tế; mở handler và dependency để kiểm tra.

Quay lại [bản đồ code](../code-map.md) hoặc [mục lục](../README.md).

## backend/app/modules/warehouse/inbound_order/inbound_order_api.py

| Method | Path | Handler |
| --- | --- | --- |
| POST | `/api/v1/inbound-orders/suggest-allocation` | [suggest_inbound_allocation](../../backend/app/modules/warehouse/inbound_order/inbound_order_api.py#L71) |
| POST | `/api/v1/inbound-orders/release-locations` | [release_inbound_locations](../../backend/app/modules/warehouse/inbound_order/inbound_order_api.py#L83) |
| POST | `/api/v1/inbound-orders/purge-packing-cache` | [purge_packing_cache](../../backend/app/modules/warehouse/inbound_order/inbound_order_api.py#L93) |
| POST | `/api/v1/inbound-orders` | [create_inbound_order](../../backend/app/modules/warehouse/inbound_order/inbound_order_api.py#L103) |
| GET | `/api/v1/inbound-orders` | [list_inbound_orders](../../backend/app/modules/warehouse/inbound_order/inbound_order_api.py#L124) |
| POST | `/api/v1/inbound-orders/operator-list-summary` | [inbound_operator_list_summary](../../backend/app/modules/warehouse/inbound_order/inbound_order_api.py#L171) |
| POST | `/api/v1/inbound-orders/assigned-details` | [list_inbound_assigned_details](../../backend/app/modules/warehouse/inbound_order/inbound_order_api.py#L186) |
| GET | `/api/v1/inbound-orders/{order_code}/details` | [get_inbound_order_details](../../backend/app/modules/warehouse/inbound_order/inbound_order_api.py#L206) |
| POST | `/api/v1/inbound-allocations/{detail_id}/accept-task` | [accept_inbound_task](../../backend/app/modules/warehouse/inbound_order/inbound_order_api.py#L220) |
| PATCH | `/api/v1/inbound-orders/{order_code}` | [update_inbound_order](../../backend/app/modules/warehouse/inbound_order/inbound_order_api.py#L234) |
| DELETE | `/api/v1/inbound-orders/{order_code}` | [delete_inbound_order](../../backend/app/modules/warehouse/inbound_order/inbound_order_api.py#L254) |
| POST | `/api/v1/inbound-orders/caller` | [caller_inbound_order](../../backend/app/modules/warehouse/inbound_order/inbound_order_api.py#L275) |
| POST | `/api/v1/inbound-orders/preview-stocks` | [preview_inbound_qr_code](../../backend/app/modules/warehouse/inbound_order/inbound_order_api.py#L295) |
| POST | `/api/v1/inbound-orders/assigned-stocks` | [assign_or_get_item_stocks](../../backend/app/modules/warehouse/inbound_order/inbound_order_api.py#L316) |
| POST | `/api/v1/inbound-orders/locations/{location_id}/assigned-stocks` | [assign_or_get_item_stocks_by_location](../../backend/app/modules/warehouse/inbound_order/inbound_order_api.py#L327) |
| POST | `/api/v1/inbound-orders/manual/scan` | [manual_inbound_scan](../../backend/app/modules/warehouse/inbound_order/inbound_order_api.py#L364) |
| GET | `/api/v1/inbound-orders/packing-stocks` | [get_packing_user_pending_stocks](../../backend/app/modules/warehouse/inbound_order/inbound_order_api.py#L396) |
| POST | `/api/v1/inbound-orders/item-assign/packing` | [assign_packing_to_item](../../backend/app/modules/warehouse/inbound_order/inbound_order_api.py#L424) |
| POST | `/api/v1/inbound-orders/packing-stocks` | [cache_for_packing_user](../../backend/app/modules/warehouse/inbound_order/inbound_order_api.py#L455) |
| POST | `/api/v1/inbound-orders/assigned-stocks/relocate` | [relocate_assigned_stocks](../../backend/app/modules/warehouse/inbound_order/inbound_order_api.py#L486) |
## backend/app/modules/warehouse/outbound_order/outbound_order_api.py

| Method | Path | Handler |
| --- | --- | --- |
| POST | `/api/v1/outbound-orders` | [create_outbound_order](../../backend/app/modules/warehouse/outbound_order/outbound_order_api.py#L82) |
| GET | `/api/v1/outbound-orders` | [list_outbound_orders](../../backend/app/modules/warehouse/outbound_order/outbound_order_api.py#L117) |
| GET | `/api/v1/outbound-orders/operator-board/orders` | [list_operator_board_orders](../../backend/app/modules/warehouse/outbound_order/outbound_order_api.py#L154) |
| GET | `/api/v1/outbound-orders/{order_id}/operator-board/vehicles` | [list_operator_board_vehicles](../../backend/app/modules/warehouse/outbound_order/outbound_order_api.py#L189) |
| GET | `/api/v1/outbound-orders/{order_id}/operator-board/vehicles/{vehicle_key}/customers` | [list_operator_board_customers](../../backend/app/modules/warehouse/outbound_order/outbound_order_api.py#L207) |
| GET | `/api/v1/outbound-orders/{order_id}/operator-board/vehicles/{vehicle_key}/customers/{customer_key}/trips` | [list_operator_board_trips](../../backend/app/modules/warehouse/outbound_order/outbound_order_api.py#L230) |
| GET | `/api/v1/outbound-orders/{order_id}/operator-board/vehicles/{vehicle_key}/customers/{customer_key}/trips/{trip_key}/lines` | [list_operator_board_lines](../../backend/app/modules/warehouse/outbound_order/outbound_order_api.py#L255) |
| GET | `/api/v1/outbound-orders/id/{order_id}` | [get_outbound_order_by_id](../../backend/app/modules/warehouse/outbound_order/outbound_order_api.py#L284) |
| GET | `/api/v1/robot-tasks/{order_id}` | [get_outbound_robot_tasks](../../backend/app/modules/warehouse/outbound_order/outbound_order_api.py#L298) |
| GET | `/api/v1/manual-allocation-tasks/{order_id}` | [get_outbound_manual_allocation_tasks](../../backend/app/modules/warehouse/outbound_order/outbound_order_api.py#L313) |
| GET | `/api/v1/outbound-orders/id/{order_id}/details` | [get_outbound_order_details](../../backend/app/modules/warehouse/outbound_order/outbound_order_api.py#L332) |
| GET | `/api/v1/outbound-orders/id/{order_id}/lacked` | [get_outbound_lacked_details](../../backend/app/modules/warehouse/outbound_order/outbound_order_api.py#L347) |
| POST | `/api/v1/outbound-orders/calculate` | [calculate_outbound_order](../../backend/app/modules/warehouse/outbound_order/outbound_order_api.py#L362) |
| POST | `/api/v1/outbound-orders/execute` | [execute_outbound_task](../../backend/app/modules/warehouse/outbound_order/outbound_order_api.py#L380) |
| PATCH | `/api/v1/outbound-orders/id/{order_id}` | [update_outbound_order](../../backend/app/modules/warehouse/outbound_order/outbound_order_api.py#L401) |
| DELETE | `/api/v1/outbound-orders/{order_code}` | [delete_outbound_order](../../backend/app/modules/warehouse/outbound_order/outbound_order_api.py#L427) |
| POST | `/api/v1/outbound-orders/id/{order_id}/confirm-qr` | [confirm_outbound_order_qr](../../backend/app/modules/warehouse/outbound_order/outbound_order_api.py#L446) |
| POST | `/api/v1/outbound-orders/confirm-no-qr` | [confirm_outbound_order_no_qr](../../backend/app/modules/warehouse/outbound_order/outbound_order_api.py#L473) |
| POST | `/api/v1/outbound-orders/execute-qr-manual` | [execute_outbound_qr_manual](../../backend/app/modules/warehouse/outbound_order/outbound_order_api.py#L497) |
## backend/app/modules/warehouse/stocktake/stocktake_api.py

| Method | Path | Handler |
| --- | --- | --- |
| GET | `/api/v1/stocktakes` | [list_stocktakes](../../backend/app/modules/warehouse/stocktake/stocktake_api.py#L42) |
| GET | `/api/v1/stocktake-items` | [list_stocktake_items](../../backend/app/modules/warehouse/stocktake/stocktake_api.py#L63) |
| GET | `/api/v1/stocktake-items/{stocktake_item_id}/form-data` | [get_stocktake_item_form_data](../../backend/app/modules/warehouse/stocktake/stocktake_api.py#L94) |
| POST | `/api/v1/stocktakes` | [create_stocktake](../../backend/app/modules/warehouse/stocktake/stocktake_api.py#L106) |
| GET | `/api/v1/stocktakes/{stocktake_id}` | [get_stocktake](../../backend/app/modules/warehouse/stocktake/stocktake_api.py#L130) |
| PATCH | `/api/v1/stocktakes/{stocktake_id}` | [update_stocktake](../../backend/app/modules/warehouse/stocktake/stocktake_api.py#L142) |
| DELETE | `/api/v1/stocktakes/{stocktake_id}` | [delete_stocktake](../../backend/app/modules/warehouse/stocktake/stocktake_api.py#L157) |
| POST | `/api/v1/stocktakes/{stocktake_id}/items` | [add_stocktake_item](../../backend/app/modules/warehouse/stocktake/stocktake_api.py#L173) |
| POST | `/api/v1/stocktakes/{stocktake_id}/items/{stocktake_item_id}/record-count` | [record_stocktake_item_count](../../backend/app/modules/warehouse/stocktake/stocktake_api.py#L188) |
| POST | `/api/v1/stocktakes/{stocktake_id}/items/{stocktake_item_id}/confirm-quantity` | [confirm_stocktake_item_quantity](../../backend/app/modules/warehouse/stocktake/stocktake_api.py#L213) |
## backend/app/modules/auth/auth_api.py

| Method | Path | Handler |
| --- | --- | --- |
| POST | `/api/v1/auth/login` | [login](../../backend/app/modules/auth/auth_api.py#L37) |
| POST | `/api/v1/auth/refresh` | [refresh_token](../../backend/app/modules/auth/auth_api.py#L45) |
| POST | `/api/v1/auth/signup` | [signup](../../backend/app/modules/auth/auth_api.py#L56) |
| GET | `/api/v1/users/me` | [get_me](../../backend/app/modules/auth/auth_api.py#L63) |
| GET | `/api/v1/users/staff-usernames` | [list_staff_usernames](../../backend/app/modules/auth/auth_api.py#L71) |
| GET | `/api/v1/users/staff` | [list_staff_users](../../backend/app/modules/auth/auth_api.py#L80) |
| GET | `/api/v1/users` | [list_users](../../backend/app/modules/auth/auth_api.py#L90) |
| GET | `/api/v1/users/{user_id}` | [get_user_by_id](../../backend/app/modules/auth/auth_api.py#L103) |
| PATCH | `/api/v1/users/{user_id}` | [update_user](../../backend/app/modules/auth/auth_api.py#L115) |
| DELETE | `/api/v1/users/{user_id}` | [delete_user](../../backend/app/modules/auth/auth_api.py#L130) |
## backend/app/modules/warehouse/warehouse_zone/warehouse_api.py

| Method | Path | Handler |
| --- | --- | --- |
| GET | `/api/v1/warehouses` | [list_warehouses](../../backend/app/modules/warehouse/warehouse_zone/warehouse_api.py#L35) |
| POST | `/api/v1/warehouses` | [create_warehouse](../../backend/app/modules/warehouse/warehouse_zone/warehouse_api.py#L49) |
| GET | `/api/v1/warehouses/{warehouse_id}` | [get_warehouse](../../backend/app/modules/warehouse/warehouse_zone/warehouse_api.py#L62) |
| PATCH | `/api/v1/warehouses/{warehouse_id}` | [update_warehouse](../../backend/app/modules/warehouse/warehouse_zone/warehouse_api.py#L74) |
| DELETE | `/api/v1/warehouses/{warehouse_id}` | [delete_warehouse](../../backend/app/modules/warehouse/warehouse_zone/warehouse_api.py#L89) |
| GET | `/api/v1/zones` | [list_zones](../../backend/app/modules/warehouse/warehouse_zone/warehouse_api.py#L106) |
| POST | `/api/v1/zones` | [create_zone](../../backend/app/modules/warehouse/warehouse_zone/warehouse_api.py#L123) |
| GET | `/api/v1/zones/{zone_id}` | [get_zone](../../backend/app/modules/warehouse/warehouse_zone/warehouse_api.py#L136) |
| PATCH | `/api/v1/zones/{zone_id}` | [update_zone](../../backend/app/modules/warehouse/warehouse_zone/warehouse_api.py#L148) |
| DELETE | `/api/v1/zones/{zone_id}` | [delete_zone](../../backend/app/modules/warehouse/warehouse_zone/warehouse_api.py#L163) |
| PUT | `/api/v1/zones/{zone_id}/locations` | [assign_zone_locations](../../backend/app/modules/warehouse/warehouse_zone/warehouse_api.py#L177) |
## backend/app/modules/warehouse/location_map/location_api.py

| Method | Path | Handler |
| --- | --- | --- |
| GET | `/api/v1/locations` | [list_locations](../../backend/app/modules/warehouse/location_map/location_api.py#L58) |
| GET | `/api/v1/locations/for-map` | [list_locations_for_map](../../backend/app/modules/warehouse/location_map/location_api.py#L81) |
| GET | `/api/v1/locations/zones/{zone_id}/for-map` | [list_locations_for_zone_map](../../backend/app/modules/warehouse/location_map/location_api.py#L95) |
| GET | `/api/v1/locations/by-logic` | [list_locations_by_logic](../../backend/app/modules/warehouse/location_map/location_api.py#L117) |
| GET | `/api/v1/locations/{location_id}/detail` | [get_location_detail](../../backend/app/modules/warehouse/location_map/location_api.py#L136) |
| GET | `/api/v1/locations/{location_id}` | [get_location](../../backend/app/modules/warehouse/location_map/location_api.py#L148) |
| PATCH | `/api/v1/locations/{location_id}` | [update_location](../../backend/app/modules/warehouse/location_map/location_api.py#L160) |
| DELETE | `/api/v1/locations/{location_id}` | [delete_location](../../backend/app/modules/warehouse/location_map/location_api.py#L175) |
| POST | `/api/v1/warehouse-maps/import/preview` | [preview_warehouse_map_import](../../backend/app/modules/warehouse/location_map/location_api.py#L234) |
| POST | `/api/v1/warehouse-maps/import` | [import_warehouse_map](../../backend/app/modules/warehouse/location_map/location_api.py#L261) |
| GET | `/api/v1/warehouse-maps/{warehouse_id}/map-data` | [get_map_data](../../backend/app/modules/warehouse/location_map/location_api.py#L289) |
| GET | `/api/v1/warehouse-maps/zones/{zone_id}/map-data` | [get_zone_map_data](../../backend/app/modules/warehouse/location_map/location_api.py#L304) |
| GET | `/api/v1/warehouse-maps/{warehouse_id}/export` | [export_warehouse_map](../../backend/app/modules/warehouse/location_map/location_api.py#L326) |
| GET | `/api/v1/warehouse-maps/{warehouse_id}/graph` | [get_map_graph_summary](../../backend/app/modules/warehouse/location_map/location_api.py#L371) |
| POST | `/api/v1/warehouse-maps/{warehouse_id}/graph/reload` | [reload_map_graph](../../backend/app/modules/warehouse/location_map/location_api.py#L380) |
| GET | `/api/v1/warehouse-maps/{warehouse_id}/distance` | [calculate_map_distance](../../backend/app/modules/warehouse/location_map/location_api.py#L395) |
| POST | `/api/v1/warehouse-maps/{warehouse_id}/route` | [plan_map_route](../../backend/app/modules/warehouse/location_map/location_api.py#L417) |
| GET | `/api/v1/locations/by-logic/storage-area` | [list_locations_by_storage_area](../../backend/app/modules/warehouse/location_map/location_api.py#L439) |
| POST | `/api/v1/locations/qr-codes/print` | [print_location_qr_codes](../../backend/app/modules/warehouse/location_map/location_api.py#L451) |
## backend/app/modules/warehouse/item/item_api.py

| Method | Path | Handler |
| --- | --- | --- |
| GET | `/api/v1/items` | [list_items](../../backend/app/modules/warehouse/item/item_api.py#L38) |
| GET | `/api/v1/items/analyze-items/{warehouse_id}` | [analyze_items](../../backend/app/modules/warehouse/item/item_api.py#L61) |
| POST | `/api/v1/items/import` | [import_items_masan](../../backend/app/modules/warehouse/item/item_api.py#L74) |
| GET | `/api/v1/items/import/file` | [download_last_import_item_file](../../backend/app/modules/warehouse/item/item_api.py#L89) |
| GET | `/api/v1/items/import/{job_id}` | [get_import_items_job](../../backend/app/modules/warehouse/item/item_api.py#L109) |
| POST | `/api/v1/items` | [create_item](../../backend/app/modules/warehouse/item/item_api.py#L121) |
| GET | `/api/v1/items/{item_id}` | [get_item](../../backend/app/modules/warehouse/item/item_api.py#L134) |
| PATCH | `/api/v1/items/{item_id}` | [update_item](../../backend/app/modules/warehouse/item/item_api.py#L146) |
| DELETE | `/api/v1/items/{item_id}` | [delete_item](../../backend/app/modules/warehouse/item/item_api.py#L161) |
| GET | `/api/v1/qr-codes` | [list_qr_codes](../../backend/app/modules/warehouse/item/item_api.py#L178) |
| GET | `/api/v1/qr-codes/by-item/{item_id}/recent` | [list_recent_qr_codes_by_item](../../backend/app/modules/warehouse/item/item_api.py#L201) |
| GET | `/api/v1/qr-codes/recent` | [list_recent_qr_codes](../../backend/app/modules/warehouse/item/item_api.py#L213) |
| POST | `/api/v1/qr-codes/preview` | [preview_qr_codes](../../backend/app/modules/warehouse/item/item_api.py#L233) |
| POST | `/api/v1/qr-codes/create` | [create_qr_codes_batch](../../backend/app/modules/warehouse/item/item_api.py#L249) |
| POST | `/api/v1/qr-codes/generate` | [generate_qr_codes](../../backend/app/modules/warehouse/item/item_api.py#L272) |
| POST | `/api/v1/qr-codes` | [create_qr_code](../../backend/app/modules/warehouse/item/item_api.py#L299) |
| GET | `/api/v1/qr-codes/{qr_code_id}` | [get_qr_code](../../backend/app/modules/warehouse/item/item_api.py#L312) |
| PATCH | `/api/v1/qr-codes/{qr_code_id}` | [update_qr_code](../../backend/app/modules/warehouse/item/item_api.py#L324) |
| DELETE | `/api/v1/qr-codes/{qr_code_id}` | [delete_qr_code](../../backend/app/modules/warehouse/item/item_api.py#L339) |
## backend/app/modules/warehouse/item_stock/item_stock_api.py

| Method | Path | Handler |
| --- | --- | --- |
| GET | `/api/v1/item-stocks` | [list_item_stocks](../../backend/app/modules/warehouse/item_stock/item_stock_api.py#L29) |
| POST | `/api/v1/item-stocks` | [create_item_stock](../../backend/app/modules/warehouse/item_stock/item_stock_api.py#L55) |
| GET | `/api/v1/item-stocks/split` | [get_stock_split](../../backend/app/modules/warehouse/item_stock/item_stock_api.py#L67) |
| GET | `/api/v1/item-stocks/{stock_id}` | [get_item_stock](../../backend/app/modules/warehouse/item_stock/item_stock_api.py#L79) |
| PATCH | `/api/v1/item-stocks/{stock_id}` | [update_item_stock](../../backend/app/modules/warehouse/item_stock/item_stock_api.py#L91) |
| DELETE | `/api/v1/item-stocks/{stock_id}` | [delete_item_stock](../../backend/app/modules/warehouse/item_stock/item_stock_api.py#L106) |
## backend/app/modules/warehouse/transaction_history/history_api.py

| Method | Path | Handler |
| --- | --- | --- |
| GET | `/api/v1/transactions` | [list_transactions](../../backend/app/modules/warehouse/transaction_history/history_api.py#L33) |
| POST | `/api/v1/transactions` | [create_transaction](../../backend/app/modules/warehouse/transaction_history/history_api.py#L59) |
| GET | `/api/v1/transactions/{transaction_id}` | [get_transaction](../../backend/app/modules/warehouse/transaction_history/history_api.py#L78) |
| POST | `/api/v1/histories` | [create_history](../../backend/app/modules/warehouse/transaction_history/history_api.py#L91) |
| GET | `/api/v1/histories/{history_id}` | [get_history](../../backend/app/modules/warehouse/transaction_history/history_api.py#L104) |
| GET | `/api/v1/histories` | [list_histories](../../backend/app/modules/warehouse/transaction_history/history_api.py#L115) |
| GET | `/api/v1/transaction-history` | [get_transaction_history](../../backend/app/modules/warehouse/transaction_history/history_api.py#L124) |
## backend/app/modules/warehouse/unit/unit_api.py

| Method | Path | Handler |
| --- | --- | --- |
| GET | `/api/v1/units` | [list_units](../../backend/app/modules/warehouse/unit/unit_api.py#L37) |
| POST | `/api/v1/units` | [create_unit](../../backend/app/modules/warehouse/unit/unit_api.py#L52) |
| GET | `/api/v1/units/{unit_id}` | [get_unit](../../backend/app/modules/warehouse/unit/unit_api.py#L65) |
| PATCH | `/api/v1/units/{unit_id}` | [update_unit](../../backend/app/modules/warehouse/unit/unit_api.py#L77) |
| DELETE | `/api/v1/units/{unit_id}` | [delete_unit](../../backend/app/modules/warehouse/unit/unit_api.py#L92) |
| GET | `/api/v1/item-units` | [list_item_units](../../backend/app/modules/warehouse/unit/unit_api.py#L109) |
| GET | `/api/v1/item-units/by-item/{item_id}` | [get_item_units_by_item](../../backend/app/modules/warehouse/unit/unit_api.py#L129) |
| POST | `/api/v1/item-units/convert-quantity` | [convert_item_quantity](../../backend/app/modules/warehouse/unit/unit_api.py#L140) |
| POST | `/api/v1/item-units` | [create_item_unit](../../backend/app/modules/warehouse/unit/unit_api.py#L158) |
| GET | `/api/v1/item-units/{item_unit_id}` | [get_item_unit](../../backend/app/modules/warehouse/unit/unit_api.py#L171) |
| PATCH | `/api/v1/item-units/{item_unit_id}` | [update_item_unit](../../backend/app/modules/warehouse/unit/unit_api.py#L183) |
| DELETE | `/api/v1/item-units/{item_unit_id}` | [delete_item_unit](../../backend/app/modules/warehouse/unit/unit_api.py#L198) |
## backend/app/modules/robot/robot_api.py

| Method | Path | Handler |
| --- | --- | --- |
| POST | `/api/v1/robot_data` | [receive_robot_data](../../backend/app/modules/robot/robot_api.py#L20) |
| GET | `/api/v1/robot_data` | [read_robot_data](../../backend/app/modules/robot/robot_api.py#L36) |
| POST | `/api/v1/receive-status` | [receive_task_status](../../backend/app/modules/robot/robot_api.py#L47) |
## backend/app/modules/masan/masan_api.py

| Method | Path | Handler |
| --- | --- | --- |
| POST | `/api/v1/masan/inbound-orders/parse-preview` | [parse_masan_inbound_preview](../../backend/app/modules/masan/masan_api.py#L105) |
| POST | `/api/v1/masan/outbound-orders/parse-preview` | [parse_masan_outbound_preview](../../backend/app/modules/masan/masan_api.py#L142) |
| GET | `/api/v1/masan/outbound-orders/{order_id}/export-so` | [export_masan_outbound_order_so](../../backend/app/modules/masan/masan_api.py#L178) |
| GET | `/api/v1/masan/outbound-orders/{order_id}/export` | [export_masan_outbound_order_report](../../backend/app/modules/masan/masan_api.py#L200) |
| POST | `/api/v1/masan/outbound-orders/export` | [export_masan_outbound_orders_report_bulk](../../backend/app/modules/masan/masan_api.py#L224) |
| GET | `/api/v1/masan/outbound-orders/cc-locations/{location_id}` | [get_masan_cc_location](../../backend/app/modules/masan/masan_api.py#L256) |
| GET | `/api/v1/masan/outbound-orders/sorting-zone/cc-locations` | [list_masan_sorting_zone_cc_locations](../../backend/app/modules/masan/masan_api.py#L293) |
| GET | `/api/v1/masan/outbound-orders/sorting-items-needed` | [get_masan_sorting_items_needed](../../backend/app/modules/masan/masan_api.py#L322) |
| POST | `/api/v1/masan/outbound-orders/sorting-dispatch` | [masan_sorting_outbound_dispatch](../../backend/app/modules/masan/masan_api.py#L343) |
| GET | `/api/v1/masan/outbound-orders/sorting-zone/pending-stock` | [get_masan_sorting_zone_pending_stock](../../backend/app/modules/masan/masan_api.py#L374) |
| GET | `/api/v1/masan/outbound-orders/sorting-zone/return-tasks` | [get_masan_sorting_zone_return_tasks](../../backend/app/modules/masan/masan_api.py#L408) |
| GET | `/api/v1/masan/outbound-orders/sorting-zone/robot-tasks` | [get_masan_sorting_zone_robot_tasks](../../backend/app/modules/masan/masan_api.py#L478) |
| GET | `/api/v1/masan/outbound/picking-lists` | [list_masan_picking_lists](../../backend/app/modules/masan/masan_api.py#L496) |
| POST | `/api/v1/masan/outbound/picking-lists` | [create_masan_picking_list_pdf](../../backend/app/modules/masan/masan_api.py#L525) |
| GET | `/api/v1/masan/outbound/picking-lists/pdf` | [download_masan_picking_list_pdf](../../backend/app/modules/masan/masan_api.py#L550) |
| POST | `/api/v1/masan/outbound-orders/start-sorting-time` | [masan_start_sorting_time](../../backend/app/modules/masan/masan_api.py#L579) |
| POST | `/api/v1/masan/outbound-orders/confirm-allocation` | [masan_confirm_allocation_outbound](../../backend/app/modules/masan/masan_api.py#L596) |
| POST | `/api/v1/masan/inbound-orders/clear-inbound-zone` | [masan_clear_inbound_zone](../../backend/app/modules/masan/masan_api.py#L671) |
| POST | `/api/v1/masan/outbound-orders/clear-cc-cache` | [masan_clear_cc_cache](../../backend/app/modules/masan/masan_api.py#L685) |
| POST | `/api/v1/masan/outbound-orders/clear-station-cache` | [masan_clear_outbound_station_cache](../../backend/app/modules/masan/masan_api.py#L701) |
| POST | `/api/v1/masan/inbound-orders/caller` | [caller_masan_inbound_order](../../backend/app/modules/masan/masan_api.py#L725) |
| GET | `/api/v1/masan/inbound-orders/daily-capacity-export` | [export_masan_inbound_daily_capacity](../../backend/app/modules/masan/masan_api.py#L744) |
| POST | `/api/v1/masan/inbound-orders/export` | [export_masan_inbound_orders_bulk](../../backend/app/modules/masan/masan_api.py#L775) |
| GET | `/api/v1/masan/inbound-orders/{order_id}/export` | [export_masan_inbound_order](../../backend/app/modules/masan/masan_api.py#L805) |
| GET | `/api/v1/masan/inbound-orders/{inbound_order_id}/details` | [get_masan_inbound_order_details](../../backend/app/modules/masan/masan_api.py#L827) |
## backend/app/modules/warehouse/notificcation/notification_api.py

| Method | Path | Handler |
| --- | --- | --- |
| GET | `/api/v1/notifications` | [list_notifications](../../backend/app/modules/warehouse/notificcation/notification_api.py#L33) |
| POST | `/api/v1/notifications` | [create_notification](../../backend/app/modules/warehouse/notificcation/notification_api.py#L55) |
| GET | `/api/v1/notifications/{notification_id}` | [get_notification](../../backend/app/modules/warehouse/notificcation/notification_api.py#L68) |
| PATCH | `/api/v1/notifications/{notification_id}` | [update_notification](../../backend/app/modules/warehouse/notificcation/notification_api.py#L80) |
| POST | `/api/v1/notifications/{notification_id}/resolve` | [resolve_notification](../../backend/app/modules/warehouse/notificcation/notification_api.py#L99) |
| DELETE | `/api/v1/notifications/{notification_id}` | [delete_notification](../../backend/app/modules/warehouse/notificcation/notification_api.py#L114) |
## backend/app/modules/warehouse/dashboard/dashboard_api.py

| Method | Path | Handler |
| --- | --- | --- |
| GET | `/api/v1/dashboard/report-kpis` | [get_report_kpis](../../backend/app/modules/warehouse/dashboard/dashboard_api.py#L32) |
| GET | `/api/v1/dashboard/report-robot-performance/export` | [export_report_robot_performance](../../backend/app/modules/warehouse/dashboard/dashboard_api.py#L43) |
| GET | `/api/v1/dashboard/report-trends` | [get_report_trends](../../backend/app/modules/warehouse/dashboard/dashboard_api.py#L74) |
| GET | `/api/v1/dashboard/report-top-products` | [get_report_top_products](../../backend/app/modules/warehouse/dashboard/dashboard_api.py#L91) |
| GET | `/api/v1/dashboard/report-stock-aging` | [get_report_stock_aging_overview](../../backend/app/modules/warehouse/dashboard/dashboard_api.py#L108) |
| GET | `/api/v1/dashboard/report-stock-aging/bucket` | [get_report_stock_aging_bucket](../../backend/app/modules/warehouse/dashboard/dashboard_api.py#L123) |
## backend/app/socket/ws_api.py

| Method | Path | Handler |
| --- | --- | --- |
| WEBSOCKET | `/api/v1/ws/warehouse/{warehouse_id}` | [warehouse_websocket](../../backend/app/socket/ws_api.py#L25) |
| WEBSOCKET | `/api/v1/ws/masan/sorting-zone` | [masan_sorting_zone_websocket](../../backend/app/socket/ws_api.py#L74) |
## backend/app/main.py

| Method | Path | Handler |
| --- | --- | --- |
| GET | `/` | [root](../../backend/app/main.py#L100) |
| GET | `/health` | [health](../../backend/app/main.py#L109) |
