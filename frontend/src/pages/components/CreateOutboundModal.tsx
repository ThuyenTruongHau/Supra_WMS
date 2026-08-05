import { useEffect, useRef, useState } from "react";
import {
  Steps,
  DatePicker,
  InputNumber,
  Divider,
  Space,
  Tag,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  Modal,
  Form,
  Input,
  Button,
  Table,
  message,
} from "@/components/ui";
import { PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import { SkuSearchSelect } from "@/components/shared/SkuSearchSelect";
import { useAppStore } from "@/store/useAppStore";
import {
  useCreateOutboundOrder,
  useSuggestOutboundAllocations,
  useCreateBypassRequests,
  useConfirmOutboundAllocations,
  useDeleteOutboundOrder,
} from "@/hooks/useOutbound";
import type {
  OutboundBypassRequest,
  OutboundOrderCreateInput,
  OutboundShortage,
  OutboundWorkflowAllocation,
  OutboundWorkflowOut,
} from "@/types/outbound";
import type { ApiErrorResponse } from "@/types/apiError";
import { AxiosError } from "axios";
import dayjs from "dayjs";

interface CreateOutboundModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  /** Parsed Excel payload to prefill Step 1 (declaration). Draft is created on Tiếp tục. */
  importDraft?: OutboundOrderCreateInput | null;
}

const CREATE_STEPS = [
  { title: "Khai báo đơn xuất" },
  { title: "Gợi ý phân bổ" },
  { title: "Preview lệnh" },
  { title: "Xác nhận" },
];

const defaultShipment = () => ({
  customer_name: "",
  vehicle_number: undefined,
  trip: undefined,
  carrier_name: undefined,
  requested_date: dayjs(),
  notes: undefined,
  details: [{ sku: "", requested_quantity: 1, notes: undefined }],
});

/** Keeps non-UI form values (e.g. picking_condition) registered with Ant Form. */
function HiddenFormValue(_props: {
  value?: unknown;
  onChange?: (value: unknown) => void;
}) {
  return null;
}

const suggestionColumns: ColumnsType<OutboundWorkflowAllocation> = [
  {
    title: "Khách hàng",
    dataIndex: "customer_name",
    key: "customer_name",
    render: (name: string) => (
      <span className="font-medium text-brand-dark">{name}</span>
    ),
  },
  {
    title: "SKU",
    key: "sku",
    render: (_, row) => (
      <span className="font-semibold text-brand-primary">{row.item.sku}</span>
    ),
  },
  {
    title: "Sản phẩm",
    key: "name",
    render: (_, row) => row.item.name,
  },
  {
    title: "Vị trí",
    key: "location",
    render: (_, row) => row.source_location.location_code,
  },
  {
    title: "Lot",
    key: "lot",
    render: (_, row) =>
      row.item_stock.lot_number || <span className="text-gray-400">—</span>,
  },
  {
    title: "HSD",
    key: "expiry",
    render: (_, row) =>
      row.item_stock.expiry_date
        ? dayjs(row.item_stock.expiry_date).format("DD/MM/YYYY")
        : <span className="text-gray-400">—</span>,
  },
  {
    title: "SL gợi ý",
    key: "planned",
    align: "right",
    render: (_, row) => (
      <span className="font-semibold text-brand-dark">
        {Number(row.planned_ship_quantity).toLocaleString("vi-VN")}{" "}
        {row.item.base_unit}
      </span>
    ),
  },
  {
    title: "Chiến lược",
    dataIndex: "strategy_used",
    key: "strategy_used",
    render: (v: string) => <Tag color="blue">{v}</Tag>,
  },
  {
    title: "Trạng thái",
    dataIndex: "status",
    key: "status",
    render: (v: string) => <Tag>{v}</Tag>,
  },
];

const shortageColumns: ColumnsType<OutboundShortage> = [
  {
    title: "Khách hàng",
    dataIndex: "customer_name",
    key: "customer_name",
  },
  {
    title: "SKU",
    key: "sku",
    render: (_, row) => row.item.sku,
  },
  {
    title: "Yêu cầu",
    key: "requested",
    align: "right",
    render: (_, row) => Number(row.requested_quantity).toLocaleString("vi-VN"),
  },
  {
    title: "Đã gợi ý",
    key: "allocated",
    align: "right",
    render: (_, row) => Number(row.allocated_quantity).toLocaleString("vi-VN"),
  },
  {
    title: "Thiếu",
    key: "shortage",
    align: "right",
    render: (_, row) => (
      <span className="font-semibold text-red-600">
        {Number(row.shortage_quantity).toLocaleString("vi-VN")}
      </span>
    ),
  },
];

