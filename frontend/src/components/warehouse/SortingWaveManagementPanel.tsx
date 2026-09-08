import { useMemo, useState } from "react";
import type { ColumnsType } from "antd/es/table";
import {
  PlusOutlined,
  SearchOutlined,
  EditOutlined,
  DeleteOutlined,
  EnvironmentOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { useQuery } from "@tanstack/react-query";
import {
  Button,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  message,
} from "@/components/ui";
import {
  useCreateSortingWave,
  useDeleteSortingWave,
  useSortingWaves,
  useUpdateSortingWave,
} from "@/hooks/useSortingWave";
import {
  getInboundBufferPointsApi,
  type MapLocationType,
} from "@/api/warehouseMap";
import InboundBufferMapCanvas from "@/components/inbound/InboundBufferMapCanvas";
import type { SortingWave } from "@/types/sortingWave";

const PAGE_SIZE = 20;

type StationField = "outbound_stations" | "sorting_stations";

type SortingWaveFormValues = {
  name: string;
  outbound_stations: number[];
  sorting_stations: number[];
};

type SortingWaveManagementPanelProps = {
  zoneId: number;
};

const FIELD_META: Record<
  StationField,
  { label: string; locationType: MapLocationType }
> = {
  outbound_stations: {
    label: "Outbound stations",
    locationType: "outbound_station",
  },
  sorting_stations: {
    label: "Sorting stations",
    locationType: "sorting_station",
  },
};

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  return dayjs(value).format("DD/MM/YYYY HH:mm");
}

function formatStationCodes(
  ids: number[] | undefined,
  codeById: Map<number, string>,
): string {
  if (!ids || ids.length === 0) return "—";
  return ids.map((id) => codeById.get(id) ?? `#${id}`).join(", ");
}

