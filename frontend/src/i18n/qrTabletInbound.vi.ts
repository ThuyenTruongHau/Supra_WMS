/**
 * UI copy for QR tablet inbound page (Vietnamese).
 */

export const QR_TABLET_INBOUND_VI = {
  pageTitle: "Quét QR nhập kho",
  pageSubtitle:
    "Quét mã sản phẩm để gán vị trí, hoặc quét vị trí để tạo đơn nhập.",
  startScan: "Bắt đầu quét mã",
  assignFinishedProductScan: "Quét phiếu thành phẩm",
  assignPackingSlipScan: "Quét phiếu đóng gói",
  importQrTestNormal: "Import ảnh QR (quét thường)",
  importQrTestPacking: "Import ảnh QR (đóng gói)",
  startPackingScan: "Quét QR đóng gói",
  packingScanTitle: "Quét QR đóng gói",
  packingConfirmTitle: "Xác nhận pack",
  packingSaveButton: "Lưu pack",
  packingDraftSaved: "Đã lưu pack. Quét QR item để gán.",
  packingAssignSuccess: "Đã gán pack vào item",
  packingNeedPackFirst: "Cần quét pack trước khi quét QR item",
  packingFormIncomplete: "Nhập đủ số lượng, đơn vị và số lô trước khi gán item",
  packingWrongQrType: "Chỉ quét QR pack hoặc item trong luồng này",
  scanQrTitle: "Quét mã QR",
  scanLocationTitle: "Quét vị trí",
  confirmProductTitle: "Xác nhận sản phẩm",
  labelProduct: "Sản phẩm",
  labelQuantity: "Số lượng",
  labelUnit: "Đơn vị",
  labelConvertedQuantity: "Quy đổi",
  labelCavity: "Số cavity",
  labelLot: "Số lô",
  labelManufacturing: "Người sản xuất",
  labelManufacturingMachine: "Máy sản xuất",
  placeholderManufacturingMachine: "Chọn vị trí zone nhập",
  labelQc: "Người kiểm tra",
  labelPacking: "Người đóng gói",
  placeholderCavity: "Chọn số cavity",
  transitHint: "Loại QR di chuyển — chỉ cần người sản xuất.",
  productQcPackingHint: "Loại QR sản phẩm/đóng gói — cần QC và người đóng gói.",
  scanLocationButton: "Quét vị trí",
  scanNextQrButton: "Quét QR tiếp theo",
  packerCloseButton: "Đóng",
  packerScanNextButton: "Quét tiếp",
  packerSelectUserHint: "Chọn người đóng gói, xác nhận để tải danh sách QR đã lưu tạm.",
  packerItemDirectFormHint:
    "Người đóng gói chưa có dữ liệu lưu tạm. Nhập thông tin item để lưu tạm (mức item).",
  packerConfirmUserButton: "Xác nhận",
  packerCachedListTitle: "QR đã lưu tạm",
  packerWorkbenchTitle: "Danh sách QR đóng gói",
  packerEmptyList: "Chưa có mã QR nào",
  packerCacheIncomplete:
    "QR thiếu thông tin bắt buộc. Quét lại khi mã đã được lưu tạm trước đó.",
  packerListCount: "{count} mã QR",
  packerNoPacksToConfirm: "Cần quét ít nhất 1 pack trước khi xác nhận item",
  packerNoPacksForAnchor:
    "Người đóng gói chưa có pack hoặc item nào khớp với sản phẩm đang quét.",
  packerPendingItemMismatch:
    "Người đóng gói {packingUser} đang gom sản phẩm {pendingSku}, không khớp với item đang quét ({anchorSku}).",
  packerMixedUnit: "Các pack phải cùng đơn vị",
  packerItemMismatch: "Pack không thuộc cùng sản phẩm với item",
  packerInvalidLot: "Số lô pack không hợp lệ hoặc không gom được",
  packerAggregateFieldTooLong:
    "Dữ liệu gom (cavity, người SX, QC) vượt giới hạn cho phép",
  packerConfirmSending: "Đang gửi dữ liệu đóng gói...",
  packerBatchReviewTitle: "Xác nhận gửi dữ liệu đóng gói",
  packerBatchReviewHint:
    "Kiểm tra thông tin item gom từ pack đã có và pack mới được chọn. Bấm gửi để lưu tạm lên hệ thống.",
  packerBatchReviewItemSection: "Item gom từ pack",
  packerBatchReviewExistingItemSection: "Item đang lưu tạm",
  packerBatchReviewExistingPacksSection: "Pack đã gom trước",
  packerBatchReviewNewPacksSection: "Pack mới (chọn để thêm)",
  packerBatchReviewPacksSection: "Pack sẽ gửi",
  packerBatchReviewAggregatedSection: "Tổng gom (cũ + mới)",
  packerNoPacksSelected: "Chọn ít nhất 1 pack mới hoặc cần có pack đã gom trước",
  packerBatchSendButton: "Gửi dữ liệu",
  packerBatchSendProgress: "Đang gửi {current}/{total}...",
  packerBatchSendComplete: "Đã gửi xong",
  pendingCachedSuccess: "Đã lưu tạm QR {code} — {partNumber}",
  selectWarehouseFirst: "Hãy chọn kho ở header trước khi quét",
  assignedTitle: "Đã gán sản phẩm",
  noStockAtLocation: "Chưa có hàng được gán tại vị trí này",
  unhandledResponse: "Không xử lý được phản hồi từ server",
  cannotAssignLocationTitle: "Không thể gán vị trí",
  staffLoadError: "Không tải được danh sách nhân viên",
  staffSearchPlaceholder: "Gõ để tìm, chọn từ danh sách",
  staffLoading: "Đang tải...",
  staffListError: "Lỗi tải danh sách",
  staffNotFound: "Không tìm thấy nhân viên",
  inboundCompleteWithTasks: "Hoàn tất đơn nhập và đã gửi task",
  inboundComplete: "Hoàn tất đơn nhập",
  flowPackerModeLabel: "Người đóng gói",
  flowToggleAria: "Bật tắt chế độ người đóng gói",
  purgePackingCacheButton: "Xóa cache đóng gói",
  purgePackingCacheConfirmTitle: "Xóa cache pending đóng gói?",
  purgePackingCacheConfirmContent:
    "Toàn bộ QR/item đã lưu tạm (pending) trên kho sẽ bị xóa. Thao tác không hoàn tác.",
  purgePackingCacheSuccess: "Đã xóa {count} khóa cache pending",
  packerLocationImportTitle: "Nhập kho từ vị trí",
  packerLocationImportHint:
    "Chọn người đóng gói để lấy các item đã lưu tạm và tạo đơn nhập.",
  packerLocationNoPendingItems:
    "Người đóng gói chưa có item nào đã lưu tạm để nhập kho.",
  manualLocationReceived:
    "Đã nhận vị trí {location}. Hoàn tất form rồi bấm Quét vị trí để tạo đơn.",
  manualCloseButton: "Đóng",
  manualFeBatchCollectHint:
    "Quét liên tiếp: điền form một lần, bấm Đóng để lưu cache hoặc Quét vị trí để tạo đơn.",
  manualCreatedTitle: "Đã tạo đơn nhập",
  assignAggregatedHint:
    "Đã gom {count} pack vào item. Kiểm tra thông tin tổng hợp trước khi quét vị trí.",
  assignAggregatedPacksSection: "Pack đã gán",
  assignAggregatedSummarySection: "Thông tin tổng hợp",
  splitProductLabel: "Hàng lẻ",
  splitProductHint:
    "Đánh dấu QR này là hàng lẻ; số lượng trên form sẽ được ghi vào detail.split khi tạo đơn.",
  splitStockPreviewTitle: "Có hàng lẻ trong kho",
  splitStockPreviewHint:
    "Sản phẩm này đang có hàng lẻ khả dụng. Bạn có thể tiếp tục gán QR hoặc tạo đơn xuất hàng lẻ.",
  splitStockSummary: "{count} dòng — tổng {quantity}",
  splitStockColumnLot: "Số lô",
  splitStockColumnQuantity: "Số lượng",
  splitStockColumnLocation: "Vị trí",
  splitStockColumnCreatedAt: "Ngày tạo",
  splitStockCloseButton: "Đóng",
  splitStockExportButton: "Xuất hàng lẻ",
  splitStockScanBlocked:
    "Hoàn tất thao tác hàng lẻ trước khi quét QR tiếp theo.",
  feBatchCollectToggle: "Quét liên tiếp",
  feBatchToggleAria: "Bật tắt quét liên tiếp",
  feBatchCollectHint:
    "Chế độ quét liên tiếp. Hãy nhập form cuối đến gán all",
  feBatchProductSection: "Phiếu sản phẩm (item)",
  feBatchPackSection: "Phiếu đóng gói (pack)",
  feBatchAdded: "Đã thêm {code} ({count} phiếu)",
  feBatchDuplicate: "QR {code} đã có trong danh sách",
  feBatchTransitRejected: "Không gom QR di chuyển (transit)",
  feBatchUnsupportedRejected: "Loại QR không hỗ trợ gom",
  feBatchLocationRejected: "Chế độ gom QR — chỉ quét phiếu sản phẩm hoặc đóng gói",
  feBatchSubmitHint:
    "Sẽ gửi {total} phiếu (gom {cachedCount} + phiếu hiện tại nếu có)",
  feBatchSendProgress: "Đang gửi {current}/{total}...",
  feBatchSendComplete: "Đã gửi xong {count} phiếu",
  feBatchSendPartial:
    "Gửi xong {success}/{total}. {failed} phiếu lỗi: {details}",
  feBatchClearAll: "Xóa tất cả",
  feBatchRemoveEntry: "Xóa",
} as const;

