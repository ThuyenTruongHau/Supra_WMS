import { formatDisplayBin } from "@/utils/locationBin";

/** ST = ô chia chọn · VTC = ô chờ xuất (vị trí chia). */
export type WaveStationKind = "sorting" | "outbound";

export const WAVE_STATION_KIND_SHORT: Record<WaveStationKind, string> = {
  sorting: "ST",
  outbound: "VTC",
};

export const WAVE_STATION_KIND_LABEL: Record<WaveStationKind, string> = {
  sorting: "ST — Chia chọn",
  outbound: "VTC — Vị trí chia",
};

export function resolveWaveStationKind(
  locationType?: string | null,
  bin?: string | null,
): WaveStationKind | null {
  const displayBin = formatDisplayBin(bin, locationType);
  if (/^(CX|VTC)/i.test(displayBin)) return "outbound";
  if (/^ST/i.test(displayBin)) return "sorting";
  return null;
}

export function isWaveStationLocationTypeParam(
  locationType?: string | null,
): boolean {
  const value = (locationType || "").trim();
  return (
    value.includes("sorting_station") || value.includes("outbound_station")
  );
}
