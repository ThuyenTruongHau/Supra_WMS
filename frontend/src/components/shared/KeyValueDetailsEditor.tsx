import { PlusOutlined, MinusCircleOutlined } from "@ant-design/icons";
import { Input, Button as AntButton } from "antd";
import type { KeyValueEntry } from "@/utils/keyValueDetails";
import { createEmptyKeyValueEntry } from "@/utils/keyValueDetails";

interface KeyValueDetailsEditorProps {
  entries: KeyValueEntry[];
  onChange: (entries: KeyValueEntry[]) => void;
  label?: string;
  addButtonText?: string;
  className?: string;
}

export default function KeyValueDetailsEditor({
  entries,
  onChange,
  label = "Thông tin bổ sung (tùy chọn)",
  addButtonText = "Thêm trường",
  className,
}: KeyValueDetailsEditorProps) {
  const updateEntry = (id: string, patch: Partial<KeyValueEntry>) => {
    onChange(entries.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));
  };

  const removeEntry = (id: string) => {
    onChange(entries.filter((entry) => entry.id !== id));
  };

  const addEntry = () => {
    onChange([...entries, createEmptyKeyValueEntry()]);
  };

  return (
    <div className={className ?? "mt-4"}>
      <div className="mb-2 text-sm font-medium text-slate-700">{label}</div>
      {entries.length > 0 && (
        <div className="space-y-2 mb-2">
          {entries.map((entry) => (
            <div key={entry.id} className="flex w-full items-start gap-2">
              <Input
                placeholder="Tên (vd: supplier)"
                value={entry.key}
                onChange={(e) => updateEntry(entry.id, { key: e.target.value })}
                className="flex-1"
              />
              <Input
                placeholder="Giá trị (vd: Honda VN)"
                value={entry.value}
                onChange={(e) => updateEntry(entry.id, { value: e.target.value })}
                className="flex-1"
              />
              <MinusCircleOutlined
                className="mt-2 shrink-0 cursor-pointer text-red-400"
                onClick={() => removeEntry(entry.id)}
              />
            </div>
          ))}
        </div>
      )}
      <AntButton
        type="dashed"
        icon={<PlusOutlined />}
        className="w-full"
        onClick={addEntry}
      >
        {addButtonText}
      </AntButton>
    </div>
  );
}
