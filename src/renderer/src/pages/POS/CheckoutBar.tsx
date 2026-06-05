// CheckoutBar.tsx — Unified hardware scanner + manual search
// ─────────────────────────────────────────────────────────
// USB barcode scanners are keyboard emulators (HID).
// They type chars FAST (5-80ms apart) then send Enter.
// Human typing is SLOW (150ms+ between keys).
// We capture both in one input — scanner fires onBarcode,
// manual typing shows a search dropdown.
// ─────────────────────────────────────────────────────────
import { useState, useRef, useEffect, useCallback } from 'react'
import { Product } from '@shared/types'
import { useCartStore } from '../../store/cartStore'
import { useAppStore }  from '../../store/appStore'
import { Scan, Search, CheckCircle, XCircle, Loader2, Wifi } from 'lucide-react'

type Status = 'ready' | 'scanning' | 'found' | 'notfound' | 'searching'

// ── Beep via Web Audio ────────────────────────────────────
function beep(ok: boolean) {
  try {
    const ctx  = new (window.AudioContext || (window as any).webkitAudioContext)()
    const osc  = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    osc.frequency.value = ok ? 1800 : 400
    osc.type            = ok ? 'sine' : 'square'
    gain.gain.setValueAtTime(0.08, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (ok ? 0.15 : 0.5))
    osc.start(); osc.stop(ctx.currentTime + (ok ? 0.15 : 0.5))
  } catch { /* audio not available */ }
}

