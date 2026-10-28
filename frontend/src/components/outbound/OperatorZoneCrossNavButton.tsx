import { MonitorOutlined, SendOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { Button, cn } from "@/components/ui";
import {
  isOutboundDetailZoneId,
  operatorExportZonePath,
  operatorMonitorZonePath,
  OUTBOUND_DISPLAY_ZONES,
} from "@/constants/outboundMapZones";

type OperatorZoneCrossNavTarget = "monitor" | "export";

type Props = {
  target: OperatorZoneCrossNavTarget;
  displayZoneId: number;
  className?: string;
};

export default function OperatorZoneCrossNavButton({
  target,
  displayZoneId,
  className,
}: Props) {
  const navigate = useNavigate();
  const zoneMeta = OUTBOUND_DISPLAY_ZONES.find((z) => z.id === displayZoneId);
  const zoneName = zoneMeta?.name ?? "khu chia chọn";

  const disabled = !isOutboundDetailZoneId(displayZoneId);

  const label = target === "monitor" ? "Monitor" : "Xuất kho";

  const ariaLabel =
    target === "monitor"
      ? `Chuyển sang Monitor — ${zoneName}`
      : `Chuyển sang xuất kho — ${zoneName}`;

  const icon =
    target === "monitor" ? (
      <MonitorOutlined />
    ) : (
      <SendOutlined />
    );

  const handleClick = () => {
    if (disabled) return;
    const path =
      target === "monitor"
        ? operatorMonitorZonePath(displayZoneId)
        : operatorExportZonePath(displayZoneId);
    navigate(path);
  };

  return (
    <Button
      variant="secondary"
      icon={icon}
      disabled={disabled}
      onClick={handleClick}
      aria-label={ariaLabel}
      title={ariaLabel}
      className={cn("!h-10 !px-4 !text-base", className)}
    >
      {label}
    </Button>
  );
}
