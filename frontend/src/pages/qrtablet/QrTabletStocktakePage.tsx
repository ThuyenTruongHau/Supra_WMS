import { useEffect, useState } from "react";
import Hero from "@/components/shared/Hero";
import { Card, Table, Button } from "@/components/ui";
import type { ColumnsType } from "antd/es/table";
import { PlusOutlined } from "@ant-design/icons";
import { useAppStore } from "@/store/useAppStore";
import { useGetStocktakeItems } from "@/hooks/useStocktake";
import type { StocktakeItemStock } from "@/types/stocktake";
import InboundStatusTag from "@/components/shared/InboundStatusTag";
import CreateStocktakeModal from "@/pages/components/CreateStocktakeModal";
import StocktakeRecordCountModal from "@/pages/components/StocktakeRecordCountModal";

const PAGE_SIZE = 20;
const CHECKLIST_STATUSES = ["initialize", "in_progress"] as const;

const TABLE_CLASS =
  "[&_.ant-table-thead_th]:!bg-slate-50 [&_.ant-table-thead_th]:!text-slate-600 [&_.ant-table-thead_th]:!font-semibold [&_.ant-table-thead_th]:!text-base [&_.ant-table-tbody_td]:!text-base [&_.ant-table-thead_th]:!py-3 [&_.ant-table-tbody_td]:!py-3 [&_.ant-table-row]:hover:bg-slate-50/50";

function displayLocationName(record: StocktakeItemStock): string {
  return (
    record.location_name ||
    (record.location_id ? `#${record.location_id}` : "—")
  );
}

export default function QrTabletStocktakePage() {
  const selectedWarehouseId = useAppStore((state) => state.selectedWarehouseId);
  const warehouseId = selectedWarehouseId || 0;

  const [checklistPage, setChecklistPage] = useState(1);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [recordTarget, setRecordTarget] = useState<StocktakeItemStock | null>(
    null,
  );

  useEffect(() => {
    setChecklistPage(1);
  }, [warehouseId]);

  const {
    data: checklistData,
    isLoading: isChecklistLoading,
    refetch: refetchChecklist,
  } = useGetStocktakeItems({
    warehouse_id: warehouseId,
    page: checklistPage,
    page_size: PAGE_SIZE,
    statuses: [...CHECKLIST_STATUSES],
  });

  const checklist = checklistData?.items ?? [];

  const checklistColumns: ColumnsType<StocktakeItemStock> = [
    {
      title: "Phiếu",
      dataIndex: "stocktake_id",
      key: "stocktake_id",
      width: 100,
      render: (id: number) => (
        <span className="font-semibold text-brand-primary">#{id}</span>
      ),
    },
    {
      title: "Vị trí",
      key: "location_name",
      width: 200,
      render: (_, record) => displayLocationName(record),
    },
    {
      title: "Mã sản phẩm",
      dataIndex: "item_sku",
      key: "item_sku",
      width: 140,
      render: (sku: string | null) => sku || "—",
    },
    {
      title: "Sản phẩm",
      dataIndex: "item_name",
      key: "item_name",
      ellipsis: true,
      render: (name: string | null) => name || "—",
    },
    {
      title: "Lot",
      dataIndex: "lot_number",
      key: "lot_number",
      width: 180,
    },
    {
      title: "SL hệ thống",
      dataIndex: "desired_quantity",
      key: "desired_quantity",
      width: 130,
      align: "right",
    },
    {
      title: "SL thực tế",
      dataIndex: "actual_quantity",
      key: "actual_quantity",
      width: 130,
      align: "right",
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      width: 150,
      render: (status: string | null, record) => {
        if (status === "initialize") {
          return (
            <Button
              variant="primary"
              onClick={(e) => {
                e.stopPropagation();
                setRecordTarget(record);
              }}
            >
              Ghi nhận
            </Button>
          );
        }
        return status ? (
          <InboundStatusTag status={status} size="sm" />
        ) : (
          "—"
        );
      },
    },
  ];

  return (
    <div className="space-y-4 md:space-y-6">
      <Hero title="Kiểm kê" />

      <Card>
        <div className="mb-6 flex flex-col items-stretch justify-between gap-4 sm:flex-row sm:items-center">
          <h3 className="text-base font-semibold text-brand-dark">
            Checklist kiểm kê
          </h3>
          <Button
            variant="primary"
            icon={<PlusOutlined />}
            className="!h-11 shrink-0"
            onClick={() => setIsCreateOpen(true)}
            disabled={warehouseId <= 0}
          >
            Tạo Phiếu
          </Button>
        </div>

        <Table
          columns={checklistColumns}
          dataSource={checklist}
          rowKey="id"
          loading={isChecklistLoading}
          scroll={{ x: 960 }}
          pagination={{
            current: checklistPage,
            pageSize: PAGE_SIZE,
            total: checklistData?.total ?? 0,
            showSizeChanger: false,
            showTotal: (t, range) =>
              `Hiển thị ${range[0]}–${range[1]} / ${t} dòng`,
            onChange: (nextPage) => setChecklistPage(nextPage),
          }}
          className={TABLE_CLASS}
          size="middle"
        />
      </Card>

      <CreateStocktakeModal
        open={isCreateOpen}
        warehouseId={warehouseId}
        onCancel={() => setIsCreateOpen(false)}
        onSuccess={() => {
          setIsCreateOpen(false);
          setChecklistPage(1);
          void refetchChecklist();
        }}
      />

      <StocktakeRecordCountModal
        open={recordTarget != null}
        record={recordTarget}
        onCancel={() => setRecordTarget(null)}
        onSuccess={() => setRecordTarget(null)}
      />
    </div>
  );
}
