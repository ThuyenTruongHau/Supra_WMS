import { DownOutlined, RobotOutlined } from "@ant-design/icons";
import { Dropdown } from "antd";
import { Button } from "@/components/ui";
import { operatorPopupContainer } from "@/components/layout/operatorStage";
import { INBOUND_ROBOTS, type InboundRobot } from "@/utils/robotStatus";

type AssignedRobotCallButtonProps = {
  disabled: boolean;
  loading: boolean;
  onSelect: (robot: InboundRobot) => void;
};

export default function AssignedRobotCallButton({
  disabled,
  loading,
  onSelect,
}: AssignedRobotCallButtonProps) {
  return (
    <Dropdown
      trigger={["click"]}
      disabled={disabled || loading}
      getPopupContainer={operatorPopupContainer}
      menu={{
        items: INBOUND_ROBOTS.map((robot) => ({
          key: robot.deviceCode,
          label: robot.name,
          icon: <RobotOutlined />,
        })),
        onClick: ({ key }) => {
          const robot = INBOUND_ROBOTS.find((item) => item.deviceCode === key);
          if (robot) onSelect(robot);
        },
      }}
    >
      <Button
        variant="secondary"
        icon={<RobotOutlined />}
        disabled={disabled || loading}
        loading={loading}
        className="col-span-2 !h-10 !w-full justify-center !text-sm"
      >
        Gọi robot <DownOutlined />
      </Button>
    </Dropdown>
  );
}
