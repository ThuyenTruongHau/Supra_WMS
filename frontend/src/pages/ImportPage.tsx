import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import Hero from '@/components/shared/Hero';
import { Card, Button, Table, Input, Select } from '@/components/ui';
import { Space, Tag, message } from 'antd';
import { useNavigate } from 'react-router-dom';
import {
  SearchOutlined,
  DownloadOutlined,
  UploadOutlined,
  PlusOutlined,
  EyeOutlined,
  UserOutlined
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import CreateImportModal, { PalletGroupForm } from './components/CreateImportModal';
import { useGetInboundOrders } from '@/hooks/useInboundOrder';
import { useDebounce } from '@/hooks/useDebounce';
import { useAppStore } from '@/store/useAppStore';
import dayjs from 'dayjs';

export default function ImportPage() {
  const navigate = useNavigate();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [importData, setImportData] = useState<PalletGroupForm[] | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedWarehouseId = useAppStore((state) => state.selectedWarehouseId);

  // Filter states
  const [supplierName, setSupplierName] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Debounce supplier name search (500ms)
  const debouncedSupplier = useDebounce(supplierName, 500);

  // Lấy dữ liệu phiếu nhập từ API (infinite query for cursor pagination)
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useGetInboundOrders({
    zone_id: selectedWarehouseId || 0,
    supplier_name: debouncedSupplier || undefined,
    status: statusFilter !== 'all' ? statusFilter : undefined,
    limit: 20,
  });

  // Flatten all pages into a single orders array
  const orders = data?.pages?.flatMap((page) => page.orders) ?? [];

  // KPI dữ liệu (Sử dụng CSS variables từ index.css)
  const kpiData = [
    { label: 'Tổng đơn nhập', value: String(orders.length), color: 'var(--color-brand-dark)' },
    { label: 'Đang thực thi', value: String(orders.filter(o => o.status === 'in_progress').length), color: 'var(--color-stripe-lemon)' },
    { label: 'Đã hoàn thành', value: String(orders.filter(o => o.status === 'completed').length), color: 'var(--color-brand-primary)' },
    { label: 'Đã huỷ', value: String(orders.filter(o => o.status === 'cancelled').length), color: 'var(--color-stripe-ruby)' },
  ];

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const fileData = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(fileData, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 });

        let headerRowIndex = -1;
        let skuColIdx = -1;
        let nameColIdx = -1;
        let lotColIdx = -1;
        let qtyColIdx = -1;
        let numPalletColIdx = -1;
        let detailDatetimeColIdx = -1;
        let vehicleNumberColIdx = -1;
        let sourceWarehouseColIdx = -1;
        let targetWarehouseColIdx = -1;
        let deliveryColIdx = -1;
        let nvtColIdx = -1;

        // Tìm dòng header
        for (let i = 0; i < jsonData.length; i++) {
          const row = jsonData[i];
          if (!row) continue;
          const colIdx = row.findIndex((cell: any) => typeof cell === 'string' && cell.trim() === 'Mã Item');
          if (colIdx !== -1) {
            headerRowIndex = i;
            skuColIdx = colIdx;
            nameColIdx = row.findIndex((c: any) => typeof c === 'string' && c.trim() === 'Tên Item');
            lotColIdx = row.findIndex((c: any) => typeof c === 'string' && c.trim() === 'LOT');
            qtyColIdx = row.findIndex((c: any) => typeof c === 'string' && c.trim() === 'Số lượng');
            numPalletColIdx = row.findIndex((c: any) => typeof c === 'string' && c.trim() === 'Số pallet');
            detailDatetimeColIdx = row.findIndex((c: any) => typeof c === 'string' && c.trim() === 'Ngày/ Giờ chi tiết');
            vehicleNumberColIdx = row.findIndex((c: any) => typeof c === 'string' && c.trim() === 'Số xe');
            sourceWarehouseColIdx = row.findIndex((c: any) => typeof c === 'string' && c.trim() === 'Kho xuất');
            targetWarehouseColIdx = row.findIndex((c: any) => typeof c === 'string' && c.trim() === 'Kho nhập');
            deliveryColIdx = row.findIndex((c: any) => typeof c === 'string' && c.trim() === 'Delivery');
            nvtColIdx = row.findIndex((c: any) => typeof c === 'string' && c.trim() === 'NVT');
            break;
          }
        }

        if (headerRowIndex === -1) {
          message.error('Không tìm thấy cột "Mã Item" trong file Excel!');
          if (fileInputRef.current) fileInputRef.current.value = '';
          return;
        }

        const parsedGroups: PalletGroupForm[] = [];

        // Đọc dữ liệu từ dòng dưới header
        for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
          const row = jsonData[i];
          if (!row) continue;
          const sku = row[skuColIdx];
          if (!sku) continue; // Bỏ qua dòng trống

          const item_name = nameColIdx !== -1 ? row[nameColIdx] : '';
          const lot = lotColIdx !== -1 ? row[lotColIdx] : '';
          const qty = qtyColIdx !== -1 ? Number(row[qtyColIdx]) : 0;
          const numPallets = numPalletColIdx !== -1 ? Number(row[numPalletColIdx]) : 0;

          parsedGroups.push({
            key: `group-${Date.now()}-${i}`,
            sku: String(sku).trim(),
            item_name: item_name ? String(item_name).trim() : '',
            lot_code: lot ? String(lot).trim() : '',
            expire_at: undefined, // Cố tình để trống để user tự chọn
            // extra fields
            detail_datetime: detailDatetimeColIdx !== -1 && row[detailDatetimeColIdx] ? String(row[detailDatetimeColIdx]).trim() : undefined,
            vehicle_number: vehicleNumberColIdx !== -1 && row[vehicleNumberColIdx] ? String(row[vehicleNumberColIdx]).trim() : undefined,
            source_warehouse: sourceWarehouseColIdx !== -1 && row[sourceWarehouseColIdx] ? String(row[sourceWarehouseColIdx]).trim() : undefined,
            target_warehouse: targetWarehouseColIdx !== -1 && row[targetWarehouseColIdx] ? String(row[targetWarehouseColIdx]).trim() : undefined,
            delivery_type: deliveryColIdx !== -1 && row[deliveryColIdx] ? String(row[deliveryColIdx]).trim() : undefined,
            nvt_code: nvtColIdx !== -1 && row[nvtColIdx] ? String(row[nvtColIdx]).trim() : undefined,
            configs: [{
              key: `config-${Date.now()}-${i}`,
              qtyPerPallet: isNaN(qty) ? 0 : qty,
              numPallets: isNaN(numPallets) ? 1 : numPallets,
            }]
          });
        }

        if (parsedGroups.length > 0) {
          setImportData(parsedGroups);
          setIsCreateModalOpen(true);
          message.success(`Đã đọc thành công ${parsedGroups.length} mã sản phẩm từ Excel!`);
        } else {
          message.warning('Không tìm thấy dữ liệu hợp lệ trong file!');
        }
      } catch (error) {
        message.error('Lỗi khi đọc file Excel!');
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDownloadTemplate = () => {
    const ws_data = [
      ['Mã Item', 'Tên Item', 'LOT', 'Số lượng', 'Số pallet', 'Ngày/ Giờ chi tiết', 'Số xe', 'Kho xuất', 'Kho nhập', 'Delivery', 'NVT'],
      ['SKU001', 'Sản phẩm mẫu 1', '120626', 100, 2, '2023-10-25 10:00', '51C-12345', 'Kho A', 'Kho B', '100012345', 'Hoa vân'],
      ['SKU002', 'Sản phẩm mẫu 2', '120526', 50, 1, '2023-10-25 10:00', '51C-12345', 'Kho A', 'Kho B', '100012345', 'HOa vân']
    ];
    const ws = XLSX.utils.aoa_to_sheet(ws_data);

    ws['!cols'] = [
      { wch: 15 }, { wch: 30 }, { wch: 15 }, { wch: 10 }, { wch: 10 },
      { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "Template_NhapKho.xlsx");
  };

  const columns: ColumnsType<any> = [
    {
      title: 'Mã phiếu',
      dataIndex: 'order_code',
      key: 'order_code',
      render: (text) => <a style={{ color: 'var(--color-brand-primary)' }} className="font-medium hover:opacity-80">{text}</a>,
    },
    {
      title: 'Ngày tạo',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (text) => dayjs(text).format('DD/MM/YYYY HH:mm'),
    },
    {
      title: 'Tiến độ',
      key: 'progress',
      render: (_, record) => {
        let totalOrdered = 0;
        let totalReceived = 0;
        record.details?.forEach((detail: any) => {
          totalOrdered += Number(detail.ordered_quantity) || 0;
          totalReceived += Number(detail.received_quantity) || 0;
        });
        return `${totalReceived}/${totalOrdered}`;
      }
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (status) => {
        let color = 'default';
        let text = status;
        if (status === 'pending') { color = 'default'; text = 'Chờ nhập'; }
        if (status === 'in_progress') { color = 'var(--color-stripe-lemon)'; text = 'Đang thực thi'; }
        if (status === 'completed') { color = 'var(--color-brand-primary)'; text = 'Hoàn thành'; }
        if (status === 'cancelled') { color = 'var(--color-stripe-ruby)'; text = 'Đã hủy'; }
        return <Tag color={color}>{text}</Tag>;
      },
    },
    {
      title: 'Thao tác',
      key: 'action',
      render: (_, record) => (
        <Space>
          <Button variant="text" icon={<EyeOutlined />} onClick={() => navigate(`/import/${record.order_code}`)} title="Xem chi tiết (Admin)" />
          <Button variant="text" icon={<UserOutlined />} onClick={() => navigate(`/worker/inbound/${record.order_code}`)} title="Màn hình Công nhân (Tablet)" className="text-brand-primary!" />
        </Space>
      ),
    },
  ];

  return (
    <div className=" space-y-6">
      {/* Sử dụng component Hero */}
      <Hero
        title="Quản lý Nhập kho"
        list={kpiData}
      />

      <Card>
        {/* Action Bar */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div className="flex flex-wrap items-center gap-3">
            <Input
              placeholder="Tìm người tạo"
              prefix={<SearchOutlined className="text-slate-400" />}
              className="w-64"
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
              allowClear
            />
            <Select
              placeholder="Trạng thái"
              className="w-40"
              value={statusFilter}
              onChange={(val) => setStatusFilter(val)}
              options={[
                { value: 'all', label: 'Tất cả trạng thái' },
                { value: 'pending', label: 'Chờ nhập' },
                { value: 'in_progress', label: 'Đang thực thi' },
                { value: 'completed', label: 'Hoàn thành' },
                { value: 'cancelled', label: 'Đã hủy' },
              ]}
            />
          </div>

          <div className="flex items-center gap-3">
            <input
              type="file"
              accept=".xlsx, .xls"
              ref={fileInputRef}
              style={{ display: 'none' }}
              onChange={handleImportExcel}
            />
            <Button variant="secondary" icon={<UploadOutlined />} onClick={() => fileInputRef.current?.click()}>
              Import Excel
            </Button>
            <Button variant="secondary" icon={<DownloadOutlined />} onClick={handleDownloadTemplate}>
              Tải Template
            </Button>
            <Button variant="primary" icon={<PlusOutlined />} onClick={() => setIsCreateModalOpen(true)}>
              Tạo đơn nhập
            </Button>
          </div>
        </div>

        {/* Data Table */}
        <Table
          columns={columns}
          dataSource={orders}
          rowKey="id"
          loading={isLoading}
          pagination={false}
        />
        {hasNextPage && (
          <div className="flex justify-center mt-4">
            <Button
              variant="secondary"
              onClick={() => fetchNextPage()}
              loading={isFetchingNextPage}
            >
              Tải thêm
            </Button>
          </div>
        )}
      </Card>

      <CreateImportModal
        open={isCreateModalOpen}
        initialData={importData}
        onCancel={() => {
          setIsCreateModalOpen(false);
          setImportData(undefined);
        }}
        onSuccess={() => {
          setIsCreateModalOpen(false);
          setImportData(undefined);
        }}
      />
    </div>
  );
}
