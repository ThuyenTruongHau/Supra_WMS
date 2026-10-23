import { useMemo, type CSSProperties } from "react";
import { Select, Spin } from "antd";
import { cn } from "@/components/ui";
import { operatorPopupContainer } from "@/components/layout/operatorStage";
import {
  staffUserSelectOptions,
  useStaffUsers,
} from "@/hooks/useStaffUsers";
import {
  operatorAssigneeSelectListHeight,
  operatorAssigneeSelectPopupClass,
  operatorAssigneeSelectTriggerClass,
  operatorAssigneeSelectTriggerHeightPx,
  type OperatorAssigneeSelectToolbar,
  useOperatorViewportTier,
} from "@/utils/operatorViewportTier";

type OperatorAssigneeSelectProps = {
  mode: "single" | "multiple";
  label: string;
  value: string | undefined | string[];
  onChange: (value: string | undefined | string[]) => void;
  /** `zone`: monitor (h-20/h-10). `inbound`: toolbar đơn nhập (h-12/h-10). */
  toolbar?: OperatorAssigneeSelectToolbar;
  disabled?: boolean;
  className?: string;
  selectClassName?: string;
};

export default function OperatorAssigneeSelect({
  mode,
  label,
  value,
  onChange,
  disabled,
  toolbar = "zone",
  className,
  selectClassName,
}: OperatorAssigneeSelectProps) {
  const tier = useOperatorViewportTier();
  const triggerClass = operatorAssigneeSelectTriggerClass(tier, toolbar);
  const popupClass = operatorAssigneeSelectPopupClass(tier);
  const listHeight = operatorAssigneeSelectListHeight(tier);
  const triggerHeightPx = operatorAssigneeSelectTriggerHeightPx(tier, toolbar);
  const rootStyle = useMemo((): CSSProperties => {
    const base: CSSProperties = {
      minHeight: triggerHeightPx,
      alignItems: "center",
    };
    if (mode === "single") {
      base.height = triggerHeightPx;
    }
    return base;
  }, [mode, triggerHeightPx]);

  const { data, isLoading, isError } = useStaffUsers();
  const options = useMemo(
    () => staffUserSelectOptions(data?.items),
    [data?.items],
  );

  return (
    <div className={cn("flex min-w-0 items-center", className)}>
      <Select
        showSearch
        allowClear
        mode={mode === "multiple" ? "multiple" : undefined}
        optionFilterProp="label"
        loading={isLoading}
        disabled={disabled || isError}
        placeholder={label}
        value={
          mode === "multiple"
            ? ((value as string[] | undefined)?.length
                ? (value as string[])
                : undefined)
            : (value as string | undefined)
        }
        onChange={(next) => {
          if (mode === "multiple") {
            onChange(Array.isArray(next) ? next : []);
            return;
          }
          onChange(typeof next === "string" ? next : undefined);
        }}
        options={options}
        maxTagCount="responsive"
        listHeight={listHeight}
        popupMatchSelectWidth={false}
        getPopupContainer={operatorPopupContainer}
        popupClassName={popupClass}
        styles={{ root: rootStyle }}
        notFoundContent={
          isLoading ? <Spin size="small" /> : "Không có nhân viên"
        }
        className={cn(triggerClass, selectClassName)}
      />
    </div>
  );
}
