import { Form, Select } from "antd";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { tQrTabletInbound } from "@/i18n/qrTabletInbound.vi";
import type { LocationImportContext } from "@/pages/qrtablet/packer/importMappers";

type StaffOption = { value: string; label: string };

type PackerLocationImportModalProps = {
  open: boolean;
  locationContext: LocationImportContext | null;
  packingUser: string | undefined;
  onPackingUserChange: (value: string | undefined) => void;
  staffOptions: StaffOption[];
  staffLoading: boolean;
  staffError: boolean;
  isStaffSelected: (value: string | undefined) => boolean;
  confirming: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function PackerLocationImportModal({
  open,
  locationContext,
  packingUser,
  onPackingUserChange,
  staffOptions,
  staffLoading,
  staffError,
  isStaffSelected,
  confirming,
  onConfirm,
  onCancel,
}: PackerLocationImportModalProps) {
  const locationLabel =
    locationContext?.location_name?.trim() ||
    (locationContext?.location_id
      ? String(locationContext.location_id)
      : "—");

  return (
    <Modal
      title={tQrTabletInbound("packerLocationImportTitle")}
      open={open}
      onCancel={onCancel}
      footer={null}
      centered
      width={480}
      destroyOnHidden
    >
      <Form layout="vertical" className="pt-2">
        <Form.Item label={tQrTabletInbound("scanLocationTitle")}>
          <p className="text-lg font-semibold text-brand-dark">{locationLabel}</p>
        </Form.Item>
        <Form.Item label={tQrTabletInbound("labelPacking")} required>
          <Select
            className="w-full"
            allowClear
            showSearch
            optionFilterProp="label"
            loading={staffLoading}
            placeholder={
              staffError
                ? tQrTabletInbound("staffLoadError")
                : tQrTabletInbound("staffSearchPlaceholder")
            }
            value={isStaffSelected(packingUser) ? packingUser : undefined}
            options={staffOptions}
            listHeight={280}
            getPopupContainer={(node) => node.parentElement ?? document.body}
            notFoundContent={
              staffLoading
                ? tQrTabletInbound("staffLoading")
                : staffError
                  ? tQrTabletInbound("staffListError")
                  : tQrTabletInbound("staffNotFound")
            }
            onChange={(val) =>
              onPackingUserChange(typeof val === "string" ? val : undefined)
            }
          />
        </Form.Item>
        <Button
          variant="primary"
          className="!h-12 w-full !text-lg"
          loading={confirming}
          disabled={!isStaffSelected(packingUser)}
          onClick={onConfirm}
        >
          {tQrTabletInbound("packerConfirmUserButton")}
        </Button>
      </Form>
    </Modal>
  );
}
