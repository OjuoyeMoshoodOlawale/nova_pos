// CheckoutBar.tsx — Unified scanner + name search + bulk/unit chooser
// ─────────────────────────────────────────────────────────
// USB barcode scanners are HID keyboard emulators:
//   chars arrive < 100 ms apart, then Enter fires.
//   Human typing is > 150 ms between keys.
// We handle BOTH in one input — scanner fires addProduct,
// manual typing shows a dropdown with unit AND bulk options.
//
// After a barcode scan, if the product has bulk pricing, we
// show a 4-second choice bar:  [Add as UNIT]  [Add as BULK]
// If neither is chosen within 4 seconds → defaults to UNIT.
// ─────────────────────────────────────────────────────────
import { useState, useRef, useEffect, useCallback } from 'react'
import { Product } from '@shared/types'
import { useCartStore } from '../../store/cartStore'
import { useAppStore }  from '../../store/appStore'
import { Scan, Search, CheckCircle, XCircle, Loader2, Package } from 'lucide-react'

type Status = 'ready' | 'scanning' | 'found' | 'notfound' | 'searching'
type SellMode = 'unit' | 'bulk'

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
  } catch { /* audio unavailable */ }
}

export default function CheckoutBar() {
  const cart              = useCartStore()
  const { addToast, profile } = useAppStore()
  const sym               = profile?.currency_symbol ?? '₦'

  const [value,    setValue]    = useState('')
  const [status,   setStatus]   = useState<Status>('ready')
  const [results,  setResults]  = useState<Product[]>([])
  const [lastMsg,  setLastMsg]  = useState('')
  const [showDrop, setShowDrop] = useState(false)

  // Bulk/unit choice after barcode scan
  const [bulkChoice,    setBulkChoice]    = useState<Product | null>(null)
  const bulkChoiceTimer = useRef<ReturnType<typeof setTimeout>>()

  const inputRef    = useRef<HTMLInputElement>(null)
  const lastKeyTime = useRef(0)
  const fastCharCount = useRef(0)   // consecutive fast keystrokes = scanner burst
  const searchTimer = useRef<ReturnType<typeof setTimeout>>()
  const onScanRef   = useRef<(code: string) => void>(() => {})

  // Keep input focused unless a modal is open
  useEffect(() => {
    const focus = () => {
      if (!document.querySelector('[role="dialog"]')) inputRef.current?.focus()
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

  // Cleanup bulk-choice timer on unmount
  useEffect(() => () => clearTimeout(bulkChoiceTimer.current), [])

  // ── Add to cart ───────────────────────────────────────
  async function addProduct(product: Product, mode: SellMode = 'unit') {
    clearBulkChoice()
    cart.addItem(product, mode)
    const label = mode === 'bulk' && (product as any).bulk_unit
      ? `${product.name} (${(product as any).bulk_unit})`
      : product.name
    const price = mode === 'bulk'
      ? (product as any).bulk_selling_price
      : product.selling_price
    setLastMsg(`✓  ${label}  ${sym}${price?.toFixed(2)}`)
    setStatus('found')
    setShowDrop(false)
    setValue('')
    fastCharCount.current = 0
    beep(true)
    setTimeout(() => { setStatus('ready'); setLastMsg('') }, 2500)
  }

  function clearBulkChoice() {
    clearTimeout(bulkChoiceTimer.current)
    setBulkChoice(null)
  }

  // ── Barcode scan handler ──────────────────────────────
  const handleBarcode = useCallback(async (code: string) => {
    if (!code.trim() || code.length < 2) return
    setStatus('scanning')
    const r = await window.api.products.findBarcode(code.trim())

    if (r.success && r.data) {
      const product = r.data as Product
      const p = product as any
      // pricing_mode: 'unit' | 'both' | 'bulk' (migration 008); fall back to legacy flag.
      const pmode: 'unit' | 'both' | 'bulk' =
        p.pricing_mode ?? (p.has_bulk_pricing && p.bulk_unit ? 'both' : 'unit')

      if (pmode === 'bulk' && p.bulk_unit) {
        // Bulk-only product — no choice needed, add as bulk directly.
        await addProduct(product, 'bulk')
      } else if (pmode === 'both' && p.bulk_unit) {
        // Sells both ways — show the 4-second pcs/bulk chooser.
        setBulkChoice(product)
        clearTimeout(bulkChoiceTimer.current)
        bulkChoiceTimer.current = setTimeout(() => {
          addProduct(product, 'unit')   // default to pcs if no choice made
        }, 4000)
        setStatus('ready')
        setValue('')
        beep(true)
      } else {
        // Unit-only product.
        await addProduct(product, 'unit')
      }
    } else {
      beep(false)
      setLastMsg(`✗ Not found: ${code}`)
      setStatus('notfound')
      addToast('error', `Barcode not found: "${code}". Add it in Inventory.`)
      setTimeout(() => { setStatus('ready'); setLastMsg('') }, 4000)
    }
  }, [])

  onScanRef.current = handleBarcode

  // ── Product name / SKU search ─────────────────────────
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

  // ── Key detection — scanner vs human typing ───────────
  // A USB scanner types the whole barcode in a rapid burst (each keystroke
  // <~30ms apart) and finishes with Enter. A human types far slower.
  //
  // We do NOT try to rebuild the code character-by-character (that loses the
  // first char, whose gap is always large). Instead we read the COMPLETE
  // input value on Enter and decide scan-vs-search by how fast it was entered.
  const SCAN_CHAR_GAP_MS = 35   // typical scanner inter-key gap is 5–20ms

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const now = Date.now()
    const gap = now - lastKeyTime.current
    lastKeyTime.current = now

    // Track whether the burst so far looks machine-fast.
    if (e.key.length === 1) {
      if (gap < SCAN_CHAR_GAP_MS) {
        fastCharCount.current += 1
      } else {
        fastCharCount.current = 0   // a slow keystroke resets the burst
      }
    }

    if (e.key === 'Enter') {
      e.preventDefault()
      const code = value.trim()
      // Treat as a SCAN if the value arrived as a fast burst (scanner) OR
      // the user pressed Enter on a typed code they want to look up directly.
      const looksScanned = fastCharCount.current >= 2

      if (code.length >= 2 && (looksScanned || results.length === 0)) {
        // Direct barcode lookup (scanner, or Enter on a code with no matches)
        onScanRef.current(code)
        setValue('')
        setShowDrop(false)
        clearTimeout(searchTimer.current)
      } else if (results.length > 0) {
        // Enter on a search with visible matches → take the first result
        addProduct(results[0])
        setValue('')
        setShowDrop(false)
      }
      fastCharCount.current = 0
      return
    }

    if (e.key === 'Escape') {
      setValue(''); fastCharCount.current = 0
      setShowDrop(false); setResults([]); clearBulkChoice()
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value
    setValue(v)

    // Live search as the user types (debounced). A scanner finishes with
    // Enter before this fires, so scanned codes never trigger a search.
    clearTimeout(searchTimer.current)
    if (v.trim().length >= 1) {
      searchTimer.current = setTimeout(() => doSearch(v), 250)
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
    <div className="bg-white border-b border-slate-200 px-4 py-3 space-y-2">

      <div className="flex items-center gap-3">
        {/* ── Main input (scanner + name search) ── */}
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            ref={inputRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onBlur={() => setTimeout(() => setShowDrop(false), 200)}
            onFocus={() => value && results.length > 0 && setShowDrop(true)}
            placeholder="Scan barcode  ·  or type product name / SKU to search"
            className="w-full pl-10 pr-4 py-2.5 border-2 border-slate-200 focus:border-blue-500 rounded-xl text-sm focus:outline-none bg-slate-50 focus:bg-white transition-colors"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />

          {/* ── Search dropdown ── */}
          {showDrop && results.length > 0 && (
            <div className="absolute top-full left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-xl mt-1 z-50 overflow-hidden max-h-80 overflow-y-auto">
              {results.map(p => {
                const pp = p as any
                // pricing_mode: 'unit' | 'both' | 'bulk' (migration 008); legacy fallback.
                const pmode: 'unit' | 'both' | 'bulk' =
                  pp.pricing_mode ?? (pp.has_bulk_pricing && pp.bulk_unit ? 'both' : 'unit')
                const hasBulk = (pmode === 'both' || pmode === 'bulk') && !!pp.bulk_unit
                const hasUnit = pmode === 'unit' || pmode === 'both'
                return (
                  <div key={p.id} className="border-b border-slate-50 last:border-0">
                    {/* Unit row — shown unless the product is bulk-only */}
                    {hasUnit && (
                    <button
                      onMouseDown={e => { e.preventDefault(); addProduct(p, 'unit') }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50 transition text-left"
                    >
                      <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center overflow-hidden">
                        {pp.image_data
                          ? <img src={pp.image_data} className="w-full h-full object-cover" />
                          : <Package className="w-4 h-4 text-slate-300" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{p.name}</p>
                        <p className="text-xs text-slate-400">
                          {pp.barcode ? <span className="font-mono">{pp.barcode} · </span> : ''}
                          {p.stock_qty} {p.unit} in stock
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <span className="text-sm font-bold text-blue-600">
                          {sym}{p.selling_price.toFixed(2)}
                          <span className="text-xs font-normal text-slate-400">/{p.unit}</span>
                        </span>
                        {hasBulk && (
                          <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide mt-0.5">
                            tap for {p.unit}
                          </p>
                        )}
                      </div>
                    </button>
                    )}

                    {/* For bulk-only products, show the name header above the bulk row */}
                    {!hasUnit && hasBulk && (
                      <div className="flex items-center gap-3 px-4 pt-2.5 pb-1">
                        <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center overflow-hidden">
                          {pp.image_data
                            ? <img src={pp.image_data} className="w-full h-full object-cover" />
                            : <Package className="w-4 h-4 text-slate-300" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{p.name}</p>
                          <p className="text-xs text-slate-400">Sold by {pp.bulk_unit} only · {p.stock_qty} {p.unit} in stock</p>
                        </div>
                      </div>
                    )}

                    {/* Bulk row */}
                    {hasBulk && (
                      <button
                        onMouseDown={e => { e.stopPropagation(); e.preventDefault(); addProduct(p, 'bulk') }}
                        className="w-full flex items-center justify-between px-4 py-2 bg-amber-50 hover:bg-amber-100 transition text-left"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-base">📦</span>
                          <div>
                            <span className="text-xs font-semibold text-amber-800">
                              Buy by {pp.bulk_unit}
                            </span>
                            <span className="text-xs text-amber-600 ml-2">
                              ({pp.units_per_bulk} {p.unit}s each)
                            </span>
                          </div>
                        </div>
                        <span className="text-sm font-bold text-amber-700">
                          {sym}{pp.bulk_selling_price?.toFixed(2)}
                          <span className="text-xs font-normal text-amber-500">/{pp.bulk_unit}</span>
                        </span>
                      </button>
                    )}
                  </div>
                )
              })}
              <div className="px-4 py-2 bg-slate-50 text-xs text-slate-400 flex items-center gap-1">
                <kbd className="bg-white border border-slate-200 rounded px-1.5 py-0.5 font-mono text-[10px]">↵</kbd>
                adds first result as unit · click bulk row for bulk pricing
              </div>
            </div>
          )}
        </div>

        {/* ── Status pill ── */}
        <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold border flex-shrink-0 min-w-[140px] ${sc.cls}`}>
          <Icon className={`w-4 h-4 flex-shrink-0 ${sc.spin ? 'animate-spin' : ''}`} />
          <span className="truncate">{sc.label}</span>
        </div>
      </div>

      {/* ── Bulk / Unit choice after barcode scan ─────── */}
      {bulkChoice && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-300 rounded-xl px-4 py-2.5 animate-pulse-once">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-900 truncate">{bulkChoice.name}</p>
            <p className="text-xs text-amber-600">This product has bulk pricing — how are they buying?</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => addProduct(bulkChoice, 'unit')}
              className="px-3 py-2 bg-white border-2 border-blue-400 text-blue-700 rounded-lg text-xs font-bold hover:bg-blue-50 transition"
            >
              <div className="text-center">
                <div>UNIT</div>
                <div className="font-normal opacity-70">{sym}{bulkChoice.selling_price.toFixed(2)}/{bulkChoice.unit}</div>
              </div>
            </button>
            <button
              onClick={() => addProduct(bulkChoice, 'bulk')}
              className="px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold transition"
            >
              <div className="text-center">
                <div>📦 BULK</div>
                <div className="font-normal opacity-80">
                  {sym}{(bulkChoice as any).bulk_selling_price?.toFixed(2)}/{(bulkChoice as any).bulk_unit}
                </div>
              </div>
            </button>
            <button onClick={clearBulkChoice} className="text-amber-400 hover:text-amber-700 p-1 text-lg font-bold">×</button>
          </div>
        </div>
      )}

      {/* ── Hint strip ── */}
      {!bulkChoice && (
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>
            <span className="font-medium text-slate-500">Scanner:</span> scan barcode → added instantly
            <span className="mx-2">·</span>
            <span className="font-medium text-slate-500">Manual:</span> type name → dropdown (unit or bulk)
          </span>
        </div>
      )}
    </div>
  )
}
