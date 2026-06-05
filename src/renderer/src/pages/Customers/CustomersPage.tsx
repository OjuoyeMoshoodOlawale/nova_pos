import { useState, useEffect } from 'react'
import { useAppStore } from '../../store/appStore'
import DataTable, { Column } from '../../components/DataTable/DataTable'
import { Plus, Edit2, X, History } from 'lucide-react'

interface Customer { id:number; full_name:string; phone:string|null; email:string|null; address:string|null; notes:string|null; balance:number; price_group_id:number|null; price_group_name?:string; group_discount?:number; created_at:string }
interface PriceGroup { id:number; name:string; discount_pct:number; color:string }

export default function CustomersPage() {
  const { addToast, profile } = useAppStore()
  const sym = profile?.currency_symbol ?? '₦'
  const [customers, setCustomers] = useState<Customer[]>([])
  const [groups,    setGroups]    = useState<PriceGroup[]>([])
  const [loading,   setLoading]   = useState(true)
  const [showForm,  setShowForm]  = useState(false)
  const [editing,   setEditing]   = useState<Customer|null>(null)
  const [history,   setHistory]   = useState<any[]|null>(null)
  const [histName,  setHistName]  = useState('')
  const [saving,    setSaving]    = useState(false)
  const [d, setD] = useState({ full_name:'', phone:'', email:'', address:'', notes:'', price_group_id: null as number|null })

  async function load() {
    setLoading(true)
    const [r, g] = await Promise.all([window.api.customers.getAll(), window.api.customers.priceGroups()])
    if (r.success) setCustomers(r.data)
    if (g.success) setGroups(g.data)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  function openForm(c?: Customer) {
    setEditing(c || null)
    setD(c
      ? { full_name: c.full_name, phone: c.phone||'', email: c.email||'', address: c.address||'', notes: c.notes||'', price_group_id: c.price_group_id||null }
      : { full_name: '', phone: '', email: '', address: '', notes: '', price_group_id: null }
    )
    setShowForm(true)
  }

  async function save() {
    if (!d.full_name) { addToast('error', 'Name required'); return }
    setSaving(true)
    const r = editing
      ? await window.api.customers.update(editing.id, d)
      : await window.api.customers.create(d)
    setSaving(false)
    if (r.success) { addToast('success', editing ? 'Updated' : 'Added'); setShowForm(false); load() }
    else addToast('error', r.error || 'Failed')
  }

  async function viewHistory(c: Customer) {
    const r = await window.api.customers.history(c.id)
    if (r.success) { setHistory(r.data); setHistName(c.full_name) }
  }

  const cols: Column<Customer>[] = [
    { key: 'full_name', label: 'Customer', render: c => (
      <div>
        <p className="font-medium">{c.full_name}</p>
        <p className="text-xs text-slate-400">{c.phone || c.email || 'No contact'}</p>
      </div>
    )},
    { key: 'price_group_name', label: 'Group', render: (c: any) => c.price_group_name && c.price_group_name !== 'Walk-in'
      ? <span className="badge bg-green-100 text-green-700 text-xs">{c.price_group_name}{c.group_discount > 0 ? ` -${c.group_discount}%` : ''}</span>
      : <span className="text-xs text-slate-400">Walk-in</span>
    },
    { key: 'phone', label: 'Phone', render: c => <span className="text-sm">{c.phone || '—'}</span> },
    { key: 'balance', label: 'Balance', render: c => (
      <span className={`font-medium ${c.balance > 0 ? 'text-red-600' : c.balance < 0 ? 'text-green-600' : 'text-slate-500'}`}>
        {sym}{c.balance.toFixed(2)}
      </span>
    )},
  ]

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Customers</h1>
          <p className="text-sm text-slate-500">{customers.length} records</p>
        </div>
        <button onClick={() => openForm()} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4"/> Add Customer
        </button>
      </div>

      {/* Price group legend */}
      {groups.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {groups.map(g => (
            <span key={g.id} className="text-xs px-3 py-1 rounded-full border font-medium" style={{borderColor: g.color, color: g.color}}>
              {g.name}{g.discount_pct > 0 ? ` −${g.discount_pct}%` : ''}
            </span>
          ))}
        </div>
      )}

      <DataTable
        columns={cols} data={customers} isLoading={loading}
        searchKeys={['full_name','phone','email']} searchPlaceholder="Search customers..." emptyText="No customers."
        actions={c => (
          <div className="flex gap-1">
            <button onClick={() => viewHistory(c)} className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg" title="History"><History className="w-4 h-4"/></button>
            <button onClick={() => openForm(c)} className="p-1.5 text-slate-400 hover:text-green-600 rounded-lg"><Edit2 className="w-4 h-4"/></button>
          </div>
        )}
      />

      {/* Add / Edit modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex justify-between px-6 py-4 border-b">
              <h2 className="font-bold">{editing ? 'Edit Customer' : 'Add Customer'}</h2>
              <button onClick={() => setShowForm(false)}><X className="w-5 h-5 text-slate-400"/></button>
            </div>
            <div className="p-6 space-y-3">
              {[
                ['full_name','Full Name *','text'],
                ['phone','Phone','tel'],
                ['email','Email','email'],
                ['address','Address','text'],
                ['notes','Notes','text'],
              ].map(([k,l,t]) => (
                <div key={k}>
                  <label className="label">{l}</label>
                  <input className="input" type={t} value={(d as any)[k]}
                    onChange={e => setD(p => ({...p, [k]: e.target.value}))}/>
                </div>
              ))}

              <div>
                <label className="label">Price Group</label>
                <select className="input" value={d.price_group_id ?? ''}
                  onChange={e => setD(p => ({...p, price_group_id: e.target.value ? Number(e.target.value) : null}))}>
                  <option value="">Walk-in (standard price)</option>
                  {groups.map(g => (
                    <option key={g.id} value={g.id}>
                      {g.name}{g.discount_pct > 0 ? ` (−${g.discount_pct}% off)` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowForm(false)} className="btn-secondary flex-1">Cancel</button>
                <button onClick={save} disabled={saving} className="btn-primary flex-1">
                  {saving ? 'Saving...' : editing ? 'Update' : 'Add'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Purchase history modal */}
      {history && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between px-6 py-4 border-b sticky top-0 bg-white">
              <h2 className="font-bold">{histName} — Purchase History</h2>
              <button onClick={() => setHistory(null)}><X className="w-5 h-5 text-slate-400"/></button>
            </div>
            <div className="p-6">
              {history.length === 0
                ? <p className="text-center py-8 text-slate-400 text-sm">No purchases yet.</p>
                : (
                  <table className="w-full text-sm">
                    <thead><tr className="border-b">{['Receipt','Date','Total','Status'].map(h => <th key={h} className="pb-2 text-left text-xs text-slate-500">{h}</th>)}</tr></thead>
                    <tbody className="divide-y divide-slate-50">
                      {history.map((s: any) => (
                        <tr key={s.id}>
                          <td className="py-2 font-mono text-xs text-blue-600">{s.receipt_no}</td>
                          <td className="py-2 text-xs">{new Date(s.sale_date).toLocaleDateString()}</td>
                          <td className="py-2 font-medium">{sym}{s.total_amount.toFixed(2)}</td>
                          <td className="py-2">
                            <span className={`badge ${s.status==='completed' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{s.status}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
