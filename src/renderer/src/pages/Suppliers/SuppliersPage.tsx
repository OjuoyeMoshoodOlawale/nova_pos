import { useState, useEffect } from 'react'
import { Supplier } from '@shared/types'
import { useAppStore } from '../../store/appStore'
import DataTable, { Column } from '../../components/DataTable/DataTable'
import { Plus, Edit2, Archive, X } from 'lucide-react'

export default function SuppliersPage(){
  const {addToast}=useAppStore()
  const [suppliers,setSuppliers]=useState<Supplier[]>([])
  const [loading,setLoading]=useState(true)
  const [showForm,setShowForm]=useState(false)
  const [editing,setEditing]=useState<Supplier|null>(null)
  const [d,setD]=useState({name:'',contact:'',phone:'',email:'',address:'',notes:''})
  const [saving,setSaving]=useState(false)

  async function load(){setLoading(true);const r=await window.api.suppliers.getAll();if(r.success)setSuppliers(r.data);setLoading(false)}
  useEffect(()=>{load()},[])
  function openForm(s?:Supplier){setEditing(s||null);setD(s?{name:s.name,contact:s.contact||'',phone:s.phone||'',email:s.email||'',address:s.address||'',notes:s.notes||''}:{name:'',contact:'',phone:'',email:'',address:'',notes:''});setShowForm(true)}
  async function save(){
    if(!d.name){addToast('error','Name required');return}
    setSaving(true)
    const r=editing?await window.api.suppliers.update(editing.id,d):await window.api.suppliers.create(d)
    setSaving(false)
    if(r.success){addToast('success',editing?'Updated':'Added');setShowForm(false);load()}else addToast('error',r.error||'Failed')
  }

  const cols: Column<Supplier>[]=[
    {key:'name',label:'Supplier',render:s=><div><p className="font-medium">{s.name}</p><p className="text-xs text-slate-400">{s.contact||''}</p></div>},
    {key:'phone',label:'Phone',render:s=><span className="text-sm">{s.phone||'—'}</span>},
    {key:'email',label:'Email',render:s=><span className="text-sm">{s.email||'—'}</span>},
    {key:'address',label:'Address',render:s=><span className="text-xs text-slate-400 truncate max-w-[150px] block">{s.address||'—'}</span>},
  ]

  return(
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Suppliers</h1><p className="text-sm text-slate-500">{suppliers.length} suppliers</p></div>
        <button onClick={()=>openForm()} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4"/> Add Supplier</button>
      </div>
      <DataTable columns={cols} data={suppliers} isLoading={loading} searchKeys={['name','phone','email']} searchPlaceholder="Search suppliers..." emptyText="No suppliers."
        actions={s=><div className="flex gap-1"><button onClick={()=>openForm(s)} className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg"><Edit2 className="w-4 h-4"/></button><button onClick={async()=>{if(confirm(`Archive ${s.name}?`)){const r=await window.api.suppliers.archive(s.id);if(r.success){addToast('success','Archived');load()}}}} className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg"><Archive className="w-4 h-4"/></button></div>}
      />
      {showForm&&(<div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"><div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm"><div className="flex justify-between px-6 py-4 border-b"><h2 className="font-bold">{editing?'Edit Supplier':'Add Supplier'}</h2><button onClick={()=>setShowForm(false)}><X className="w-5 h-5 text-slate-400"/></button></div><div className="p-6 space-y-4">{[['name','Name *','text'],['contact','Contact Person','text'],['phone','Phone','tel'],['email','Email','email'],['address','Address','text'],['notes','Notes','text']].map(([k,l,t])=><div key={k}><label className="label">{l}</label><input className="input" type={t} value={(d as any)[k]} onChange={e=>setD((p:any)=>({...p,[k]:e.target.value}))}/></div>)}<div className="flex gap-3"><button onClick={()=>setShowForm(false)} className="btn-secondary flex-1">Cancel</button><button onClick={save} disabled={saving} className="btn-primary flex-1">{saving?'Saving...':editing?'Update':'Add'}</button></div></div></div></div>)}
    </div>
  )
}