export type QrTabletInboundMessageKey = keyof typeof QR_TABLET_INBOUND_VI;

export function tQrTabletInbound(key: QrTabletInboundMessageKey): string {
  return QR_TABLET_INBOUND_VI[key];
}

export function formatAssignedProduct(
  partNumber: string,
  location: string,
): string {
  return `Đã gán ${partNumber} cho vị trí ${location}`;
}

export function formatPendingCached(
  code: string,
  partNumber: string,
): string {
  return QR_TABLET_INBOUND_VI.pendingCachedSuccess
    .replace("{code}", code)
    .replace("{partNumber}", partNumber);
}

export function formatPackerListCount(count: number): string {
  return QR_TABLET_INBOUND_VI.packerListCount.replace(
    "{count}",
    String(count),
  );
}

export function formatPackerBatchSendProgress(
  current: number,
  total: number,
): string {
  return QR_TABLET_INBOUND_VI.packerBatchSendProgress
    .replace("{current}", String(current))
    .replace("{total}", String(total));
}

export function formatPackerPendingItemMismatch(
  packingUser: string,
  pendingSku: string,
  anchorSku: string,
): string {
  return QR_TABLET_INBOUND_VI.packerPendingItemMismatch
    .replace("{packingUser}", packingUser)
    .replace("{pendingSku}", pendingSku)
    .replace("{anchorSku}", anchorSku);
}

