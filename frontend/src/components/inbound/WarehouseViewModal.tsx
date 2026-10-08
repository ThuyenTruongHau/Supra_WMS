import { Button, Modal } from "@/components/ui";
import WarehouseMapCanvas from "@/components/shared/WarehouseMapCanvas";

type WarehouseViewModalProps = {
  open: boolean;
  warehouseId: number;
  onClose: () => void;
};

export default function WarehouseViewModal({
  open,
  warehouseId,
  onClose,
}: WarehouseViewModalProps) {
  return (
    <Modal
      title="Xem kho"
      open={open}
      onCancel={onClose}
      width="90vw"
      getContainer={() => document.body}
      styles={{ body: { height: "calc(90vh - 120px)", padding: 0, overflow: "hidden" } }}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Đóng
        </Button>
      }
      keyboard
      destroyOnHidden
    >
      {open && warehouseId > 0 && (
        <WarehouseMapCanvas warehouseId={warehouseId} readOnly />
      )}
    </Modal>
  );
}
