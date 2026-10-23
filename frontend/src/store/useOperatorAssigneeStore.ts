import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Stable default — never use `?? []` inline in selectors (infinite re-render). */
const EMPTY_OUTBOUND_ASSIGNEES: string[] = [];

function normalizeOutboundAssigneeList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => (typeof entry === "string" ? entry : String(entry ?? "")).trim())
    .filter(Boolean);
}

function normalizeOutboundByDisplayZoneId(
  raw: Record<number, string[]> | undefined,
): Record<number, string[]> {
  if (!raw || typeof raw !== "object") {
    return {};
  }
  const next: Record<number, string[]> = {};
  for (const [key, value] of Object.entries(raw)) {
    const zoneId = Number(key);
    if (!Number.isFinite(zoneId)) {
      continue;
    }
    next[zoneId] = normalizeOutboundAssigneeList(value);
  }
  return next;
}

type OperatorAssigneeState = {
  /** Một người nhập theo kho (warehouse id). */
  inboundByWarehouseId: Record<number, string | undefined>;
  /** Nhiều người xuất theo khu chia chọn (`OUTBOUND_DISPLAY_ZONES[].id`). */
  outboundByDisplayZoneId: Record<number, string[]>;
  setInboundAssignee: (warehouseId: number, username: string | undefined) => void;
  setOutboundAssignees: (displayZoneId: number, usernames: string[]) => void;
};

export const useOperatorAssigneeStore = create<OperatorAssigneeState>()(
  persist(
    (set) => ({
      inboundByWarehouseId: {},
      outboundByDisplayZoneId: {},
      setInboundAssignee: (warehouseId, username) =>
        set((state) => ({
          inboundByWarehouseId: {
            ...state.inboundByWarehouseId,
            [warehouseId]: username,
          },
        })),
      setOutboundAssignees: (displayZoneId, usernames) =>
        set((state) => ({
          outboundByDisplayZoneId: {
            ...state.outboundByDisplayZoneId,
            [displayZoneId]: normalizeOutboundAssigneeList(usernames),
          },
        })),
    }),
    {
      name: "operator-assignee-store",
      partialize: (state) => ({
        inboundByWarehouseId: state.inboundByWarehouseId,
        outboundByDisplayZoneId: state.outboundByDisplayZoneId,
      }),
      merge: (persisted, current) => {
        const saved = persisted as Partial<OperatorAssigneeState> | undefined;
        return {
          ...current,
          ...saved,
          outboundByDisplayZoneId: normalizeOutboundByDisplayZoneId(
            saved?.outboundByDisplayZoneId,
          ),
        };
      },
    },
  ),
);

export function useInboundOperatorAssignee(warehouseId: number) {
  const username = useOperatorAssigneeStore(
    (s) => s.inboundByWarehouseId[warehouseId],
  );
  const setInboundAssignee = useOperatorAssigneeStore(
    (s) => s.setInboundAssignee,
  );
  return {
    username,
    setUsername: (next: string | undefined) =>
      setInboundAssignee(warehouseId, next),
  };
}

export function useOutboundOperatorAssignees(displayZoneId: number) {
  const usernames = useOperatorAssigneeStore((s) => {
    const list = s.outboundByDisplayZoneId[displayZoneId];
    return list ?? EMPTY_OUTBOUND_ASSIGNEES;
  });
  const setOutboundAssignees = useOperatorAssigneeStore(
    (s) => s.setOutboundAssignees,
  );
  return {
    usernames,
    setUsernames: (next: string[]) =>
      setOutboundAssignees(displayZoneId, next),
  };
}
