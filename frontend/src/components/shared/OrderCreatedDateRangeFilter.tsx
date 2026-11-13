import { DatePicker } from "antd";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import {
  dayjsRangeToOrderListParams,
  orderListDateRangeToDayjs,
  type OrderCreatedDateRangeValue,
} from "@/utils/formatOrderListDateParams";

const { RangePicker } = DatePicker;

const DEFAULT_WIDTH = 340;

type OrderCreatedDateRangeFilterProps = {
  value: OrderCreatedDateRangeValue;
  onChange: (value: OrderCreatedDateRangeValue) => void;
  className?: string;
  width?: number;
};

export default function OrderCreatedDateRangeFilter({
  value,
  onChange,
  className,
  width = DEFAULT_WIDTH,
}: OrderCreatedDateRangeFilterProps) {
  const pickerValue = orderListDateRangeToDayjs(value);

  return (
    <RangePicker
      allowClear
      showTime={{
        format: "HH:mm",
        minuteStep: 1,
        defaultValue: [
          dayjs("00:00", "HH:mm"),
          dayjs("23:59", "HH:mm"),
        ],
      }}
      className={`shrink-0 !h-11 ${className ?? ""}`}
      style={{
        width,
        minWidth: width,
        maxWidth: width,
        height: 44,
      }}
      format="DD/MM/YYYY HH:mm"
      placeholder={["Từ ngày giờ", "Đến ngày giờ"]}
      value={pickerValue}
      onChange={(dates) =>
        onChange(
          dayjsRangeToOrderListParams(
            dates as [Dayjs | null, Dayjs | null] | null,
          ),
        )
      }
    />
  );
}
