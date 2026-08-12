import { useEffect, useState } from "react";
import { AutoComplete } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import { Button, Input } from "@/components/ui";
import { useGetItems } from "@/hooks/useItem";
import { cn } from "@/components/ui/utils/cn";

const BROWSE_PAGE_SIZE = 40;
const SEARCH_PAGE_SIZE = 100;
const DROPDOWN_MIN_WIDTH = 560;

export type SkuSearchOption = {
  value: string;
  label: string;
  item_name: string;
  item_id?: number;
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

type ItemQueryParams = {
  q?: string;
  page: number;
  page_size: number;
};

/**
 * Ô Part_number: focus → tải 40 SKU đầu; bấm Tìm → tìm theo ô nhập (hỗ trợ nhiều SKU).
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
  const [queryParams, setQueryParams] = useState<ItemQueryParams | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    setSearchInput(value ?? "");
  }, [value]);

  const { data, isFetching, isError, refetch } = useGetItems({
    warehouse_id: warehouseId,
    q: queryParams?.q,
    page: queryParams?.page ?? 1,
    page_size: queryParams?.page_size ?? BROWSE_PAGE_SIZE,
    enabled: queryParams !== null && warehouseId > 0,
    staleTime: 0,
  });

  const options: SkuSearchOption[] = isFetching
    ? []
    : (data?.items.map((it) => ({
        value: it.sku,
        label: `${it.sku} - ${it.name}`,
        item_name: it.name,
        item_id: it.id,
      })) ?? []);

  useEffect(() => {
    if (queryParams && !isFetching) {
      setDropdownOpen(true);
    }
  }, [queryParams, isFetching, data]);

  const loadBrowse = () => {
    if (warehouseId <= 0) return;
    setQueryParams({ page: 1, page_size: BROWSE_PAGE_SIZE });
  };

  const handleFocus = () => {
    if (warehouseId <= 0) return;
    if (queryParams === null) {
      loadBrowse();
    }
    setDropdownOpen(true);
  };

  const handleSearch = async () => {
    if (warehouseId <= 0) return;
    const q = searchInput.trim();
    const next: ItemQueryParams = {
      page: 1,
      page_size: SEARCH_PAGE_SIZE,
      q: q || undefined,
    };

    const sameQuery =
      queryParams?.q === next.q &&
      queryParams?.page === next.page &&
      queryParams?.page_size === next.page_size;

    setQueryParams(next);
    setDropdownOpen(true);

    if (sameQuery) {
      await refetch();
    }
  };

  const handleClear = () => {
    setSearchInput("");
    setQueryParams(null);
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
          onDropdownVisibleChange={(open) => {
            setDropdownOpen(open);
            if (open && queryParams === null && warehouseId > 0) {
              loadBrowse();
            }
          }}
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
            item_id: o.item_id,
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
            const opt = option as { item_name?: string; item_id?: number };
            setSearchInput(selected);
            setDropdownOpen(false);
            onChange?.(selected);
            onSelectOption?.({
              value: selected,
              label: `${selected} - ${opt?.item_name ?? ""}`,
              item_name: String(opt?.item_name ?? ""),
              item_id: opt?.item_id,
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
              ? "Đang tải…"
              : isError
                ? "Lỗi tải sản phẩm"
                : queryParams
                  ? "Không có kết quả"
                  : "Bấm vào ô hoặc Tìm để tải sản phẩm"
          }
        >
          <Input
            allowClear
            disabled={disabled}
            placeholder={placeholder}
            prefix={<SearchOutlined className="text-gray-400" />}
            onFocus={handleFocus}
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
