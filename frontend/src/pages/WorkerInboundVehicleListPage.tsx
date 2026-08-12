import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui";
import { ArrowLeftOutlined } from "@ant-design/icons";

/** Worker inbound — temporarily disabled while admin inbound migrates to new API. */
export default function WorkerInboundVehicleListPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-[100dvh] bg-stripe-canvas-soft flex flex-col items-center justify-center p-6 text-center">
      <h1 className="text-2xl font-extrabold text-stripe-ink mb-2">NHẬP KHO (Worker)</h1>
      <p className="text-stripe-ink-mute text-lg mb-6 max-w-md">
        API đang được migrate. Màn hình công nhân sẽ cập nhật sau.
      </p>
      <Button variant="secondary" icon={<ArrowLeftOutlined />} onClick={() => navigate("/import")}>
        Về trang nhập kho
      </Button>
    </div>
  );
}
