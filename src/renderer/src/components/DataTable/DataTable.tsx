// src/renderer/src/components/DataTable/DataTable.tsx
import { useState, useMemo } from 'react'
import { Search, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'

export interface Column<T> {
  key: string
  label: string
  render?: (row: T) => React.ReactNode
  className?: string
  sortable?: boolean
}

interface Props<T extends object> {
  columns: Column<T>[]
  data: T[]
  keyField?: string
  searchKeys?: string[]
  searchPlaceholder?: string
  actions?: (row: T) => React.ReactNode
  isLoading?: boolean
  emptyText?: string
  pageSize?: number
  headerActions?: React.ReactNode
}

export default function DataTable<T extends object>({
  columns, data, keyField = 'id', searchKeys = [], searchPlaceholder = 'Search...',
  actions, isLoading, emptyText = 'No records found.', pageSize = 20, headerActions,
}: Props<T>) {
  const [query, setQuery]   = useState('')
  const [page, setPage]     = useState(1)

  const filtered = useMemo(() => {
    if (!query.trim() || searchKeys.length === 0) return data
    const q = query.toLowerCase()
    return data.filter((row) =>
      searchKeys.some((k) => {
        const val = (row as Record<string, unknown>)[k]
        return String(val ?? '').toLowerCase().includes(q)
      })
    )
  }, [data, query, searchKeys])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage   = Math.min(page, totalPages)
  const paginated  = filtered.slice((safePage - 1) * pageSize, safePage * pageSize)

  function getVal(row: T, key: string): unknown {
    return (row as Record<string, unknown>)[key]
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      {(searchKeys.length > 0 || headerActions) && (
        <div className="flex items-center gap-3">
          {searchKeys.length > 0 && (
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                value={query}
                onChange={(e) => { setQuery(e.target.value); setPage(1) }}
                placeholder={searchPlaceholder}
                className="input pl-9"
              />
            </div>
          )}
          {headerActions && <div className="ml-auto flex items-center gap-2">{headerActions}</div>}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={`px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap ${col.className ?? ''}`}
                  >
                    {col.label}
                  </th>
                ))}
                {actions && <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {isLoading ? (
                <tr>
                  <td colSpan={columns.length + (actions ? 1 : 0)} className="px-4 py-12 text-center">
                    <div className="flex items-center justify-center gap-2 text-slate-400">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Loading...</span>
                    </div>
                  </td>
                </tr>
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + (actions ? 1 : 0)} className="px-4 py-12 text-center text-slate-400">
                    {emptyText}
                  </td>
                </tr>
              ) : (
                paginated.map((row, i) => (
                  <tr key={String(getVal(row, keyField) ?? i)} className="hover:bg-slate-50 transition-colors">
                    {columns.map((col) => (
                      <td key={col.key} className={`px-4 py-3 text-slate-700 ${col.className ?? ''}`}>
                        {col.render ? col.render(row) : String(getVal(row, col.key) ?? '')}
                      </td>
                    ))}
                    {actions && (
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {actions(row)}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50">
            <span className="text-xs text-slate-500">
              {filtered.length} record{filtered.length !== 1 ? 's' : ''}
              {query && ` matching "${query}"`}
            </span>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage === 1}
                className="p-1.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200 disabled:opacity-30">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs text-slate-600 px-2">
                {safePage} / {totalPages}
              </span>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}
                className="p-1.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200 disabled:opacity-30">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
