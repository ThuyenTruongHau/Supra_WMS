import { createContext, useContext } from "react";

type OperatorShellContextValue = {
  shellHeaderCollapsed: boolean;
  setShellHeaderCollapsed: (collapsed: boolean) => void;
};

const OperatorShellContext = createContext<OperatorShellContextValue>({
  shellHeaderCollapsed: false,
  setShellHeaderCollapsed: () => undefined,
});

export const OperatorShellProvider = OperatorShellContext.Provider;

export function useOperatorShell() {
  return useContext(OperatorShellContext);
}
