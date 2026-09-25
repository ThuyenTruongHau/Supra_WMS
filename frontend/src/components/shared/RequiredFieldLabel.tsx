import type { ReactNode } from "react";

interface RequiredFieldLabelProps {
  children: ReactNode;
  required?: boolean;
  className?: string;
}

export function RequiredFieldLabel({
  children,
  required = false,
  className = "mb-2 text-sm font-medium text-slate-600",
}: RequiredFieldLabelProps) {
  return (
    <p className={className}>
      {children}
      {required ? (
        <span className="text-red-500" aria-hidden="true">
          {" "}
          *
        </span>
      ) : null}
    </p>
  );
}
