// frontend/src/components/ui/Select.tsx
import { forwardRef } from "react";
import {
  Select as AntSelect,
  type SelectProps as AntSelectProps,
  type RefSelectProps,
} from "antd";
import { cn } from "./utils/cn";

const selectClassName =
  "[&_.ant-select-selector]:!h-11 [&_.ant-select-selector]:!rounded-lg " +
  "[&_.ant-select-selector]:!items-center hover:[&_.ant-select-selector]:!border-brand-primary " +
  "focus-within:[&_.ant-select-selector]:!border-brand-primary " +
  "focus-within:[&_.ant-select-selector]:!shadow-[0_0_0_2px_rgba(58,166,166,0.15)]";

export type SelectProps = AntSelectProps;

const SelectBase = forwardRef<RefSelectProps, SelectProps>(
  ({ className, ...props }, ref) => {
    return (
      <AntSelect
        ref={ref}
        className={cn("w-full", selectClassName, className)}
        {...props}
      />
    );
  },
);

SelectBase.displayName = "Select";

type SelectComponent = typeof SelectBase & {
  Option: typeof AntSelect.Option;
};

export const Select = SelectBase as SelectComponent;
Select.Option = AntSelect.Option;

export type { RefSelectProps };
