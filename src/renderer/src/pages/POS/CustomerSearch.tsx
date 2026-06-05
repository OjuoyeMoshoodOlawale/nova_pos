import { useState, useRef } from 'react'
import { UserCircle, X, Search } from 'lucide-react'

interface Props {
  customerId:   number|null
  customerName: string|null
  groupDiscount?: number
  groupName?:   string
  onSelect:     (id:number|null, name:string|null, groupDiscount:number, groupName:string) => void
}

export default function CustomerSearch({customerId, customerName, groupDiscount, groupName, onSelect}: Props) {
  const [query, setQuery]     = useState('')
  const [results, setResults] = useState<any[]>([])
  const [open, setOpen]       = useState(false)
  const timer = useRef<any>(null)

  async function search(q: string) {
    setQuery(q)
    clearTimeout(timer.current)
    if (!q.trim()) { setResults([]); setOpen(false); return }
    timer.current = setTimeout(async () => {
      const r = await window.api.customers.search(q)
      if (r.success) { setResults(r.data); setOpen(true) }
    }, 280)
  }

  if (customerId && customerName) return (
    <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5">
      <UserCircle className="w-4 h-4 text-blue-500 flex-shrink-0"/>
      <div className="flex-1 min-w-0">
        <span className="text-sm text-blue-700 font-medium truncate">{customerName}</span>
        {groupDiscount && groupDiscount > 0 ? (
          <span className="ml-2 text-xs bg-blue-200 text-blue-800 rounded-full px-2 py-0.5 font-semibold">
            {groupName} -{groupDiscount}%
          </span>
        ) : groupName && groupName !== 'Walk-in' ? (
          <span className="ml-2 text-xs bg-blue-100 text-blue-600 rounded-full px-2 py-0.5">{groupName}</span>
        ) : null}
      </div>
      <button onClick={()=>onSelect(null,null,0,'')} className="text-blue-400 hover:text-blue-600">
        <X className="w-3 h-3"/>
      </button>
    </div>
  )

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-400"/>
        <input value={query} onChange={e=>search(e.target.value)}
          placeholder="Add customer (optional)" className="input pl-8 py-1.5 text-sm"/>
      </div>
      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-lg mt-1 z-20 max-h-48 overflow-y-auto">
          {results.map((c:any) => (
            <button key={c.id}
              onClick={()=>{
                onSelect(c.id, c.full_name, c.group_discount||0, c.price_group_name||'Walk-in')
                setQuery(''); setOpen(false)
              }}
              className="w-full text-left px-4 py-2.5 hover:bg-slate-50 transition border-b border-slate-50 last:border-0">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-800">{c.full_name}</p>
                  <p className="text-xs text-slate-400">{c.phone||c.email||''}</p>
                </div>
                {c.price_group_name && c.price_group_name !== 'Walk-in' && (
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                    {c.price_group_name}
                    {c.group_discount > 0 && ` -${c.group_discount}%`}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
