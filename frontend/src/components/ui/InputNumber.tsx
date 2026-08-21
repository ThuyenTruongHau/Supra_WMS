import { forwardRef } from "react";
import {
  InputNumber as AntInputNumber,
  type InputNumberProps as AntInputNumberProps,
  type InputNumberRef,
} from "antd";
import { cn } from "./utils/cn";

const inputNumberClassName =
  "!w-full [&_.ant-input-number-input]:!h-[42px] !rounded-lg hover:!border-brand-primary " +
  "focus-within:!border-brand-primary focus-within:!shadow-[0_0_0_2px_rgba(58,166,166,0.15)]";

export type InputNumberProps = AntInputNumberProps;

export const InputNumber = forwardRef<InputNumberRef, InputNumberProps>(
  ({ className, ...props }, ref) => {
    return (
      <AntInputNumber
        ref={ref}
        className={cn(inputNumberClassName, className)}
        {...props}
      />
    );
  },
);

InputNumber.displayName = "InputNumber";

export type { InputNumberRef };