const bypassColumns: ColumnsType<OutboundBypassRequest> = [
  {
    title: "Khách hàng",
    dataIndex: "customer_name",
    key: "customer_name",
  },
  {
    title: "SKU",
    key: "sku",
    render: (_, row) => row.item.sku,
  },
  {
    title: "SL cần bypass",
    key: "required",
    align: "right",
    render: (_, row) => Number(row.required_quantity).toLocaleString("vi-VN"),
  },
  {
    title: "Còn thiếu",
    key: "remaining",
    align: "right",
    render: (_, row) => Number(row.remaining_quantity).toLocaleString("vi-VN"),
  },
  {
    title: "Trạng thái",
    dataIndex: "status",
    key: "status",
    render: (v: string) => <Tag color="orange">{v}</Tag>,
  },
];

function apiErrorMessage(err: unknown, fallback: string) {
  if (err instanceof AxiosError) {
    const detail = (err as AxiosError<ApiErrorResponse>).response?.data?.detail;
    if (typeof detail === "string") return detail;
  }
  return fallback;
}

export default function CreateOutboundModal({
  open,
  onClose,
  onSuccess,
  importDraft = null,
}: CreateOutboundModalProps) {
  const [form] = Form.useForm();
  const [currentStep, setCurrentStep] = useState(0);
  const [createdOrderCode, setCreatedOrderCode] = useState<string | null>(null);
  const [suggestPreview, setSuggestPreview] =
    useState<OutboundWorkflowOut | null>(null);
  const [bypassRequests, setBypassRequests] = useState<OutboundBypassRequest[]>(
    [],
  );
  const bootstrappedDraftRef = useRef<OutboundOrderCreateInput | null>(null);

  const createMutation = useCreateOutboundOrder();
  const suggestMutation = useSuggestOutboundAllocations();
  const bypassMutation = useCreateBypassRequests();
  const confirmMutation = useConfirmOutboundAllocations();
  const deleteMutation = useDeleteOutboundOrder();
  const { selectedWarehouseId } = useAppStore();

  const isBusy =
    createMutation.isPending ||
    suggestMutation.isPending ||
    bypassMutation.isPending ||
    confirmMutation.isPending ||
    deleteMutation.isPending;

  const applyImportDraft = (draft: OutboundOrderCreateInput) => {
    form.setFieldsValue({
      requested_date: draft.requested_date
        ? dayjs(draft.requested_date)
        : dayjs(),
      notes: draft.notes ?? undefined,
      shipments: draft.shipments.map((s) => ({
        customer_name: s.customer_name,
        vehicle_number: s.vehicle_number ?? undefined,
        trip: s.trip ?? undefined,
        carrier_name: s.carrier_name ?? undefined,
        requested_date: s.requested_date
          ? dayjs(s.requested_date)
          : dayjs(),
        notes: s.notes ?? undefined,
        details: s.details.map((d) => ({
          sku: d.sku ?? "",
          item_id: d.item_id,
          item_pk: d.item_pk,
          requested_quantity: Number(d.requested_quantity),
          picking_condition: d.picking_condition ?? {},
          notes: d.notes ?? undefined,
        })),
      })),
    });
  };

  const resetForm = () => {
    setCurrentStep(0);
    setCreatedOrderCode(null);
    setSuggestPreview(null);
    setBypassRequests([]);
    bootstrappedDraftRef.current = null;
    form.setFieldsValue({
      requested_date: dayjs(),
      notes: undefined,
      shipments: [defaultShipment()],
    });
  };

  const closeAndRefresh = () => {
    resetForm();
    onSuccess?.();
    onClose();
  };

  const runSuggestForOrder = async (orderCode: string) => {
    message.loading({
      content: "Đang gợi ý phân bổ FEFO...",
      key: "outbound-next",
    });
    const workflow = await suggestMutation.mutateAsync(orderCode);
    setSuggestPreview(workflow);
    setCurrentStep(1);
    message.success({
      content: `Đã gợi ý ${workflow.allocations.length} phân bổ cho ${orderCode}`,
      key: "outbound-next",
    });
  };

  useEffect(() => {
    if (!open || !importDraft) return;
    if (bootstrappedDraftRef.current === importDraft) return;
    bootstrappedDraftRef.current = importDraft;
    setCurrentStep(0);
    setCreatedOrderCode(null);
    setSuggestPreview(null);
    setBypassRequests([]);
    applyImportDraft(importDraft);
  }, [open, importDraft]);

  /** Hủy đơn qua DELETE khi đã có orderCode (bước 3/4). Báo lỗi nếu BE từ chối. */
  const handleCancelWithDelete = async () => {
    if (!createdOrderCode) {
      onClose();
      return;
    }
    try {
      message.loading({ content: "Đang hủy đơn...", key: "outbound-cancel" });
      await deleteMutation.mutateAsync(createdOrderCode);
      message.success({ content: "Đã hủy đơn xuất", key: "outbound-cancel" });
      closeAndRefresh();
    } catch (err) {
      message.error({
        content: apiErrorMessage(err, "Hủy đơn thất bại"),
        key: "outbound-cancel",
      });
    }
  };

  const handleModalClose = () => {
    if (currentStep >= 2 && createdOrderCode) {
      void handleCancelWithDelete();
      return;
    }
    onClose();
  };

  const handleStep1Next = async () => {
    if (!selectedWarehouseId) {
      message.error("Vui lòng chọn kho trước khi tạo đơn xuất");
      return;
    }

    try {
      let orderCode = createdOrderCode;

      if (!orderCode) {
        const values = await form.validateFields();
        const payload: OutboundOrderCreateInput = {
          zone_id: selectedWarehouseId,
          requested_date: values.requested_date?.format("YYYY-MM-DD") ?? null,
          notes: values.notes || null,
          shipments: values.shipments.map((s: any) => ({
            customer_name: s.customer_name.trim(),
            vehicle_number: s.vehicle_number?.trim() || null,
            trip: s.trip?.trim() || null,
            carrier_name: s.carrier_name?.trim() || null,
            requested_date: s.requested_date?.format("YYYY-MM-DD") ?? null,
            notes: s.notes || null,
            details: s.details.map((d: any) => ({
              sku: d.sku?.trim() || undefined,
              item_id: d.item_id?.trim() || undefined,
              item_pk: d.item_pk || undefined,
              requested_quantity: d.requested_quantity,
              picking_condition: d.picking_condition || {},
              notes: d.notes || null,
            })),
          })),
        };

        message.loading({
          content: "Đang tạo đơn nháp...",
          key: "outbound-next",
        });
        const created = await createMutation.mutateAsync(payload);
        orderCode = created.order_code;
        setCreatedOrderCode(orderCode);
      }

      await runSuggestForOrder(orderCode!);
    } catch (err) {
      message.error({
        content: apiErrorMessage(err, "Không thể tạo đơn / gợi ý phân bổ"),
        key: "outbound-next",
      });
    }
  };

  const handleStep3Next = async () => {
    if (!createdOrderCode || !suggestPreview) return;

    try {
      const shortages = suggestPreview.shortages ?? [];
      if (shortages.length > 0) {
        message.loading({
          content: "Đang tạo bypass request...",
          key: "outbound-bypass",
        });
        const requests = await bypassMutation.mutateAsync({
          orderCode: createdOrderCode,
          data: {
            detail_ids: shortages.map((s) => s.outbound_order_detail_id),
          },
        });
        setBypassRequests(requests);
        message.success({
          content: `Đã tạo ${requests.length} bypass request`,
          key: "outbound-bypass",
        });
      } else {
        setBypassRequests([]);
      }
      setCurrentStep(3);
    } catch (err) {
      message.error({
        content: apiErrorMessage(err, "Tạo bypass request thất bại"),
        key: "outbound-bypass",
      });
    }
  };

  const handleConfirm = async () => {
    if (!createdOrderCode) return;
    try {
      message.loading({
        content: "Đang xác nhận phân bổ...",
        key: "outbound-confirm",
      });
      await confirmMutation.mutateAsync(createdOrderCode);
      message.success({
        content: `Đã xác nhận đơn ${createdOrderCode}`,
        key: "outbound-confirm",
      });
      closeAndRefresh();
    } catch (err) {
      message.error({
        content: apiErrorMessage(err, "Xác nhận phân bổ thất bại"),
        key: "outbound-confirm",
      });
    }
  };

  const renderFooter = () => {
    const backTarget =
      currentStep === 1 ? 0 : currentStep === 2 ? 1 : currentStep === 3 ? 2 : 0;

    return (
      <div className="flex justify-between items-center w-full">
        {currentStep === 0 ? (
          <div />
        ) : (
          <Button
            variant="secondary"
            onClick={() => setCurrentStep(backTarget)}
            disabled={isBusy}
          >
            Quay lại
          </Button>
        )}

        <Space>
          <Button
            variant="secondary"
            onClick={
              currentStep >= 2 ? () => void handleCancelWithDelete() : onClose
            }
            disabled={isBusy}
          >
            Hủy
          </Button>

          {currentStep === 0 && (
            <Button
              variant="primary"
              loading={createMutation.isPending || suggestMutation.isPending}
              onClick={handleStep1Next}
            >
              Tiếp tục
            </Button>
          )}
          {currentStep === 1 && (
            <Button
              variant="primary"
              disabled={!suggestPreview}
              loading={suggestMutation.isPending}
              onClick={() => setCurrentStep(2)}
            >
              Tiếp tục
            </Button>
          )}
          {currentStep === 2 && (
            <Button
              variant="primary"
              loading={bypassMutation.isPending}
              onClick={handleStep3Next}
            >
              Tiếp tục
            </Button>
          )}
          {currentStep === 3 && (
            <Button
              variant="primary"
              loading={confirmMutation.isPending}
              onClick={handleConfirm}
            >
              Confirm
            </Button>
          )}
        </Space>
      </div>
    );
  };

  return (
    <Modal
      title={
        <span className="text-xl font-bold text-brand-dark">
          {importDraft
            ? "Tạo phiếu xuất từ Excel"
            : "Tạo Phiếu Xuất Kho Mới"}
        </span>
      }
      open={open}
      onCancel={handleModalClose}
      width={900}
      centered
      afterOpenChange={(v) => {
        if (!v) {
          resetForm();
          return;
        }
        if (importDraft) {
          applyImportDraft(importDraft);
          bootstrappedDraftRef.current = importDraft;
          setCurrentStep(0);
          setCreatedOrderCode(null);
          setSuggestPreview(null);
          setBypassRequests([]);
        } else {
          resetForm();
        }
      }}
      footer={renderFooter()}
    >
      <Steps
        current={currentStep}
        labelPlacement="vertical"
        className="mb-8 mt-4"
        items={CREATE_STEPS}
      />

      {currentStep === 0 && (
        <Form form={form} layout="vertical" className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Form.Item
              name="requested_date"
              label="Ngày yêu cầu"
              rules={[{ required: true, message: "Chọn ngày" }]}
              className="!mb-0"
            >
              <DatePicker
                className="w-full"
                format="DD/MM/YYYY"
                disabledDate={(d) => d.isBefore(dayjs(), "day")}
              />
            </Form.Item>
            <Form.Item name="notes" label="Ghi chú đơn" className="!mb-0">
              <Input.TextArea
                rows={1}
                placeholder="Nhập ghi chú cho đơn xuất này..."
              />
            </Form.Item>
          </div>

          <Divider
            titlePlacement="left"
            className="!text-sm text-slate-400 !mt-2 !mb-4"
          >
            DANH SÁCH KHÁCH HÀNG
          </Divider>

          <Form.List name="shipments">
            {(shipmentFields, { add: addShipment, remove: removeShipment }) => (
              <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-2">
                {shipmentFields.map((shipmentField) => (
                  <div
                    key={shipmentField.key}
                    className="p-4 bg-slate-50 border border-stripe-hairline rounded-lg relative"
                  >
                    {shipmentFields.length > 1 && (
                      <Button
                        variant="dangerText"
                        icon={<DeleteOutlined />}
                        className="!absolute top-2 right-2 z-10"
                        onClick={() => removeShipment(shipmentField.name)}
                      />
                    )}

                    <p className="mb-3 text-sm font-semibold text-brand-dark">
                      Khách hàng #{shipmentField.name + 1}
                    </p>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 mb-3">
                      <Form.Item
                        name={[shipmentField.name, "customer_name"]}
                        label="Tên khách hàng"
                        rules={[
                          { required: true, message: "Nhập tên khách" },
                        ]}
                        className="!mb-0"
                      >
                        <Input placeholder="VD: Công ty A" />
                      </Form.Item>
                      <Form.Item
                        name={[shipmentField.name, "requested_date"]}
                        label="Ngày yêu cầu (shipment)"
                        className="!mb-0"
                      >
                        <DatePicker
                          className="w-full"
                          format="DD/MM/YYYY"
                          disabledDate={(d) => d.isBefore(dayjs(), "day")}
                        />
                      </Form.Item>
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3 mb-3">
                      <Form.Item
                        name={[shipmentField.name, "vehicle_number"]}
                        label="Số xe"
                        className="!mb-0"
                      >
                        <Input placeholder="VD: 51C-123.45" />
                      </Form.Item>
                      <Form.Item
                        name={[shipmentField.name, "trip"]}
                        label="Trip"
                        className="!mb-0"
                      >
                        <Input placeholder="VD: Trip 01" />
                      </Form.Item>
                      <Form.Item
                        name={[shipmentField.name, "carrier_name"]}
                        label="Nhà vận tải"
                        className="!mb-0"
                      >
                        <Input placeholder="VD: Công ty vận tải XYZ" />
                      </Form.Item>
                    </div>

                    <Form.Item
                      name={[shipmentField.name, "notes"]}
                      label="Ghi chú khách"
                      className="!mb-3"
                    >
                      <Input.TextArea
                        rows={1}
                        placeholder="Ghi chú (tuỳ chọn)"
                      />
                    </Form.Item>

                    <div className="space-y-2 pl-4 border-l-2 border-brand-primary/20">
                      <Form.List name={[shipmentField.name, "details"]}>
                        {(
                          detailFields,
                          { add: addDetail, remove: removeDetail },
                        ) => (
                          <>
                            {detailFields.map((detailField) => (
                              <div
                                key={detailField.key}
                                className="grid grid-cols-12 gap-2 items-start"
                              >
                                <Form.Item
                                  name={[detailField.name, "sku"]}
                                  label="SKU"
                                  rules={[
                                    { required: true, message: "Chọn SKU" },
                                  ]}
                                  className="col-span-5 !mb-0 min-w-0"
                                >
                                  <SkuSearchSelect
                                    warehouseId={selectedWarehouseId || 0}
                                  />
                                </Form.Item>
                                <Form.Item
                                  name={[detailField.name, "picking_condition"]}
                                  hidden
                                >
                                  <HiddenFormValue />
                                </Form.Item>
                                <Form.Item
                                  name={[
                                    detailField.name,
                                    "requested_quantity",
                                  ]}
                                  label="Số lượng"
                                  rules={[
                                    { required: true, message: "Nhập SL" },
                                  ]}
                                  className="col-span-3 !mb-0"
                                >
                                  <InputNumber
                                    min={0.001}
                                    className="!w-full !h-11 [&_.ant-input-number-input]:!h-11"
                                  />
                                </Form.Item>
                                <Form.Item
                                  name={[detailField.name, "notes"]}
                                  label="Ghi chú"
                                  className="col-span-3 !mb-0"
                                >
                                  <Input placeholder="Ghi chú dòng" />
                                </Form.Item>
                                <div className="col-span-1 flex items-end pb-1">
                                  {detailFields.length > 1 && (
                                    <Button
                                      variant="dangerText"
                                      icon={<DeleteOutlined />}
                                      onClick={() =>
                                        removeDetail(detailField.name)
                                      }
                                    />
                                  )}
                                </div>
                              </div>
                            ))}

                            <Button
                              variant="secondary"
                              icon={<PlusOutlined />}
                              className="w-full mt-2"
                              onClick={() =>
                                addDetail({ requested_quantity: 1 })
                              }
                              block
                            >
                              Thêm sản phẩm cùng khách
                            </Button>
                          </>
                        )}
                      </Form.List>
                    </div>
                  </div>
                ))}

                <Button
                  variant="secondary"
                  icon={<PlusOutlined />}
                  className="w-full h-12"
                  onClick={() => addShipment(defaultShipment())}
                  block
                >
                  Thêm khách hàng
                </Button>
              </div>
            )}
          </Form.List>
        </Form>
      )}

      {currentStep === 1 && suggestPreview && (
        <div className="space-y-4 max-h-[50vh] overflow-y-auto">
          <div className="mb-1 flex items-center gap-2 text-sm text-slate-500">
            <span>
              Lệnh gợi ý phân bổ cho đơn{" "}
              <span className="font-semibold text-brand-dark">
                {suggestPreview.order_code}
              </span>
            </span>
          </div>

          <div className="flex flex-wrap gap-3 text-sm text-slate-500">
            <span>
              Yêu cầu:{" "}
              <strong className="text-brand-dark">
                {Number(suggestPreview.requested_quantity).toLocaleString(
                  "vi-VN",
                )}
              </strong>
            </span>
            <span>
              Gợi ý xuất:{" "}
              <strong className="text-brand-dark">
                {Number(suggestPreview.planned_ship_quantity).toLocaleString(
                  "vi-VN",
                )}
              </strong>
            </span>
            <span>
              Phân bổ:{" "}
              <strong className="text-brand-dark">
                {suggestPreview.allocations.length}
              </strong>
            </span>
          </div>

          <Table
            columns={suggestionColumns}
            dataSource={suggestPreview.allocations}
            rowKey="id"
            pagination={false}
            className="[&_.ant-table-thead_th]:!bg-slate-50 [&_.ant-table-thead_th]:!text-slate-600 [&_.ant-table-thead_th]:!font-semibold"
          />

          {suggestPreview.shortages.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-amber-700">
                Thiếu hàng FEFO ({suggestPreview.shortages.length}) — cần bypass
                trước khi Confirm
              </p>
              <Table
                columns={shortageColumns}
                dataSource={suggestPreview.shortages}
                rowKey="outbound_order_detail_id"
                pagination={false}
                size="small"
                className="[&_.ant-table-thead_th]:!bg-amber-50 [&_.ant-table-thead_th]:!text-amber-800"
              />
            </div>
          )}
        </div>
      )}

      {currentStep === 2 && suggestPreview && (
        <div className="space-y-4 max-h-[50vh] overflow-y-auto">
          <div className="bg-slate-50 p-3 rounded-lg border border-stripe-hairline text-sm text-brand-dark">
            Preview lệnh cho đơn <strong>{suggestPreview.order_code}</strong>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-brand-dark">
              Lệnh xuất thường ({suggestPreview.allocations.length})
            </p>
            <Table
              columns={suggestionColumns}
              dataSource={suggestPreview.allocations}
              rowKey="id"
              pagination={false}
              size="small"
              className="border border-stripe-hairline rounded-lg"
            />
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-brand-dark">
              Bypass / thiếu hàng ({suggestPreview.shortages.length})
            </p>
            {suggestPreview.shortages.length === 0 ? (
              <p className="text-sm text-slate-500">Không cần bypass.</p>
            ) : (
              <Table
                columns={shortageColumns}
                dataSource={suggestPreview.shortages}
                rowKey="outbound_order_detail_id"
                pagination={false}
                size="small"
                className="border border-red-100 rounded-lg"
              />
            )}
          </div>
        </div>
      )}

      {currentStep === 3 && suggestPreview && (
        <div className="space-y-4 max-h-[50vh] overflow-y-auto">
          <div className="bg-brand-primary/10 p-3 rounded-lg border border-brand-primary/20 text-sm text-brand-dark">
            Xác nhận đơn <strong>{suggestPreview.order_code}</strong> —{" "}
            {suggestPreview.allocations.length} lệnh thường
            {bypassRequests.length > 0
              ? `, ${bypassRequests.length} bypass request`
              : ""}
            .
          </div>

          <Table
            columns={suggestionColumns}
            dataSource={suggestPreview.allocations}
            rowKey="id"
            pagination={false}
            size="small"
            className="border border-stripe-hairline rounded-lg"
          />

          {bypassRequests.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-orange-600">
                Bypass requests đã tạo
              </p>
              <Table
                columns={bypassColumns}
                dataSource={bypassRequests}
                rowKey="id"
                pagination={false}
                size="small"
                className="border border-orange-100 rounded-lg"
              />
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