export function formatManualLocationReceived(location: string): string {
  return QR_TABLET_INBOUND_VI.manualLocationReceived.replace(
    "{location}",
    location,
  );
}

export function formatManualCreatedContent(orderCode: string): string {
  return `Mã đơn: ${orderCode}`;
}

export function formatAssignAggregatedHint(count: number): string {
  return QR_TABLET_INBOUND_VI.assignAggregatedHint.replace(
    "{count}",
    String(count),
  );
}

export function formatPurgePackingCacheSuccess(count: number): string {
  return QR_TABLET_INBOUND_VI.purgePackingCacheSuccess.replace(
    "{count}",
    String(count),
  );
}

export function formatSplitStockSummary(
  count: number,
  quantity: number,
): string {
  return QR_TABLET_INBOUND_VI.splitStockSummary
    .replace("{count}", String(count))
    .replace("{quantity}", String(quantity));
}

export function formatFeBatchAdded(code: string, count: number): string {
  return QR_TABLET_INBOUND_VI.feBatchAdded
    .replace("{code}", code)
    .replace("{count}", String(count));
}

export function formatFeBatchDuplicate(code: string): string {
  return QR_TABLET_INBOUND_VI.feBatchDuplicate.replace("{code}", code);
}

export function formatFeBatchSubmitHint(
  total: number,
  cachedCount: number,
): string {
  return QR_TABLET_INBOUND_VI.feBatchSubmitHint
    .replace("{total}", String(total))
    .replace("{cachedCount}", String(cachedCount));
}

export function formatFeBatchSendProgress(
  current: number,
  total: number,
): string {
  return QR_TABLET_INBOUND_VI.feBatchSendProgress
    .replace("{current}", String(current))
    .replace("{total}", String(total));
}

export function formatFeBatchSendComplete(count: number): string {
  return QR_TABLET_INBOUND_VI.feBatchSendComplete.replace(
    "{count}",
    String(count),
  );
}

export function formatFeBatchSendPartial(
  success: number,
  total: number,
  failed: number,
  details: string,
): string {
  return QR_TABLET_INBOUND_VI.feBatchSendPartial
    .replace("{success}", String(success))
    .replace("{total}", String(total))
    .replace("{failed}", String(failed))
    .replace("{details}", details);
}
