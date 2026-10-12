import React, { useState } from 'react';
import { SearchOutlined } from '@ant-design/icons';
import { Input } from '@/components/ui';

interface WarehouseMapLocationSearchProps {
  /** Toàn bộ nội dung ô tìm — chuỗi rỗng sẽ xóa highlight. */
  onQueryChange: (query: string) => void;
  disabled?: boolean;
}

const WarehouseMapLocationSearch: React.FC<WarehouseMapLocationSearchProps> = ({
  onQueryChange,
  disabled = false,
}) => {
  const [value, setValue] = useState('');

  const handleChange = (next: string) => {
    setValue(next);
    if (disabled) return;
    if (!next.trim()) {
      onQueryChange('');
    }
  };

  const submit = () => {
    if (disabled) return;
    onQueryChange(value);
  };

  return (
    <div className="absolute top-3 left-3 z-30 w-[min(100%-5.5rem,22rem)]">
      <Input
        allowClear
        disabled={disabled}
        placeholder="Tìm vị trí (location_name)…"
        prefix={<SearchOutlined className="text-slate-400" />}
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onPressEnter={submit}
        className="shadow-md [&_.ant-input]:!text-sm"
        aria-label="Tìm vị trí trên bản đồ"
      />
    </div>
  );
};

export default WarehouseMapLocationSearch;
