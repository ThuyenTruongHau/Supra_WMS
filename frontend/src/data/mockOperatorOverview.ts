/** Mock dữ liệu trang tổng quan dành cho tài khoản operator (O001 / O002). */

export const MOCK_OPERATOR_KPIS = [
  {
    id: 'inbound',
    label: 'Tiến độ nhập hàng',
    value: '37.5%',
    sub: '(45/120)',
    icon: 'inbound' as const,
  },
  {
    id: 'outbound',
    label: 'Yêu cầu xuất hàng',
    value: '13 phiên',
    sub: '(Picking List)',
    icon: 'outbound' as const,
  },
  {
    id: 'agv',
    label: 'AGV đang hoạt động',
    value: '2 Robot',
    sub: '/ 2 Active',
    icon: 'agv' as const,
  },
  {
    id: 'scada',
    label: 'Độ trễ truyền SCADA',
    value: '~2.1s',
    sub: '/ Live Sync',
    icon: 'scada' as const,
  },
]

export const MOCK_AGV_NODES_LEFT = ['A1', 'A2', 'A3', 'A4'] as const
export const MOCK_AGV_NODES_RIGHT = ['B1', 'B2', 'B3', 'B4'] as const

export const MOCK_AGV_UNITS = [
  { id: 'AGV-01', position: 28 },
  { id: 'AGV-02', position: 62 },
]

/** Mức độ thông báo: đỏ / vàng / xanh */
export const MOCK_OPERATOR_ALERTS = [
  {
    id: '1',
    title: 'AGV 02 — Standby',
    time: '09:25',
    body: 'Robot AGV_02 hoàn tất nhiệm vụ di chuyển, đang ở vị trí chờ lệnh mới.',
    level: 'red' as const,
  },
  {
    id: '2',
    title: 'Độ trễ SCADA tăng',
    time: '09:22',
    body: 'Độ trễ truyền đạt ~2.1s. Theo dõi Live Sync trong phiên làm việc hiện tại.',
    level: 'yellow' as const,
  },
  {
    id: '3',
    title: 'Tác vụ hoàn tất',
    time: '09:20',
    body: 'Đã bàn giao hoàn tất lô hàng cho xe 51F-123.45.',
    level: 'green' as const,
  },
]

/** Copy từ ReportPage — hiệu suất robot theo giờ */
export const MOCK_ROBOT_HOURLY_DATA = [
  { hour: '00h', coTai: 2, khongTai: 8, hieuXuat: 45, thanhCong: 12, thatBai: 1 },
  { hour: '01h', coTai: 1, khongTai: 6, hieuXuat: 42, thanhCong: 8, thatBai: 0 },
  { hour: '02h', coTai: 0, khongTai: 5, hieuXuat: 38, thanhCong: 5, thatBai: 0 },
  { hour: '03h', coTai: 1, khongTai: 4, hieuXuat: 40, thanhCong: 6, thatBai: 1 },
  { hour: '04h', coTai: 3, khongTai: 7, hieuXuat: 48, thanhCong: 14, thatBai: 1 },
  { hour: '05h', coTai: 5, khongTai: 10, hieuXuat: 55, thanhCong: 22, thatBai: 2 },
  { hour: '06h', coTai: 8, khongTai: 12, hieuXuat: 62, thanhCong: 35, thatBai: 2 },
  { hour: '07h', coTai: 14, khongTai: 10, hieuXuat: 72, thanhCong: 48, thatBai: 3 },
  { hour: '08h', coTai: 22, khongTai: 8, hieuXuat: 78, thanhCong: 62, thatBai: 3 },
  { hour: '09h', coTai: 28, khongTai: 6, hieuXuat: 84, thanhCong: 74, thatBai: 4 },
  { hour: '10h', coTai: 32, khongTai: 5, hieuXuat: 88, thanhCong: 82, thatBai: 3 },
  { hour: '11h', coTai: 30, khongTai: 6, hieuXuat: 86, thanhCong: 78, thatBai: 4 },
  { hour: '12h', coTai: 18, khongTai: 12, hieuXuat: 75, thanhCong: 52, thatBai: 2 },
  { hour: '13h', coTai: 26, khongTai: 7, hieuXuat: 82, thanhCong: 68, thatBai: 3 },
  { hour: '14h', coTai: 34, khongTai: 5, hieuXuat: 90, thanhCong: 86, thatBai: 4 },
  { hour: '15h', coTai: 36, khongTai: 4, hieuXuat: 92, thanhCong: 90, thatBai: 3 },
  { hour: '16h', coTai: 33, khongTai: 6, hieuXuat: 89, thanhCong: 84, thatBai: 5 },
  { hour: '17h', coTai: 24, khongTai: 9, hieuXuat: 80, thanhCong: 66, thatBai: 4 },
  { hour: '18h', coTai: 16, khongTai: 11, hieuXuat: 70, thanhCong: 44, thatBai: 3 },
  { hour: '19h', coTai: 10, khongTai: 14, hieuXuat: 62, thanhCong: 32, thatBai: 2 },
  { hour: '20h', coTai: 6, khongTai: 10, hieuXuat: 55, thanhCong: 24, thatBai: 2 },
  { hour: '21h', coTai: 4, khongTai: 8, hieuXuat: 50, thanhCong: 18, thatBai: 1 },
  { hour: '22h', coTai: 3, khongTai: 7, hieuXuat: 47, thanhCong: 14, thatBai: 1 },
  { hour: '23h', coTai: 2, khongTai: 6, hieuXuat: 44, thanhCong: 10, thatBai: 0 },
]
