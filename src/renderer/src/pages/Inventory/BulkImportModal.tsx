import { useState, useRef } from 'react'
import { useAuthStore } from '../../store/authStore'
import { useAppStore } from '../../store/appStore'
import { X, Upload, FileText, CheckCircle, AlertCircle } from 'lucide-react'

interface Props { onClose:()=>void; onSaved:()=>void }
export default function BulkImportModal({onClose, onSaved}: Props) {
  const {user} = useAuthStore()
  const {addToast} = useAppStore()
  const [rows, setRows] = useState<any[]>([])
  const [result, setResult] = useState<{imported:number;skipped:number;errors:any[]}|null>(null)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  function downloadTemplate() {
    const headers = ['name','sku','barcode','category','unit','cost_price','selling_price','stock_qty','reorder_level','bulk_unit','units_per_bulk','bulk_buying_price','bulk_selling_price']
    const example = ['Indomie Noodles 70g','INDO-001','6001234567890','Food','pcs',150,250,100,20,'carton',40,5500,9000]
    const csv = [headers.join(','), example.join(',')].join('\n')
    const blob = new Blob([csv], {type:'text/csv'})
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'novapos_import_template.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const Papa = (await import('papaparse')).default
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete(r) { setRows(r.data as any[]); setResult(null) }
    })
  }

  async function doImport() {
    if (!user || rows.length===0) return
    setSaving(true)
    const mapped = rows.map(r=>({
      name: r.name||r.Name||r.product_name||'',
      sku: r.sku||r.SKU||undefined,
      barcode: r.barcode||r.Barcode||undefined,
      category: r.category||r.Category||undefined,
      unit: r.unit||r.Unit||'pcs',
      cost_price: parseFloat(r.cost_price||r['Cost Price']||0),
      selling_price: parseFloat(r.selling_price||r.price||r.Price||0),
      stock_qty: parseFloat(r.stock_qty||r.qty||r.Qty||0),
      reorder_level: parseFloat(r.reorder_level||5),
    }))
    const r = await window.api.products.bulkImport(mapped, user.id)
    setSaving(false)
    if (r.success) { setResult(r.data); if(r.data.imported>0) addToast('success',`${r.data.imported} products imported`) }
    else addToast('error', r.error||'Import failed')
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-bold">Bulk Import Products</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-slate-400"/></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex justify-end mb-2">
            <button onClick={downloadTemplate} className="btn-secondary text-xs flex items-center gap-1.5 py-1.5">
              ⬇ Download CSV Template
            </button>
          </div>
          <div onClick={()=>fileRef.current?.click()} className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition">
            <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2"/>
            <p className="font-medium text-slate-700">Click to upload CSV or Excel file</p>
            <p className="text-xs text-slate-400 mt-1">Required column: name · Optional: sku, barcode, category, cost_price, selling_price, stock_qty, unit</p>
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} className="hidden"/>
          </div>

          {rows.length>0 && !result && (
            <div>
              <p className="text-sm text-slate-700 mb-2 font-medium">{rows.length} rows found. Preview:</p>
              <div className="overflow-x-auto rounded-lg border border-slate-200 max-h-48">
                <table className="text-xs w-full">
                  <thead className="bg-slate-50"><tr>{Object.keys(rows[0]).map(k=><th key={k} className="px-3 py-2 text-left text-slate-500 whitespace-nowrap">{k}</th>)}</tr></thead>
                  <tbody className="divide-y divide-slate-50">
                    {rows.slice(0,5).map((r,i)=><tr key={i}>{Object.values(r).map((v:any,j)=><td key={j} className="px-3 py-1.5 text-slate-700 truncate max-w-[100px]">{v}</td>)}</tr>)}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-slate-400 mt-1">{rows.length>5?`Showing 5 of ${rows.length} rows`:''}</p>
              <button onClick={doImport} disabled={saving} className="w-full btn-primary mt-3">{saving?'Importing...':'Import All Rows'}</button>
            </div>
          )}

          {result && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-green-700 bg-green-50 rounded-lg p-3"><CheckCircle className="w-5 h-5 flex-shrink-0"/><span><strong>{result.imported}</strong> products imported</span></div>
              {result.skipped>0&&<div className="flex items-center gap-2 text-amber-700 bg-amber-50 rounded-lg p-3"><AlertCircle className="w-5 h-5 flex-shrink-0"/><span><strong>{result.skipped}</strong> rows skipped</span></div>}
              {result.errors.slice(0,3).map((e:any,i:number)=><p key={i} className="text-xs text-red-600">Row {e.row}: {e.reason}</p>)}
              <div className="flex gap-3 pt-2">
                <button onClick={onClose} className="btn-secondary flex-1">Close</button>
                <button onClick={()=>{onSaved();onClose()}} className="btn-primary flex-1">Done</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
