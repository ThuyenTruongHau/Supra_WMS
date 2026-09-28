/** Trang trắng dùng cho role chưa có màn hình thật. */

type BlankPageProps = {
  title?: string
  subtitle?: string
}

export default function BlankPage({ title, subtitle }: BlankPageProps = {}) {
  if (!title) {
    return <div className="min-h-full" aria-hidden />
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-brand-dark">{title}</h2>
          {subtitle ? (
            <p className="mt-1 text-sm text-slate-400">{subtitle}</p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
