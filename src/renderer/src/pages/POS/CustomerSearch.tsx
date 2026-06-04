// src/renderer/src/pages/POS/CustomerSearch.tsx
import { useState, useRef } from 'react'
import { Customer } from '@shared/types'
import { UserCircle, X, Search } from 'lucide-react'

interface Props { customerId:number|null; customerName:string|null; onSelect:(id:number|null,name:string|null)=>void }

export default function CustomerSearch({customerId, customerName, onSelect}: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Customer[]>([])
  const [open, setOpen] = useState(false)
  const timer = useRef<any>(null)

  function search(q: string) {
    setQuery(q)
    clearTimeout(timer.current)
    if (!q.trim()) { setResults([]); setOpen(false); return }
    timer.current = setTimeout(async () => {
      const r = await window.api.customers.search(q)
      if (r.success) { setResults(r.data); setOpen(true) }
    }, 300)
  }

  if (customerId && customerName) return (
    <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5">
      <UserCircle className="w-4 h-4 text-blue-500 flex-shrink-0"/>
      <span className="text-sm text-blue-700 font-medium flex-1 truncate">{customerName}</span>
      <button onClick={()=>onSelect(null,null)} className="text-blue-400 hover:text-blue-600"><X className="w-3 h-3"/></button>
    </div>
  )

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-400"/>
        <input value={query} onChange={e=>search(e.target.value)} placeholder="Add customer (optional)" className="input pl-8 py-1.5 text-sm"/>
      </div>
      {open && results.length>0 && (
        <div className="absolute top-full left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-lg mt-1 z-20 max-h-48 overflow-y-auto">
          {results.map(c=>(
            <button key={c.id} onClick={()=>{onSelect(c.id,c.full_name); setQuery(''); setOpen(false)}}
              className="w-full text-left px-4 py-2.5 hover:bg-slate-50 transition">
              <p className="text-sm font-medium text-slate-800">{c.full_name}</p>
              <p className="text-xs text-slate-400">{c.phone||c.email||''}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
