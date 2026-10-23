import { DownOutlined, RobotOutlined } from "@ant-design/icons";
import { Dropdown } from "antd";
import { Button, cn } from "@/components/ui";
import { operatorPopupContainer } from "@/components/layout/operatorStage";
import { INBOUND_ROBOTS, type InboundRobot } from "@/utils/robotStatus";
import {
  isOperatorTabletViewport,
  operatorInboundFooterButtonClass,
  operatorRobotPickerItemIconClass,
  operatorRobotPickerItemLabelClass,
  operatorRobotPickerMenuClass,
  useOperatorViewportTier,
} from "@/utils/operatorViewportTier";

type AssignedRobotCallButtonProps = {
  disabled: boolean;
  disabledTitle?: string;
  loading: boolean;
  onSelect: (robot: InboundRobot) => void;
};

export default function AssignedRobotCallButton({
  disabled,
  disabledTitle,
  loading,
  onSelect,
}: AssignedRobotCallButtonProps) {
  const tier = useOperatorViewportTier();
  const menuClass = operatorRobotPickerMenuClass(tier);
  const labelClass = operatorRobotPickerItemLabelClass(tier);
  const iconClass = operatorRobotPickerItemIconClass(tier);

  return (
    <Dropdown
      trigger={["click"]}
      disabled={disabled || loading}
      getPopupContainer={operatorPopupContainer}
      overlayClassName={menuClass}
      menu={{
        className: menuClass,
        items: INBOUND_ROBOTS.map((robot) => ({
          key: robot.deviceCode,
          label: <span className={labelClass}>{robot.name}</span>,
          icon: <RobotOutlined className={iconClass} />,
        })),
        onClick: ({ key }) => {
          const robot = INBOUND_ROBOTS.find((item) => item.deviceCode === key);
          if (robot) onSelect(robot);
        },
      }}
      placement="top"
      overlayStyle={{
        minWidth: isOperatorTabletViewport(tier) ? 420 : 320,
      }}
    >
      <Button
        variant="secondary"
        icon={<RobotOutlined />}
        disabled={disabled || loading}
        loading={loading}
        title={disabled && disabledTitle ? disabledTitle : undefined}
        className={cn("col-span-2", operatorInboundFooterButtonClass(tier))}
      >
        Gọi robot <DownOutlined />
      </Button>
    </Dropdown>
  );
}
