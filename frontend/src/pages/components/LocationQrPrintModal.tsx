import { useEffect, useMemo, useRef, useState } from 'react';
import type { AxiosError } from 'axios';
import type { Key } from 'react';
import {
  Button,
  Input,
  Modal,
  Space,
  Table,
  message,
} from '@/components/ui';
import { PrinterOutlined, SearchOutlined } from '@ant-design/icons';
import { usePrintLocationQrCodes, useWarehouseLocations } from '@/hooks/useZones';
import type { ApiErrorResponse } from '@/types/apiError';
import type { LocationSummary, Zone } from '@/types/zone';
import { printBacvietHtml } from '@/utils/printBacvietHtml';

const EMPTY_LOCATIONS: LocationSummary[] = [];

type LocationQrPrintModalProps = {
  open: boolean;
  onClose: () => void;
  zone: Zone | null;
  warehouseId: number;
};

function getErrorMessage(err: unknown, fallback: string) {
  const detail = (err as AxiosError<ApiErrorResponse>).response?.data?.detail;
  return typeof detail === 'string' ? detail : fallback;
}

export default function LocationQrPrintModal({
  open,
  onClose,
  zone,
  warehouseId,
}: LocationQrPrintModalProps) {
  const [searchText, setSearchText] = useState('');
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);

  const zoneId = zone?.id;
  const { data: zoneLocations = EMPTY_LOCATIONS, isLoading } = useWarehouseLocations(
    open && zoneId ? warehouseId : undefined,
    open && zoneId ? zoneId : undefined,
  );
  const printLocationQrCodes = usePrintLocationQrCodes();
  const selectionInitKeyRef = useRef<string | null>(null);

  const activeLocations = useMemo(
    () => zoneLocations.filter((loc) => loc.is_active),
    [zoneLocations],
  );

  const filteredLocations = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return activeLocations;
    return activeLocations.filter(
      (loc) =>
        loc.location_code.toLowerCase().includes(q) ||
        loc.location_name.toLowerCase().includes(q),
    );
  }, [activeLocations, searchText]);

  useEffect(() => {
    if (!open) {
      setSearchText('');
      setPreviewHtml(null);
      setSelectedRowKeys([]);
      selectionInitKeyRef.current = null;
      return;
    }

    if (isLoading || zoneId == null) return;

    const initKey = `${zoneId}:${zoneLocations.length}`;
    if (selectionInitKeyRef.current === initKey) return;
    selectionInitKeyRef.current = initKey;

    setSelectedRowKeys(
      zoneLocations.filter((loc) => loc.is_active).map((loc) => loc.id),
    );
  }, [open, zoneId, isLoading, zoneLocations]);

  const handleGeneratePreview = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('Vui lòng chọn ít nhất một vị trí để in');
      return;
    }

    const locationIds = selectedRowKeys.map((key) => Number(key)).filter(Boolean);
    try {
      const result = await printLocationQrCodes.mutateAsync(locationIds);
      setPreviewHtml(result.html);
    } catch (err) {
      message.error(getErrorMessage(err, 'Không thể tạo mã QR vị trí'));
    }
  };

  const handlePrint = () => {
    if (!previewHtml) return;
    const printed = printBacvietHtml(previewHtml);
    if (!printed) {
      message.warning('Không thể mở hộp thoại in');
      return;
    }
    onClose();
  };

  const handleBackToSelect = () => {
    setPreviewHtml(null);
  };

  const columns = [
    {
      title: 'Mã vị trí',
      dataIndex: 'location_code',
      key: 'location_code',
      render: (text: string) => (
        <span className="font-medium text-brand-primary">{text}</span>
      ),
    },
    {
      title: 'Tên vị trí',
      dataIndex: 'location_name',
      key: 'location_name',
    },
  ];

  const isPreviewStep = previewHtml != null;
  const zoneLabel = zone?.code ?? '';

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={isPreviewStep ? 820 : 720}
      destroyOnHidden
      title={`In QR vị trí — Zone ${zoneLabel}`}
      className="[&_.ant-modal-body]:!py-4"
      footer={
        <Space>
          <Button variant="secondary" onClick={onClose}>
            Đóng
          </Button>
          {isPreviewStep ? (
            <>
              <Button variant="secondary" onClick={handleBackToSelect}>
                Chọn lại
              </Button>
              <Button
                variant="primary"
                icon={<PrinterOutlined />}
                onClick={handlePrint}
              >
                In
              </Button>
            </>
          ) : (
            <Button
              variant="primary"
              icon={<PrinterOutlined />}
              loading={printLocationQrCodes.isPending}
              disabled={selectedRowKeys.length === 0}
              onClick={handleGeneratePreview}
            >
              Tạo mã QR ({selectedRowKeys.length})
            </Button>
          )}
        </Space>
      }
    >
      {!isPreviewStep ? (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Chọn các vị trí thuộc Zone <strong>{zoneLabel}</strong> cần in mã QR.
            Mỗi vị trí in trên 1 trang A4.
          </p>

          <Input
            allowClear
            prefix={<SearchOutlined className="text-gray-400" />}
            placeholder="Tìm theo mã hoặc tên vị trí..."
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />

          <Table<LocationSummary>
            rowKey="id"
            size="small"
            loading={isLoading}
            columns={columns}
            dataSource={filteredLocations}
            pagination={{ pageSize: 10, showSizeChanger: true }}
            rowSelection={{
              selectedRowKeys,
              onChange: (keys) => setSelectedRowKeys(keys),
            }}
            locale={{
              emptyText: zone
                ? 'Zone này chưa có vị trí nào'
                : 'Chưa chọn Zone',
            }}
            className="[&_.ant-table-thead_th]:bg-slate-50! [&_.ant-table-thead_th]:text-slate-600! [&_.ant-table-thead_th]:font-semibold!"
          />
        </div>
      ) : (
        <iframe
          title="Xem trước QR vị trí"
          srcDoc={previewHtml}
          className="h-[70vh] w-full border-0 bg-white"
        />
      )}
    </Modal>
  );
}
