/** SVG icons cho board xuất kho / chia chọn — phong cách IoT warehouse. */

type IconProps = {
  className?: string;
  color?: string;
};

export function TruckDockIcon({
  className,
  color = "currentColor",
}: IconProps) {
  return (
    <svg
      viewBox="0 0 64 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <path
        d="M2 28V14.5c0-1.4 1.1-2.5 2.5-2.5H34v16H4.5A2.5 2.5 0 0 1 2 28Z"
        fill={color}
        fillOpacity="0.18"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M34 12h12.2c.8 0 1.5.4 1.9 1.1l6.4 10.2c.3.5.5 1 .5 1.6V28H34V12Z"
        fill={color}
        fillOpacity="0.28"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M40 15.5h5.2l4.8 7.8H40v-7.8Z" fill={color} fillOpacity="0.55" />
      <circle
        cx="14"
        cy="30"
        r="5"
        fill={color}
        fillOpacity="0.2"
        stroke={color}
        strokeWidth="2"
      />
      <circle cx="14" cy="30" r="2" fill={color} />
      <circle
        cx="46"
        cy="30"
        r="5"
        fill={color}
        fillOpacity="0.2"
        stroke={color}
        strokeWidth="2"
      />
      <circle cx="46" cy="30" r="2" fill={color} />
      <path
        d="M2 28h58"
        stroke={color}
        strokeWidth="1.5"
        strokeOpacity="0.35"
      />
    </svg>
  );
}

export function PalletBreakIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 72 56"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      {/* pallet base */}
      <rect x="10" y="40" width="52" height="5" rx="1" fill="#8B6914" />
      <rect x="12" y="45" width="6" height="4" rx="0.5" fill="#6B4F10" />
      <rect x="33" y="45" width="6" height="4" rx="0.5" fill="#6B4F10" />
      <rect x="54" y="45" width="6" height="4" rx="0.5" fill="#6B4F10" />
      {/* boxes */}
      <rect
        x="16"
        y="26"
        width="14"
        height="14"
        rx="1.5"
        fill="#F97316"
        stroke="#EA580C"
        strokeWidth="1"
      />
      <rect
        x="32"
        y="22"
        width="14"
        height="18"
        rx="1.5"
        fill="#FB923C"
        stroke="#EA580C"
        strokeWidth="1"
      />
      <rect
        x="48"
        y="28"
        width="12"
        height="12"
        rx="1.5"
        fill="#FDBA74"
        stroke="#F97316"
        strokeWidth="1"
      />
      {/* worker left */}
      <circle cx="18" cy="14" r="3.5" fill="#FCD34D" />
      <path d="M14 20c0-2 1.8-3.5 4-3.5s4 1.5 4 3.5v6H14v-6Z" fill="#0EA5E9" />
      <path d="M12 26h4l-1 10h-2l-1-10Z" fill="#1E293B" />
      <path d="M20 26h4l1 10h-2l-3-10Z" fill="#1E293B" />
      {/* worker right */}
      <circle cx="54" cy="12" r="3.5" fill="#FCD34D" />
      <path d="M50 18c0-2 1.8-3.5 4-3.5s4 1.5 4 3.5v6H50v-6Z" fill="#F97316" />
      <path d="M48 24h4l-1 10h-2l-1-10Z" fill="#1E293B" />
      <path d="M56 24h4l1 10h-2l-3-10Z" fill="#1E293B" />
      {/* arm gesture */}
      <path
        d="M22 22h8"
        stroke="#0EA5E9"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M50 20H42"
        stroke="#F97316"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function AgvPalletIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 72 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      {/* cargo boxes */}
      <rect
        x="18"
        y="6"
        width="36"
        height="10"
        rx="1.5"
        fill="#168C87"
        fillOpacity="0.85"
      />
      <rect
        x="20"
        y="8"
        width="10"
        height="6"
        rx="0.5"
        fill="#fff"
        fillOpacity="0.25"
      />
      <rect
        x="32"
        y="8"
        width="10"
        height="6"
        rx="0.5"
        fill="#fff"
        fillOpacity="0.25"
      />
      <rect
        x="44"
        y="8"
        width="8"
        height="6"
        rx="0.5"
        fill="#fff"
        fillOpacity="0.25"
      />
      {/* AGV body */}
      <rect x="14" y="18" width="44" height="16" rx="3" fill="#163B40" />
      <rect x="18" y="21" width="12" height="5" rx="1" fill="#168C87" />
      <rect x="34" y="21" width="8" height="5" rx="1" fill="#3AAFA9" />
      <circle cx="48" cy="23.5" r="2" fill="#2F9E77" />
      <circle cx="54" cy="23.5" r="2" fill="#D58A28" />
      {/* wheels */}
      <rect x="18" y="34" width="10" height="5" rx="1.5" fill="#204F55" />
      <rect x="44" y="34" width="10" height="5" rx="1.5" fill="#204F55" />
      {/* sensor bar */}
      <rect x="24" y="16" width="24" height="2" rx="1" fill="#A8C5C6" />
    </svg>
  );
}

