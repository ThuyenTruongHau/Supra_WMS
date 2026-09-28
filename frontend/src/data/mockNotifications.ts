import type { AppNotification } from '@/types/notification'

const now = new Date('2026-07-02T14:30:00')

function hoursAgo(hours: number): string {
  return new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString()
}

function daysAgo(days: number, hours = 10): string {
  return new Date(
    now.getTime() - days * 24 * 60 * 60 * 1000 - (14 - hours) * 60 * 60 * 1000,
  ).toISOString()
}

export const MOCK_NOTIFICATIONS: AppNotification[] = [
  {
    id: 'notif-001',
    type: 'alert',
    priority: 'high',
    category: 'inventory',
    title: 'Cảnh báo tồn kho thấp',
    message:
      'Sản phẩm 01PH00075 (Phở Bò CHIN-SU Story 30gói x 80gr) chỉ còn 12 thùng tại kho thành phẩm. Ngưỡng cảnh báo: 20 thùng.',
    createdAt: hoursAgo(0.25),
    link: '/products',
    linkLabel: 'Xem sản phẩm',
    meta: 'Kho thành phẩm',
  },
  {
    id: 'notif-002',
    type: 'info',
    priority: 'medium',
    category: 'outbound',
    title: '2 xe xuất đang chờ xử lý',
    message:
      'Xe 89H12345 (Hoa Lâm) và 89H12336 (Minh Kiên Phát) có 16 dòng hàng CHIN-SU/Omachi cần gán wave và hoàn tất trong ngày 07/01/2026.',
    createdAt: hoursAgo(1),
    link: '/export',
    linkLabel: 'Mở đơn xuất',
    meta: 'Xuất kho',
  },
  {
    id: 'notif-003',
    type: 'alert',
    priority: 'high',
    category: 'audit',
    title: 'Kiểm kê phát hiện chênh lệch',
    message:
      'Phiếu KK-2026-0003 có 4 dòng chênh lệch tổng cộng -12 đơn vị. Vui lòng rà soát và xác nhận điều chỉnh tồn.',
    createdAt: hoursAgo(2.5),
    link: '/inventory',
    linkLabel: 'Xem phiếu kiểm kê',
    meta: 'Kiểm kê',
  },
  {
    id: 'notif-004',
    type: 'success',
    priority: 'low',
    category: 'inbound',
    title: 'Hoàn thành nhập kho',
    message:
      'Đơn nhập lot 120626 đã nhập đủ 180 thùng Phở Bò CHIN-SU Story (01PH00073) vào locator A01–A03_SSO.',
    createdAt: hoursAgo(3),
    link: '/import',
    linkLabel: 'Xem đơn nhập',
    meta: 'Nhập kho',
  },
  {
    id: 'notif-005',
    type: 'alert',
    priority: 'high',
    category: 'robot',
    title: 'Robot AMR #03 gặp sự cố',
    message:
      'Robot AMR-03 dừng tại node B-12 do lộ trình bị chặn. Tác vụ lấy hàng SO-2026-0087 tạm hoãn.',
    createdAt: hoursAgo(4),
    meta: 'Robot AMR',
  },
  {
    id: 'notif-006',
    type: 'info',
    priority: 'medium',
    category: 'outbound',
    title: 'Wave chia chọn buổi chiều đã kích hoạt',
    message:
      'Wave "Chiều 12h30" đã gán cho khách C, D với 8 dòng 01PH00073/01PH00126/01PH00174. Ưu tiên locator A01–A08_SSO.',
    createdAt: hoursAgo(5),
    link: '/export/sorting-waves',
    linkLabel: 'Quản lý wave',
    meta: 'Chia chọn',
  },
  {
    id: 'notif-007',
    type: 'alert',
    priority: 'medium',
    category: 'inventory',
    title: '12 vị trí kệ đạt trạng thái đầy',
    message:
      'Khu B (tầng 2) có 12 ô kệ ở trạng thái full. Cân nhắc chuyển hàng hoặc mở rộng khu cất tạm.',
    createdAt: hoursAgo(8),
    link: '/dashboard',
    linkLabel: 'Xem bản đồ kho',
    meta: 'Vị trí kệ',
  },
  {
    id: 'notif-008',
    type: 'info',
    priority: 'medium',
    category: 'audit',
    title: 'Nhắc kiểm kê cuối tháng',
    message:
      'Theo kế hoạch, đợt kiểm kê chu kỳ tháng 7 cần hoàn thành trước ngày 05/07/2026.',
    createdAt: daysAgo(1),
    link: '/inventory',
    linkLabel: 'Tạo phiếu kiểm kê',
    meta: 'Kiểm kê định kỳ',
  },
  {
    id: 'notif-009',
    type: 'system',
    priority: 'low',
    category: 'system',
    title: 'Sao lưu dữ liệu tự động thành công',
    message:
      'Hệ thống đã sao lưu cơ sở dữ liệu lúc 02:00 sáng. Dung lượng: 248 MB, thời gian: 42 giây.',
    createdAt: daysAgo(1, 2),
    meta: 'Hệ thống',
  },
  {
    id: 'notif-010',
    type: 'success',
    priority: 'low',
    category: 'system',
    title: 'Đồng bộ bản đồ kho hoàn tất',
    message:
      'Bản đồ kho phiên bản v12 đã được import và đồng bộ 486 vị trí kệ thành công.',
    createdAt: daysAgo(2),
    link: '/setting/warehouse',
    linkLabel: 'Cài đặt kho',
    meta: 'Bản đồ kho',
  },
  {
    id: 'notif-011',
    type: 'system',
    priority: 'low',
    category: 'system',
    title: 'Cập nhật phiên bản WMS 0.2.0',
    message:
      'Đã triển khai module kiểm kê và cải thiện hiệu năng bảng đơn xuất. Không cần thao tác từ người dùng.',
    createdAt: daysAgo(3),
    meta: 'Hệ thống',
  },
  {
    id: 'notif-012',
    type: 'info',
    priority: 'low',
    category: 'inbound',
    title: 'Đơn nhập mới được tạo',
    message:
      'Nguyễn Văn A vừa tạo đơn nhập mới với 8 dòng sản phẩm, tổng 640 đơn vị.',
    createdAt: daysAgo(4),
    link: '/import',
    linkLabel: 'Xem đơn nhập',
    meta: 'Nhập kho',
  },
]

/** Mặc định coi các thông báo cũ hơn 1 ngày là đã đọc khi khởi tạo lần đầu */
export const DEFAULT_READ_NOTIFICATION_IDS = MOCK_NOTIFICATIONS.filter((item) => {
  const ageMs = now.getTime() - new Date(item.createdAt).getTime()
  return ageMs > 24 * 60 * 60 * 1000
}).map((item) => item.id)
