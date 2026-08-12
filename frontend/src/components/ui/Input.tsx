import { forwardRef } from "react";
import {
  Input as AntInput,
  type InputProps as AntInputProps,
  type InputRef,
} from "antd";
import type {
  TextAreaProps as AntTextAreaProps,
  TextAreaRef,
} from "antd/es/input/TextArea";
import { cn } from "./utils/cn";

const inputClassName =
  "!h-11 !rounded-lg hover:!border-brand-primary focus:!border-brand-primary focus:!shadow-[0_0_0_2px_rgba(58,166,166,0.15)] " +
  "[&.ant-input-affix-wrapper]:!flex [&.ant-input-affix-wrapper]:!items-center [&.ant-input-affix-wrapper]:!py-0";

const textareaClassName =
  "!rounded-lg hover:!border-brand-primary focus:!border-brand-primary focus:!shadow-[0_0_0_2px_rgba(58,166,166,0.15)]";

export type InputProps = AntInputProps;
export type TextAreaProps = AntTextAreaProps;

const InputBase = forwardRef<InputRef, InputProps>(
  ({ className, ...props }, ref) => {
    return (
      <AntInput
        ref={ref}
        className={cn(inputClassName, className)}
        {...props}
      />
    );
  },
);

InputBase.displayName = "Input";

export const TextArea = forwardRef<TextAreaRef, TextAreaProps>(
  ({ className, ...props }, ref) => {
    return (
      <AntInput.TextArea
        ref={ref}
        className={cn(textareaClassName, className)}
        {...props}
      />
    );
  },
);

TextArea.displayName = "TextArea";

const Password = forwardRef<InputRef, InputProps>(
  ({ className, ...props }, ref) => (
    <AntInput.Password
      ref={ref}
      className={cn(inputClassName, className)}
      {...props}
    />
  ),
);
Password.displayName = "Input.Password";
type InputComponent = typeof InputBase & {
  TextArea: typeof TextArea;
  Password: typeof Password;
};
export const Input = InputBase as InputComponent;
Input.TextArea = TextArea;
Input.Password = Password;

export type { InputRef, TextAreaRef };
