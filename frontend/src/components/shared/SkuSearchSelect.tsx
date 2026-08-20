import { useCallback, useEffect, useId, useRef, useState } from "react";
import { AutoComplete } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import { Button, Input } from "@/components/ui";
import { useGetItems } from "@/hooks/useItem";
import { cn } from "@/components/ui/utils/cn";

const BROWSE_PAGE_SIZE = 40;
const SEARCH_PAGE_SIZE = 100;
const DROPDOWN_MIN_WIDTH = 560;

/** Ensure only one SKU dropdown is open at a time across all rows/modals. */
const openSkuSelectRegistry = new Map<string, () => void>();

function closeOtherSkuSelects(exceptId: string) {
  openSkuSelectRegistry.forEach((close, id) => {
    if (id !== exceptId) close();
  });
}

function registerOpenSkuSelect(id: string, close: () => void) {
  closeOtherSkuSelects(id);
  openSkuSelectRegistry.set(id, close);
}

function unregisterSkuSelect(id: string) {
  openSkuSelectRegistry.delete(id);
}

export type SkuSearchOption = {
  value: string;
  label: string;
  item_name: string;
  item_id?: number;
  base_unit?: string;
  base_quantity?: number;
};

type SkuSearchSelectProps = {
  value?: string;
  onChange?: (sku: string | undefined) => void;
  onSelectOption?: (option: SkuSearchOption | null) => void;
  warehouseId: number;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  /** Số SKU hiển thị khi focus / browse (mặc định 40) */
  browsePageSize?: number;
  /** Số SKU tối đa khi bấm Tìm (mặc định 100) */
  searchPageSize?: number;
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
  browsePageSize = BROWSE_PAGE_SIZE,
  searchPageSize = SEARCH_PAGE_SIZE,
}: SkuSearchSelectProps) {
  const instanceId = useId();
  const [searchInput, setSearchInput] = useState(value ?? "");
  const [queryParams, setQueryParams] = useState<ItemQueryParams | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const setDropdownOpenRef = useRef(setDropdownOpen);
  setDropdownOpenRef.current = setDropdownOpen;

  const closeDropdown = useCallback(() => {
    setDropdownOpenRef.current(false);
    unregisterSkuSelect(instanceId);
  }, [instanceId]);

  const openDropdown = useCallback(() => {
    registerOpenSkuSelect(instanceId, () => setDropdownOpenRef.current(false));
    setDropdownOpenRef.current(true);
  }, [instanceId]);

  useEffect(() => {
    setSearchInput(value ?? "");
  }, [value]);

  useEffect(() => {
    return () => unregisterSkuSelect(instanceId);
  }, [instanceId]);

  const { data, isFetching, isError, refetch } = useGetItems({
    warehouse_id: warehouseId,
    q: queryParams?.q,
    page: queryParams?.page ?? 1,
    page_size: queryParams?.page_size ?? browsePageSize,
    enabled: queryParams !== null && warehouseId > 0,
  });

  const options: SkuSearchOption[] = isFetching
    ? []
    : (data?.items.map((it) => ({
        value: it.sku,
        label: `${it.sku} - ${it.name}`,
        item_name: it.name,
        item_id: it.id,
        base_unit: it.base_unit,
        base_quantity: it.base_quantity,
      })) ?? []);

  const loadBrowse = () => {
    if (warehouseId <= 0) return;
    setQueryParams({ page: 1, page_size: browsePageSize });
  };

  const handleFocus = () => {
    if (warehouseId <= 0) return;
    if (queryParams === null) {
      loadBrowse();
    }
    openDropdown();
  };

  const handleSearch = async () => {
    if (warehouseId <= 0) return;
    const q = searchInput.trim();
    const next: ItemQueryParams = {
      page: 1,
      page_size: searchPageSize,
      q: q || undefined,
    };

    const sameQuery =
      queryParams?.q === next.q &&
      queryParams?.page === next.page &&
      queryParams?.page_size === next.page_size;

    setQueryParams(next);
    openDropdown();

    if (sameQuery) {
      await refetch();
    }
  };

  const handleClear = () => {
    setSearchInput("");
    setQueryParams(null);
    closeDropdown();
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
          onOpenChange={(open) => {
            if (open) {
              registerOpenSkuSelect(instanceId, () =>
                setDropdownOpenRef.current(false),
              );
              if (queryParams === null && warehouseId > 0) {
                loadBrowse();
              }
            } else {
              unregisterSkuSelect(instanceId);
            }
            setDropdownOpen(open);
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
            base_unit: o.base_unit,
            base_quantity: o.base_quantity,
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
            const opt = option as {
              item_name?: string;
              item_id?: number;
              base_unit?: string;
              base_quantity?: number;
            };
            setSearchInput(selected);
            closeDropdown();
            onChange?.(selected);
            onSelectOption?.({
              value: selected,
              label: `${selected} - ${opt?.item_name ?? ""}`,
              item_name: String(opt?.item_name ?? ""),
              item_id: opt?.item_id,
              base_unit: opt?.base_unit,
              base_quantity: opt?.base_quantity,
            });
          }}
          popupMatchSelectWidth={false}
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
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => void handleSearch()}
      >
        Tìm
      </Button>
    </div>
  );
}