export default function CheckoutBar() {
  const cart = useCartStore()
  const { addToast, profile } = useAppStore()
  const sym = profile?.currency_symbol ?? '₦'

  const [value,    setValue]    = useState('')
  const [status,   setStatus]   = useState<Status>('ready')
  const [results,  setResults]  = useState<Product[]>([])
  const [lastMsg,  setLastMsg]  = useState('')
  const [showDrop, setShowDrop] = useState(false)

  const inputRef    = useRef<HTMLInputElement>(null)
  const lastKeyTime = useRef(0)
  const scanBuffer  = useRef('')
  const scanMode    = useRef(false)   // true when chars are scanner-speed
  const searchTimer = useRef<ReturnType<typeof setTimeout>>()
  const onScanRef   = useRef<(code:string)=>void>(()=>{})

  // ── Keep input focused ────────────────────────────────
  useEffect(() => {
    const focus = () => {
      // Don't steal focus from modals
      if (!document.querySelector('[role="dialog"]')) {
        inputRef.current?.focus()
      }
    }
    focus()
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (!t.closest('button') && !t.closest('input') && !t.closest('select')) {
        setTimeout(focus, 50)
      }
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  // ── Add product to cart ───────────────────────────────
  async function addProduct(product: Product, mode: 'unit'|'bulk' = 'unit') {
    cart.addItem(product, mode)
    const label = mode === 'bulk' && product.bulk_unit
      ? `${product.name} (${product.bulk_unit})`
      : product.name
    const price = mode === 'bulk' ? product.bulk_selling_price : product.selling_price
    setLastMsg(`✓  ${label}  ${sym}${price.toFixed(2)}`)
    setStatus('found')
    setShowDrop(false)
    setValue('')
    scanBuffer.current = ''
    scanMode.current   = false
    beep(true)
    setTimeout(() => { setStatus('ready'); setLastMsg('') }, 2500)
  }

  // ── Handle scanned barcode ────────────────────────────
  const handleBarcode = useCallback(async (code: string) => {
    if (!code.trim() || code.length < 2) return
    setStatus('scanning')
    const r = await window.api.products.findBarcode(code.trim())
    if (r.success && r.data) {
      await addProduct(r.data)
    } else {
      beep(false)
      setLastMsg(`✗ Not found: ${code}`)
      setStatus('notfound')
      addToast('error', `Barcode not found: "${code}". Add it in Inventory.`)
      setTimeout(() => { setStatus('ready'); setLastMsg('') }, 4000)
    }
  }, [])

  onScanRef.current = handleBarcode

  // ── Search products (manual typing) ──────────────────
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

  // ── KEY DETECTION ─────────────────────────────────────
  // Scanner chars arrive < 100ms apart (often 10-50ms)
  // Human typing arrives > 150ms apart
  // We use 100ms as threshold — safe for all scanners
  const SCAN_THRESHOLD_MS = 100

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const now = Date.now()
    const gap = now - lastKeyTime.current
    lastKeyTime.current = now

    // Accumulate into scan buffer if chars are fast
    if (e.key.length === 1 && gap < SCAN_THRESHOLD_MS) {
      scanBuffer.current += e.key
      scanMode.current = true
    }

    if (e.key === 'Enter') {
      e.preventDefault()
      const buf = scanBuffer.current.trim()

      if (scanMode.current && buf.length >= 2) {
        // ── SCANNER path: fire immediately ──
        onScanRef.current(buf)
        scanBuffer.current = ''
        scanMode.current   = false
        setValue('')
        clearTimeout(searchTimer.current)
        setShowDrop(false)
      } else if (results.length > 0) {
        // ── MANUAL path: add first search result ──
        addProduct(results[0])
      } else if (value.trim().length >= 2) {
        // ── FALLBACK: try as barcode ──
        onScanRef.current(value.trim())
        setValue('')
      }
      return
    }

    if (e.key === 'Escape') {
      setValue(''); scanBuffer.current = ''; scanMode.current = false
      setShowDrop(false); setResults([])
      return
    }

    // Arrow keys navigate dropdown
    if (e.key === 'ArrowDown') { e.preventDefault(); /* TODO */ }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v   = e.target.value
    const now = Date.now()
    const gap = now - lastKeyTime.current

    setValue(v)

    // If this char arrived fast — scanner mode, don't search
    if (gap < SCAN_THRESHOLD_MS) {
      scanBuffer.current = v
      scanMode.current   = true
      clearTimeout(searchTimer.current)
      return
    }

    // Human typing — reset scan mode, start search
    scanMode.current   = false
    scanBuffer.current = ''

    clearTimeout(searchTimer.current)
    if (v.trim().length >= 1) {
      searchTimer.current = setTimeout(() => doSearch(v), 280)
    } else {
      setResults([]); setShowDrop(false)
    }
  }

  // ── Status pill ───────────────────────────────────────
  const statusConfig = {
    ready:     { icon: Scan,        spin: false, cls: 'text-green-600 bg-green-50 border-green-200',  label: '🟢  Scan Ready' },
    scanning:  { icon: Loader2,     spin: true,  cls: 'text-blue-600 bg-blue-50 border-blue-200',     label: 'Scanning...' },
    searching: { icon: Loader2,     spin: true,  cls: 'text-blue-600 bg-blue-50 border-blue-200',     label: 'Searching...' },
    found:     { icon: CheckCircle, spin: false, cls: 'text-green-700 bg-green-50 border-green-300',  label: lastMsg },
    notfound:  { icon: XCircle,     spin: false, cls: 'text-red-600 bg-red-50 border-red-200',        label: lastMsg },
  }
  const sc   = statusConfig[status]
  const Icon = sc.icon

  return (
    <div className="bg-white border-b border-slate-200 px-4 py-3 space-y-2.5">
      <div className="flex items-center gap-3">

        {/* ── Main input ── */}
        <div className="relative flex-1">
          <Scan className="absolute left-3.5 top-2.5 w-4 h-4 text-slate-400 pointer-events-none"/>
          <input
            ref={inputRef}
            id="checkout-bar"
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onBlur={() => setTimeout(() => setShowDrop(false), 200)}
            onFocus={() => value && results.length > 0 && setShowDrop(true)}
            placeholder="Scan barcode  ·  or type product name to search"
            className="w-full pl-10 pr-4 py-2.5 border-2 border-slate-200 focus:border-blue-500 rounded-xl text-sm focus:outline-none bg-slate-50 focus:bg-white transition-colors"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />

          {/* Search dropdown */}
          {showDrop && results.length > 0 && (
            <div className="absolute top-full left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-xl mt-1 z-50 overflow-hidden max-h-80 overflow-y-auto">
              {results.map(p => (
                <button key={p.id}
                  onMouseDown={e => { e.preventDefault(); addProduct(p) }}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-blue-50 transition text-left border-b border-slate-50 last:border-0">
                  <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center overflow-hidden">
                    {p.image_data
                      ? <img src={p.image_data} className="w-full h-full object-cover"/>
                      : <span className="text-slate-300 text-xs">IMG</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{p.name}</p>
                    <p className="text-xs text-slate-400">
                      {p.barcode ? <span className="font-mono">{p.barcode} · </span> : ''}
                      {p.stock_qty} {p.unit} in stock
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0 space-y-0.5">
                    <p className="text-sm font-bold text-blue-600">{sym}{p.selling_price.toFixed(2)}<span className="text-xs font-normal text-slate-400">/{p.unit}</span></p>
                    {p.has_bulk_pricing && p.bulk_unit && (
                      <button
                        onMouseDown={e => { e.stopPropagation(); e.preventDefault(); addProduct(p,'bulk') }}
                        className="block text-xs text-amber-600 hover:text-amber-800 hover:underline">
                        {sym}{p.bulk_selling_price?.toFixed(2)}/{p.bulk_unit}
                      </button>
                    )}
                  </div>
                </button>
              ))}
              <div className="px-4 py-2 bg-slate-50 text-xs text-slate-400 flex items-center gap-1">
                <kbd className="bg-white border border-slate-200 rounded px-1.5 py-0.5 font-mono">↵ Enter</kbd>
                adds first result
              </div>
            </div>
          )}
        </div>

        {/* ── Status pill ── */}
        <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold border flex-shrink-0 min-w-[140px] ${sc.cls}`}>
          <Icon className={`w-4 h-4 flex-shrink-0 ${sc.spin ? 'animate-spin' : ''}`}/>
          <span className="truncate">{sc.label}</span>
        </div>
      </div>

      {/* ── Mode hint ── */}
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>
          <span className="font-medium text-slate-500">Scanner:</span> scan barcode → item added instantly
          <span className="mx-2">·</span>
          <span className="font-medium text-slate-500">Manual:</span> type name → pick from dropdown or press Enter
        </span>
        <button
          onClick={() => {
            // Test: simulate a scan event
            const testCode = prompt('Enter barcode to test:')
            if (testCode) onScanRef.current(testCode)
          }}
          className="text-slate-300 hover:text-slate-500 transition">
          test
        </button>
      </div>
    </div>
  )
}
