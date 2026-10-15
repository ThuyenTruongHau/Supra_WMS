const DEFAULT_NO_VEHICLE = "Không biển số";

/** One plate on order list cards; append … when the order has more vehicles. */
export function formatOperatorSampleVehicle(
  plate: string | null | undefined,
  hasMore: boolean,
  noVehicleLabel: string = DEFAULT_NO_VEHICLE,
): string {
  let text: string;
  if (plate === "no_vehicle" || plate === "") {
    text = noVehicleLabel;
  } else if (plate?.trim()) {
    text = plate.trim();
  } else {
    text = "—";
  }
  return hasMore ? `${text}…` : text;
}
