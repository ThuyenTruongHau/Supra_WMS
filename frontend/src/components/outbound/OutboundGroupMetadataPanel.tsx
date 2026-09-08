import type { OutboundDetailGroup } from "@/types/outbound";

type OutboundGroupMetadataPanelProps = {
  group: Pick<
    OutboundDetailGroup,
    "trip_code" | "carrier_name" | "lot_number" | "sorting_wave_ids"
  >;
};

export default function OutboundGroupMetadataPanel({
  group,
}: OutboundGroupMetadataPanelProps) {
  const fields = [
    {
      label: "Wave",
      value:
        group.sorting_wave_ids.length > 0
          ? group.sorting_wave_ids.map((id) => `#${id}`).join(", ")
          : "—",
    },
    { label: "Trip", value: group.trip_code?.trim() || "—" },
    { label: "NVT", value: group.carrier_name?.trim() || "—" },
    { label: "LOT", value: group.lot_number?.trim() || "—" },
  ].filter((field) => field.value !== "—");

  if (fields.length === 0) {
    return null;
  }

  return (
    <div className="rounded-md bg-slate-50 px-4 py-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Thông tin nhóm
      </p>
      <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
        {fields.map((field) => (
          <div key={field.label}>
            <p className="text-xs text-slate-500">{field.label}</p>
            <p className="whitespace-normal break-words text-sm text-slate-800">
              {field.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
