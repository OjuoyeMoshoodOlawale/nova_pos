// src/renderer/src/pages/POS/CheckoutBar.tsx
// ─────────────────────────────────────────────────────────────
// One input handles BOTH modes:
//   Hardware scanner: chars arrive < 50ms apart → direct add, no dropdown
//   Manual typing:    chars arrive > 100ms apart → show search results
// ─────────────────────────────────────────────────────────────
import { useState, useRef, useEffect, useCallback } from 'react'
import { Product } from '@shared/types'
import { useCartStore } from '../../store/cartStore'
import { useAppStore }  from '../../store/appStore'
import { Scan, Search, CheckCircle, XCircle, Loader2 } from 'lucide-react'

type Status = 'ready' | 'scanning' | 'found' | 'notfound' | 'searching'

// ── Audio beep via Web Audio API ──────────────────────────
function beep(ok: boolean) {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const osc  = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    osc.frequency.value = ok ? 1800 : 400
    osc.type = ok ? 'sine' : 'square'
    gain.gain.setValueAtTime(0.08, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (ok ? 0.12 : 0.4))
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + (ok ? 0.12 : 0.4))
  } catch { /* Audio not available */ }
}

interface Props {
  onProductAdded?: (name: string) => void
}

export default function CheckoutBar({ onProductAdded }: Props) {
  const cart = useCartStore()
  const { addToast, profile } = useAppStore()
  const sym = profile?.currency_symbol ?? '₦'

  const [value,    setValue]    = useState('')
  const [status,   setStatus]   = useState<Status>('ready')
  const [results,  setResults]  = useState<Product[]>([])
  const [lastMsg,  setLastMsg]  = useState('')
  const [showDrop, setShowDrop] = useState(false)

  const inputRef   = useRef<HTMLInputElement>(null)
  const lastKey    = useRef(0)
  const buffer     = useRef('')
  const isScan     = useRef(false)
  const searchTimer = useRef<ReturnType<typeof setTimeout>>()

  // Keep input focused (supermarket checkout behaviour)
  useEffect(() => {
    inputRef.current?.focus()
    const refocus = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (!t.closest('[data-nofocus]')) {
        setTimeout(() => inputRef.current?.focus(), 50)
      }
    }
    document.addEventListener('click', refocus)
    return () => document.removeEventListener('click', refocus)
  }, [])

  async function addProduct(product: Product, mode: 'unit'|'bulk' = 'unit') {
    cart.addItem(product, mode)
    const label = mode === 'bulk' && product.bulk_unit
      ? `${product.name} × ${product.bulk_unit}`
      : product.name
    const price = mode === 'bulk' ? product.bulk_selling_price : product.selling_price
    setLastMsg(`✓ ${label}  ${sym}${price.toFixed(2)}`)
    setStatus('found')
    setShowDrop(false)
    setValue('')
    beep(true)
    onProductAdded?.(label)
    setTimeout(() => setStatus('ready'), 2000)
  }

  async function handleBarcode(code: string) {
    if (!code.trim()) return
    setStatus('scanning')
    const r = await window.api.products.findBarcode(code.trim())
    if (r.success && r.data) {
      await addProduct(r.data)
    } else {
      beep(false)
      setLastMsg(`✗ Not found: ${code}`)
      setStatus('notfound')
      addToast('error', `Barcode not found: ${code}`)
      setTimeout(() => { setStatus('ready'); setLastMsg('') }, 3000)
    }
  }

  async function doSearch(q: string) {
    if (!q.trim()) { setResults([]); setShowDrop(false); return }
    setStatus('searching')
    const r = await window.api.products.search(q)
    if (r.success) {
      setResults(r.data.slice(0, 8))
      setShowDrop(r.data.length > 0)
    }
    setStatus('ready')
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const now = Date.now()
    const gap  = now - lastKey.current
    lastKey.current = now

    if (gap < 50) isScan.current = true   // scanner speed

    if (e.key === 'Enter') {
      e.preventDefault()
      if (isScan.current && buffer.current.length >= 3) {
        // It was a scanner — treat as barcode
        handleBarcode(buffer.current)
        buffer.current = ''
        isScan.current = false
        setValue('')
        clearTimeout(searchTimer.current)
        setShowDrop(false)
      } else if (results.length > 0) {
        // Manual typing + Enter → add first result
        addProduct(results[0])
      } else if (value.trim()) {
        // Try as barcode
        handleBarcode(value.trim())
      }
      return
    }

    if (e.key === 'Escape') {
      setValue(''); setShowDrop(false); setResults([])
      isScan.current = false; buffer.current = ''
      return
    }

    if (e.key === 'ArrowDown' && results.length > 0) {
      e.preventDefault()
      // TODO: keyboard nav in dropdown
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value
    const now = Date.now()
    const gap  = now - lastKey.current

    setValue(v)
    buffer.current = v

    if (gap < 50) {
      // Scanner — don't search, let Enter handle it
      isScan.current = true
      clearTimeout(searchTimer.current)
      return
    }

    // Human typing — debounced search
    isScan.current = false
    clearTimeout(searchTimer.current)
    if (v.trim().length >= 1) {
      searchTimer.current = setTimeout(() => doSearch(v), 300)
    } else {
      setResults([]); setShowDrop(false)
    }
  }

  const statusConfig = {
    ready:     { icon: Scan,        color: 'text-green-600 bg-green-50',  label: 'Scan Ready' },
    scanning:  { icon: Loader2,     color: 'text-blue-600 bg-blue-50',    label: 'Scanning...' },
    searching: { icon: Loader2,     color: 'text-blue-600 bg-blue-50',    label: 'Searching...' },
    found:     { icon: CheckCircle, color: 'text-green-600 bg-green-50',  label: lastMsg },
    notfound:  { icon: XCircle,     color: 'text-red-600 bg-red-50',      label: lastMsg },
  }
  const sc = statusConfig[status]
  const Icon = sc.icon

  return (
    <div className="bg-white border-b border-slate-200 px-4 py-3 space-y-2">
      {/* Main scan/search input */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-400 pointer-events-none"/>
          <input
            ref={inputRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onBlur={() => setTimeout(() => setShowDrop(false), 200)}
            onFocus={() => value && results.length > 0 && setShowDrop(true)}
            placeholder="Scan barcode or type product name..."
            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-slate-50"
            autoComplete="off"
          />
          {/* Search dropdown */}
          {showDrop && results.length > 0 && (
            <div data-nofocus className="absolute top-full left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-xl mt-1 z-50 overflow-hidden max-h-72 overflow-y-auto">
              {results.map(p => (
                <button key={p.id} onMouseDown={() => addProduct(p)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50 transition text-left">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{p.name}</p>
                    <p className="text-xs text-slate-400">{p.barcode || p.sku || 'No barcode'} · {p.stock_qty} in stock</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-blue-600">{sym}{p.selling_price.toFixed(2)}</p>
                    {p.has_bulk_pricing && p.bulk_unit && (
                      <button onMouseDown={e=>{e.stopPropagation(); addProduct(p,'bulk')}}
                        className="text-xs text-amber-600 hover:text-amber-800 block">
                        {sym}{p.bulk_selling_price?.toFixed(2)}/{p.bulk_unit}
                      </button>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Status pill */}
        <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold flex-shrink-0 ${sc.color}`}>
          <Icon className={`w-4 h-4 flex-shrink-0 ${status==='scanning'||status==='searching'?'animate-spin':''}`}/>
          <span className="max-w-[180px] truncate">{sc.label}</span>
        </div>
      </div>

      {/* Hint bar */}
      <p className="text-xs text-slate-400">
        <span className="font-medium text-slate-500">Hardware:</span> scan barcode → auto-add instantly ·
        <span className="font-medium text-slate-500 ml-2">Manual:</span> type name/barcode → select from list or press Enter
      </p>
    </div>
  )
}