export default function SortingWaveManagementPanel({
  zoneId,
}: SortingWaveManagementPanelProps) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [mapField, setMapField] = useState<StationField | null>(null);
  const [editingWave, setEditingWave] = useState<SortingWave | null>(null);
  const [form] = Form.useForm<SortingWaveFormValues>();

  const outboundSelected = Form.useWatch("outbound_stations", form) ?? [];
  const sortingSelected = Form.useWatch("sorting_stations", form) ?? [];

  const trimmedSearch = search.trim();
  const { data: waves = [], isLoading } = useSortingWaves(zoneId, {
    search: trimmedSearch || undefined,
  });

  const { data: outboundPoints } = useQuery({
    queryKey: ["station_points", zoneId, "outbound_station"],
    queryFn: () => getInboundBufferPointsApi(zoneId, "outbound_station"),
    enabled: zoneId > 0,
    staleTime: 60_000,
  });
  const { data: sortingPoints } = useQuery({
    queryKey: ["station_points", zoneId, "sorting_station"],
    queryFn: () => getInboundBufferPointsApi(zoneId, "sorting_station"),
    enabled: zoneId > 0,
    staleTime: 60_000,
  });

  const createMutation = useCreateSortingWave();
  const updateMutation = useUpdateSortingWave();
  const deleteMutation = useDeleteSortingWave();

  const outboundOptions = useMemo(
    () =>
      (outboundPoints?.points ?? []).map((p) => ({
        value: p.id,
        label: p.location_code,
      })),
    [outboundPoints],
  );

  const sortingOptions = useMemo(
    () =>
      (sortingPoints?.points ?? []).map((p) => ({
        value: p.id,
        label: p.location_code,
      })),
    [sortingPoints],
  );

  const codeById = useMemo(() => {
    const map = new Map<number, string>();
    for (const opt of [...outboundOptions, ...sortingOptions]) {
      map.set(opt.value, opt.label);
    }
    return map;
  }, [outboundOptions, sortingOptions]);

  const idByCode = useMemo(() => {
    const map = new Map<string, number>();
    for (const opt of [...outboundOptions, ...sortingOptions]) {
      map.set(opt.label, opt.value);
    }
    return map;
  }, [outboundOptions, sortingOptions]);

  const filteredData = useMemo(() => {
    const keyword = trimmedSearch.toLowerCase();
    if (!keyword) return waves;
    return waves.filter(
      (item) =>
        item.name.toLowerCase().includes(keyword) ||
        (item.zone_name ?? "").toLowerCase().includes(keyword) ||
        (item.created_by_name ?? "").toLowerCase().includes(keyword),
    );
  }, [waves, trimmedSearch]);

  const mapSelectedIds =
    mapField === "outbound_stations"
      ? outboundSelected
      : mapField === "sorting_stations"
        ? sortingSelected
        : [];

  const mapSelectedCodes = useMemo(
    () =>
      mapSelectedIds
        .map((id) => codeById.get(id))
        .filter((code): code is string => Boolean(code)),
    [mapSelectedIds, codeById],
  );

  const handleOpenCreate = () => {
    setEditingWave(null);
    form.resetFields();
    form.setFieldsValue({
      outbound_stations: [],
      sorting_stations: [],
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (record: SortingWave) => {
    setEditingWave(record);
    form.setFieldsValue({
      name: record.name,
      outbound_stations: record.outbound_stations ?? [],
      sorting_stations: record.sorting_stations ?? [],
    });
    setIsModalOpen(true);
  };

  const handleSubmit = (values: SortingWaveFormValues) => {
    const payload = {
      name: values.name.trim(),
      outbound_stations: values.outbound_stations ?? [],
      sorting_stations: values.sorting_stations ?? [],
    };

    if (editingWave) {
      updateMutation.mutate(
        {
          id: editingWave.id,
          data: payload,
          zoneId,
        },
        {
          onSuccess: () => {
            message.success("Cập nhật wave thành công");
            setIsModalOpen(false);
            form.resetFields();
            setEditingWave(null);
          },
          onError: (err) => {
            message.error(
              err.response?.data?.detail ?? "Không thể cập nhật wave",
            );
          },
        },
      );
      return;
    }

    createMutation.mutate(
      {
        zone_id: zoneId,
        ...payload,
      },
      {
        onSuccess: () => {
          message.success("Thêm wave thành công");
          setIsModalOpen(false);
          form.resetFields();
          setPage(1);
        },
        onError: (err) => {
          message.error(err.response?.data?.detail ?? "Không thể thêm wave");
        },
      },
    );
  };

  const handleDelete = (record: SortingWave) => {
    Modal.confirm({
      title: "Xóa wave chia chọn",
      content: `Bạn có chắc muốn xóa wave "${record.name}"?`,
      okText: "Xóa",
      okType: "danger",
      cancelText: "Hủy",
      onOk: () =>
        deleteMutation.mutateAsync(
          {
            id: record.id,
            zoneId,
          },
          {
            onSuccess: () => message.success("Đã xóa wave"),
            onError: (err) => {
              message.error(err.response?.data?.detail ?? "Không thể xóa wave");
            },
          },
        ),
    });
  };

  const toggleMapStation = (locationCode: string) => {
    if (!mapField) return;
    const locationId = idByCode.get(locationCode);
    if (!locationId) {
      message.warning(
        `Mã ${locationCode} không thuộc danh sách ${FIELD_META[mapField].label} của zone.`,
      );
      return;
    }

    const current =
      (form.getFieldValue(mapField) as number[] | undefined) ?? [];
    const exists = current.includes(locationId);
    const next = exists
      ? current.filter((id) => id !== locationId)
      : [...current, locationId];
    form.setFieldsValue({ [mapField]: next });
    message.success(
      exists ? `Đã bỏ chọn ${locationCode}` : `Đã thêm ${locationCode}`,
    );
  };

  const columns: ColumnsType<SortingWave> = [
    {
      title: "Tên wave",
      dataIndex: "name",
      key: "name",
      align: "center",
    },
    {
      title: "Zone",
      dataIndex: "zone_name",
      key: "zone_name",
      width: 160,
      align: "center",
      render: (value?: string | null, record?: SortingWave) =>
        value || (record ? `#${record.zone_id}` : "—"),
    },
    {
      title: "Outbound stations",
      dataIndex: "outbound_stations",
      key: "outbound_stations",
      align: "center",
      render: (ids: number[]) => formatStationCodes(ids, codeById),
    },
    {
      title: "Sorting stations",
      dataIndex: "sorting_stations",
      key: "sorting_stations",
      align: "center",
      render: (ids: number[]) => formatStationCodes(ids, codeById),
    },
    {
      title: "Người tạo",
      dataIndex: "created_by_name",
      key: "created_by_name",
      align: "center",
      render: (value?: string | null) => value || "—",
    },
    {
      title: "Ngày tạo",
      dataIndex: "created_at",
      key: "created_at",
      align: "center",
      render: (value: string) => formatDateTime(value),
    },
    {
      title: "Thao tác",
      key: "actions",
      width: 120,
      align: "center",
      render: (_, record) => (
        <Space size="small" className="justify-center">
          <Button
            variant="edit"
            icon={<EditOutlined />}
            onClick={() => handleOpenEdit(record)}
            disabled={zoneId <= 0}
          />
          <Button
            variant="dangerText"
            icon={<DeleteOutlined />}
            onClick={() => handleDelete(record)}
            disabled={zoneId <= 0}
          />
        </Space>
      ),
    },
  ];

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const mapMeta = mapField ? FIELD_META[mapField] : null;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stripe-hairline bg-white px-5 py-4">
        <div className="flex flex-wrap items-center gap-4">
          <h3 className="text-base font-semibold text-brand-dark whitespace-nowrap">
            Danh sách wave chia chọn
          </h3>
          <Input
            allowClear
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            prefix={<SearchOutlined className="text-gray-400" />}
            placeholder="Tìm theo tên wave..."
            className="!w-72"
            disabled={zoneId <= 0}
          />
        </div>
        <Button
          variant="primary"
          icon={<PlusOutlined />}
          onClick={handleOpenCreate}
          disabled={zoneId <= 0}
        >
          Thêm wave
        </Button>
      </div>

      {zoneId <= 0 ? (
        <div className="px-5 py-10 text-center text-sm text-gray-400">
          Vui lòng chọn kho để quản lý chia chọn
        </div>
      ) : (
        <Table<SortingWave>
          columns={columns}
          dataSource={filteredData}
          rowKey="id"
          loading={isLoading}
          pagination={{
            current: page,
            pageSize: PAGE_SIZE,
            total: filteredData.length,
            showSizeChanger: false,
            showTotal: (total, range) =>
              `Hiển thị ${range[0]}–${range[1]} / ${total} wave`,
            onChange: (nextPage) => setPage(nextPage),
          }}
          className="[&_.ant-table-thead_th]:!bg-slate-50 [&_.ant-table-thead_th]:!text-slate-600 [&_.ant-table-thead_th]:!font-semibold [&_.ant-table-row]:hover:bg-slate-50/50"
        />
      )}

      <Modal
        open={isModalOpen}
        onCancel={() => {
          setIsModalOpen(false);
          setEditingWave(null);
          setMapField(null);
          form.resetFields();
        }}
        footer={null}
        width={620}
        destroyOnHidden
        title={
          <span className="text-brand-dark font-semibold">
            {editingWave ? "Sửa wave chia chọn" : "Thêm wave chia chọn"}
          </span>
        }
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          className="mt-2"
        >
          <Form.Item
            name="name"
            label="Tên wave"
            rules={[{ required: true, message: "Vui lòng nhập tên wave" }]}
          >
            <Input placeholder="Nhập tên wave" maxLength={255} />
          </Form.Item>

          <Form.Item label="Outbound stations" required>
            <div className="flex gap-2">
              <Form.Item
                name="outbound_stations"
                noStyle
                rules={[
                  {
                    required: true,
                    type: "array",
                    min: 1,
                    message: "Chọn ít nhất 1 outbound station trong zone",
                  },
                ]}
              >
                <Select
                  mode="multiple"
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  placeholder="Chọn outbound station theo zone"
                  options={outboundOptions}
                  className="!w-full"
                />
              </Form.Item>
              <Button
                variant="primary"
                icon={<EnvironmentOutlined />}
                className="!shrink-0"
                onClick={() => setMapField("outbound_stations")}
              >
                Map
              </Button>
            </div>
          </Form.Item>

          <Form.Item label="Sorting stations" required>
            <div className="flex gap-2">
              <Form.Item
                name="sorting_stations"
                noStyle
                rules={[
                  {
                    required: true,
                    type: "array",
                    min: 1,
                    message: "Chọn ít nhất 1 sorting station trong zone",
                  },
                ]}
              >
                <Select
                  mode="multiple"
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  placeholder="Chọn sorting station theo zone"
                  options={sortingOptions}
                  className="!w-full"
                />
              </Form.Item>
              <Button
                variant="primary"
                icon={<EnvironmentOutlined />}
                className="!shrink-0"
                onClick={() => setMapField("sorting_stations")}
              >
                Map
              </Button>
            </div>
          </Form.Item>

          <p className="mb-3 text-xs text-slate-400">
            Station chỉ lấy trong zone kho đang chọn (zone_id = {zoneId}). Bấm
            Map để chọn trên layout.
          </p>
          <div className="flex justify-end gap-3 pt-2">
            <Button
              onClick={() => {
                setIsModalOpen(false);
                setEditingWave(null);
                setMapField(null);
                form.resetFields();
              }}
            >
              Hủy
            </Button>
            <Button
              variant="primary"
              htmlType="submit"
              loading={isSaving}
              disabled={zoneId <= 0}
            >
              {editingWave ? "Lưu" : "Thêm"}
            </Button>
          </div>
        </Form>
      </Modal>

      <Modal
        open={mapField != null}
        onCancel={() => setMapField(null)}
        footer={
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-slate-500">
              Đã chọn {mapSelectedIds.length} điểm
              {mapSelectedCodes.length > 0
                ? `: ${mapSelectedCodes.join(", ")}`
                : ""}
            </span>
            <Button variant="primary" onClick={() => setMapField(null)}>
              Xong
            </Button>
          </div>
        }
        width="90vw"
        style={{ top: 20 }}
        styles={{ body: { height: "75vh", padding: 0 } }}
        destroyOnHidden
        title={
          <span className="font-semibold text-brand-dark">
            Chọn {mapMeta?.label ?? "stations"} trên bản đồ
          </span>
        }
      >
        <div className="relative h-full w-full">
          <div className="absolute left-3 top-3 z-10 rounded-lg border border-stripe-hairline bg-white/95 px-3 py-2 text-xs text-slate-600 shadow-sm">
            Click ô để thêm/bỏ chọn · chỉ hiện điểm{" "}
            <span className="font-semibold text-brand-dark">
              {mapMeta?.locationType}
            </span>
          </div>
          {mapMeta && zoneId > 0 && (
            <InboundBufferMapCanvas
              zoneId={zoneId}
              locationType={mapMeta.locationType}
              className="!min-h-full h-full"
              selectedLocationCodes={mapSelectedCodes}
              onBufferCellClick={({ locationCode }) =>
                toggleMapStation(locationCode)
              }
            />
          )}
        </div>
      </Modal>
    </>
  );
}
