export type DetailFieldSchema<T> = {
  key: string;
  label: string;
  accessor?: (record: T) => unknown;
  render?: (record: T) => React.ReactNode;
};

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 gap-1 border-b border-gray-100 py-3 sm:grid-cols-3">
      <dt className="text-sm text-gray-500">{label}</dt>
      <dd className="sm:col-span-2 text-sm font-medium text-brand-dark">
        {value}
      </dd>
    </div>
  );
}

function formatDetailValue(value: unknown): React.ReactNode {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function DetailView<T>({
  data,
  fields,
  className,
}: {
  data: T;
  fields: DetailFieldSchema<T>[];
  className?: string;
}) {
  return (
    <dl className={className}>
      {fields.map(({ key, label, accessor, render }) => (
        <DetailRow
          key={key}
          label={label}
          value={
            render
              ? render(data)
              : formatDetailValue(accessor?.(data))
          }
        />
      ))}
    </dl>
  );
}
