import { useEffect, useState } from "react";
import { AutoComplete } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import { Button, Input } from "@/components/ui";
import { useGetItems } from "@/hooks/useItem";
import { cn } from "@/components/ui/utils/cn";

const ITEM_FETCH_LIMIT = 1000;
const DROPDOWN_MIN_WIDTH = 560;

export type SkuSearchOption = {
  value: string;
  label: string;
  item_name: string;
};

type SkuSearchSelectProps = {
  value?: string;
  onChange?: (sku: string | undefined) => void;
  onSelectOption?: (option: SkuSearchOption | null) => void;
  warehouseId: number;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
};

/**
 * Ô Part_number giống trang Sản phẩm: Input + nút Tìm.
 * Bấm Tìm → gọi API ngay và mở dropdown kết quả (rộng hơn).
 */
export function SkuSearchSelect({
  value,
  onChange,
  onSelectOption,
  warehouseId,
  placeholder = "Tìm theo tên, Part_number, mã...",
  className,
  disabled,
}: SkuSearchSelectProps) {
  const [searchInput, setSearchInput] = useState(value ?? "");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    setSearchInput(value ?? "");
  }, [value]);

  const { data, isFetching, isError, refetch } = useGetItems({
    warehouse_id: warehouseId,
    q: submittedQuery || undefined,
    limit: ITEM_FETCH_LIMIT,
    enabled: hasSearched && warehouseId > 0,
    staleTime: 0,
  });

  const options: SkuSearchOption[] =
    isFetching
      ? []
      : (data?.items.map((it) => ({
          value: it.sku,
          label: `${it.sku} - ${it.name}`,
          item_name: it.name,
        })) ?? []);

  // Sau khi API xong → mở dropdown ngay (không cần click thêm)
  useEffect(() => {
    if (hasSearched && !isFetching) {
      setDropdownOpen(true);
    }
  }, [hasSearched, isFetching, data, submittedQuery]);

  const handleSearch = async () => {
    if (warehouseId <= 0) return;
    const q = searchInput.trim();
    setSubmittedQuery(q);
    setHasSearched(true);
    setDropdownOpen(true);

    // Cùng từ khóa vẫn refetch để luôn ra kết quả mới
    if (hasSearched && submittedQuery === q) {
      await refetch();
    }
  };

  const handleClear = () => {
    setSearchInput("");
    setSubmittedQuery("");
    setHasSearched(false);
    setDropdownOpen(false);
    onChange?.(undefined);
    onSelectOption?.(null);
  };

  return (
    <div className={cn("flex w-full min-w-0 items-center gap-2", className)}>
      <div className="min-w-0 flex-1 overflow-hidden">
        <AutoComplete
          className="!w-full"
          disabled={disabled}
          open={dropdownOpen}
          onDropdownVisibleChange={setDropdownOpen}
          value={searchInput}
          options={options.map((o) => ({
            value: o.value,
            label: (
              <div className="flex min-w-0 items-center gap-2 py-0.5">
                <span className="shrink-0 font-semibold text-brand-primary">
                  {o.value}
                </span>
                <span className="truncate text-slate-500">- {o.item_name}</span>
              </div>
            ),
            item_name: o.item_name,
          }))}
          onChange={(text) => {
            setSearchInput(text);
            if (value && text !== value) {
              onChange?.(undefined);
              onSelectOption?.(null);
            }
          }}
          onSelect={(sku, option) => {
            const selected = String(sku);
            setSearchInput(selected);
            setDropdownOpen(false);
            onChange?.(selected);
            onSelectOption?.({
              value: selected,
              label: `${selected} - ${(option as { item_name?: string })?.item_name ?? ""}`,
              item_name: String(
                (option as { item_name?: string })?.item_name ?? "",
              ),
            });
          }}
          popupMatchSelectWidth={false}
          dropdownStyle={{
            minWidth: DROPDOWN_MIN_WIDTH,
            width: DROPDOWN_MIN_WIDTH,
          }}
          styles={{
            popup: {
              root: {
                minWidth: DROPDOWN_MIN_WIDTH,
                width: DROPDOWN_MIN_WIDTH,
              },
            },
          }}
          notFoundContent={
            isFetching
              ? "Đang tìm…"
              : isError
                ? "Lỗi tải sản phẩm"
                : hasSearched
                  ? "Không có kết quả"
                  : "Bấm Tìm để tìm sản phẩm"
          }
        >
          <Input
            allowClear
            disabled={disabled}
            placeholder={placeholder}
            prefix={<SearchOutlined className="text-gray-400" />}
            onPressEnter={(e) => {
              e.preventDefault();
              void handleSearch();
            }}
            onClear={handleClear}
            className="!w-full"
          />
        </AutoComplete>
      </div>
      <Button
        variant="secondary"
        icon={<SearchOutlined />}
        loading={isFetching}
        disabled={disabled || warehouseId <= 0}
        title={warehouseId <= 0 ? "Vui lòng chọn kho trước" : undefined}
        className="!h-11 !w-[72px] shrink-0"
        onClick={() => void handleSearch()}
      >
        Tìm
      </Button>
    </div>
  );
}