export function ShelfRackIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 48 56"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <rect
        x="6"
        y="4"
        width="36"
        height="48"
        rx="2"
        fill="#E2E8F0"
        stroke="#94A3B8"
        strokeWidth="1.5"
      />
      <rect x="10" y="8" width="28" height="8" rx="1" fill="#CBD5E1" />
      <rect x="10" y="20" width="28" height="8" rx="1" fill="#CBD5E1" />
      <rect x="10" y="32" width="28" height="8" rx="1" fill="#CBD5E1" />
      <circle cx="14" cy="44" r="2" fill="#10B981" />
      <circle cx="22" cy="44" r="2" fill="#F59E0B" />
      <circle cx="30" cy="44" r="2" fill="#EF4444" />
      <circle cx="38" cy="44" r="2" fill="#64748B" />
    </svg>
  );
}

export function BoxesStackIcon({
  className,
  tone = "emerald",
}: IconProps & { tone?: "emerald" | "rose" }) {
  const fill = tone === "emerald" ? "#34D399" : "#FB7185";
  const stroke = tone === "emerald" ? "#059669" : "#E11D48";
  return (
    <svg
      viewBox="0 0 40 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <rect
        x="4"
        y="16"
        width="14"
        height="14"
        rx="1.5"
        fill={fill}
        fillOpacity="0.35"
        stroke={stroke}
        strokeWidth="1.5"
      />
      <rect
        x="20"
        y="10"
        width="14"
        height="20"
        rx="1.5"
        fill={fill}
        fillOpacity="0.55"
        stroke={stroke}
        strokeWidth="1.5"
      />
      <path
        d="M4 21h14M20 16h14M20 22h14"
        stroke={stroke}
        strokeWidth="1"
        strokeOpacity="0.45"
      />
    </svg>
  );
}

export function BreakingPalletHeaderIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <rect
        x="4"
        y="8"
        width="32"
        height="24"
        rx="4"
        fill="#0EA5E9"
        fillOpacity="0.12"
      />
      <rect x="10" y="22" width="20" height="4" rx="1" fill="#8B6914" />
      <rect x="12" y="14" width="7" height="8" rx="1" fill="#F97316" />
      <rect x="21" y="12" width="7" height="10" rx="1" fill="#FB923C" />
      <path
        d="M8 26h24"
        stroke="#0EA5E9"
        strokeWidth="1.5"
        strokeOpacity="0.5"
      />
    </svg>
  );
}

export function DockHeaderIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <rect
        x="4"
        y="10"
        width="32"
        height="22"
        rx="4"
        fill="#10B981"
        fillOpacity="0.12"
      />
      <path
        d="M8 26V18.5A1.5 1.5 0 0 1 9.5 17H22v9H8Z"
        fill="#10B981"
        fillOpacity="0.35"
        stroke="#059669"
        strokeWidth="1.2"
      />
      <path
        d="M22 17h5.5c.4 0 .8.2 1 .6L32 24v2H22V17Z"
        fill="#10B981"
        fillOpacity="0.5"
        stroke="#059669"
        strokeWidth="1.2"
      />
      <circle cx="12" cy="28" r="2.2" fill="#059669" />
      <circle cx="28" cy="28" r="2.2" fill="#059669" />
    </svg>
  );
}

export function RobotHeadIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <rect
        x="5"
        y="7"
        width="14"
        height="11"
        rx="3"
        fill="currentColor"
        fillOpacity="0.15"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <circle cx="9.5" cy="12" r="1.5" fill="currentColor" />
      <circle cx="14.5" cy="12" r="1.5" fill="currentColor" />
      <path
        d="M12 4v3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="12" cy="3.5" r="1.2" fill="currentColor" />
      <path
        d="M8 18v2M16 18v2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
