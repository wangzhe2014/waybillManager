import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

type PageInfo = {
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export function MiniMetric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="jt-muted-panel px-5 py-4">
      <div className="text-2xl font-semibold text-gray-900">{value}</div>
      <div className="mt-1 text-xs text-gray-500">{label}</div>
    </div>
  )
}

export function SectionTitle({
  icon: Icon,
  title,
  description,
  compact = false,
}: {
  icon: LucideIcon
  title: string
  description: string
  compact?: boolean
}) {
  return (
    <div className={compact ? '' : 'p-6'}>
      <div className="flex items-center gap-2">
        <Icon className="h-5 w-5 text-[#0fc6c2]" />
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      </div>
      <p className="mt-2 text-sm leading-6 text-gray-500">{description}</p>
    </div>
  )
}

export function Badge({ children, tone }: { children: ReactNode; tone: 'green' | 'orange' | 'blue' | 'gray' }) {
  const className = {
    green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    orange: 'bg-orange-50 text-orange-700 ring-orange-200',
    blue: 'bg-sky-50 text-sky-700 ring-sky-200',
    gray: 'bg-gray-100 text-gray-600 ring-gray-200',
  }[tone]

  return <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ring-1 ${className}`}>{children}</span>
}

export function TracePagination({
  pageInfo,
  loading,
  onPageChange,
}: {
  pageInfo: PageInfo
  loading: boolean
  onPageChange: (page: number) => void
}) {
  return (
    <div className="flex flex-col gap-3 border-t border-gray-100 px-6 py-4 text-sm text-gray-600 md:flex-row md:items-center md:justify-between">
      <span>
        共 {pageInfo.total} 条，每页 {pageInfo.pageSize} 条，第 {pageInfo.page} / {pageInfo.totalPages} 页
      </span>
      <div className="flex flex-wrap gap-2">
        <button
          disabled={pageInfo.page <= 1 || loading}
          onClick={() => onPageChange(1)}
          className="jt-btn-secondary px-3 text-sm"
        >
          首页
        </button>
        <button
          disabled={pageInfo.page <= 1 || loading}
          onClick={() => onPageChange(Math.max(1, pageInfo.page - 1))}
          className="jt-btn-secondary px-3 text-sm"
        >
          上一页
        </button>
        <button
          disabled={pageInfo.page >= pageInfo.totalPages || loading}
          onClick={() => onPageChange(Math.min(pageInfo.totalPages, pageInfo.page + 1))}
          className="jt-btn-secondary px-3 text-sm"
        >
          下一页
        </button>
        <button
          disabled={pageInfo.page >= pageInfo.totalPages || loading}
          onClick={() => onPageChange(pageInfo.totalPages)}
          className="jt-btn-secondary px-3 text-sm"
        >
          末页
        </button>
      </div>
    </div>
  )
}
