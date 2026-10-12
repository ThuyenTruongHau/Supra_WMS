import { BuildOutlined } from "@ant-design/icons";

export default function OperatorControlTowerPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-brand-primary/10 text-brand-primary">
        <BuildOutlined className="text-4xl" />
      </div>
      <div>
        <h1 className="text-3xl font-black text-brand-dark">Control Tower</h1>
        <p className="mt-2 max-w-md text-lg text-stripe-ink-mute">
          Tính năng đang phát triển
        </p>
      </div>
    </div>
  );
}
