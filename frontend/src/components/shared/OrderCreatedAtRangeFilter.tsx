import { DatePicker } from "antd";
import type { Dayjs } from "dayjs";
import type { OrderCreatedAtRange } from "@/utils/orderCreatedAtRangeParams";

type OrderCreatedAtRangeFilterProps = {
  value: OrderCreatedAtRange;
  onChange: (value: OrderCreatedAtRange) => void;
  className?: string;
  placeholder?: [string, string];
};

export default function OrderCreatedAtRangeFilter({
  value,
  onChange,
  className,
  placeholder = ["Từ ngày giờ", "Đến ngày giờ"],
}: OrderCreatedAtRangeFilterProps) {
  return (
    <DatePicker.RangePicker
      allowClear
      showTime={{ format: "HH:mm" }}
      format="DD/MM/YYYY HH:mm"
      placeholder={placeholder}
      className={className ?? "w-full min-w-[280px]"}
      value={value}
      onChange={(dates) => {
        if (!dates || !dates[0] || !dates[1]) {
          onChange(null);
          return;
        }
        onChange([dates[0], dates[1]]);
      }}
    />
  );
}

export type { Dayjs };
