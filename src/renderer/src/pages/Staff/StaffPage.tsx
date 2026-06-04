import { useState, useEffect } from 'react'
import { User } from '@shared/types'
import { useAppStore } from '../../store/appStore'
import DataTable, { Column } from '../../components/DataTable/DataTable'
import { Plus, Edit2, UserX, Eye, EyeOff, X } from 'lucide-react'

export default function StaffPage(){
  const {addToast}=useAppStore()
  const [staff,setStaff]=useState<User[]>([])
  const [loading,setLoading]=useState(true)
  const [showForm,setShowForm]=useState(false)
  const [editing,setEditing]=useState<User|null>(null)
  const [d,setD]=useState({full_name:'',username:'',password:'',role:'cashier' as any,pin:''})
  const [show,setShow]=useState(false)
  const [saving,setSaving]=useState(false)

  async function load(){setLoading(true);const r=await window.api.staff.getAll();if(r.success)setStaff(r.data);setLoading(false)}
  useEffect(()=>{load()},[])

  function openForm(u?:User){setEditing(u||null);setD(u?{full_name:u.full_name,username:u.username,password:'',role:u.role,pin:''}:{full_name:'',username:'',password:'',role:'cashier',pin:''});setShowForm(true)}

  async function save(){
    if(!d.full_name||!d.username){addToast('error','Name and username required');return}
    if(!editing&&!d.password){addToast('error','Password required for new staff');return}
    setSaving(true)
    let r:any
    if(editing) r=await window.api.staff.update(editing.id,{full_name:d.full_name,role:d.role,pin:d.pin||undefined})
    else r=await window.api.staff.create({full_name:d.full_name,username:d.username,password:d.password,role:d.role,pin:d.pin||undefined})
    setSaving(false)
    if(r.success){addToast('success',editing?'Staff updated':'Staff added');setShowForm(false);load()}else addToast('error',r.error||'Failed')
  }

  async function deactivate(u:User){
    if(!confirm(`Deactivate ${u.full_name}?`))return
    const r=await window.api.staff.deactivate(u.id)
    if(r.success){addToast('success','Staff deactivated');load()}else addToast('error',r.error||'Failed')
  }

  const cols: Column<User>[]=[
    {key:'full_name',label:'Name',render:u=><div><p className="font-medium">{u.full_name}</p><p className="text-xs text-slate-400">@{u.username}</p></div>},
    {key:'role',label:'Role',render:u=><span className={`badge ${u.role==='admin'?'bg-purple-100 text-purple-700':u.role==='manager'?'bg-blue-100 text-blue-700':'bg-slate-100 text-slate-700'} capitalize`}>{u.role}</span>},
    {key:'is_active',label:'Status',render:u=><span className={`badge ${u.is_active?'bg-green-100 text-green-700':'bg-red-100 text-red-700'}`}>{u.is_active?'Active':'Inactive'}</span>},
    {key:'created_at',label:'Added',render:u=><span className="text-xs text-slate-400">{new Date(u.created_at).toLocaleDateString()}</span>},
  ]

  return(
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-slate-800">Staff Management</h1><p className="text-sm text-slate-500">{staff.filter(s=>s.is_active).length} active staff</p></div>
        <button onClick={()=>openForm()} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4"/> Add Staff</button>
      </div>
      <DataTable columns={cols} data={staff} isLoading={loading} searchKeys={['full_name','username','role']} searchPlaceholder="Search staff..." emptyText="No staff records."
        actions={u=><div className="flex gap-1"><button onClick={()=>openForm(u)} className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg"><Edit2 className="w-4 h-4"/></button>{u.is_active&&<button onClick={()=>deactivate(u)} className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg"><UserX className="w-4 h-4"/></button>}</div>}
      />
      {showForm&&(
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex justify-between px-6 py-4 border-b"><h2 className="font-bold">{editing?'Edit Staff':'Add Staff'}</h2><button onClick={()=>setShowForm(false)}><X className="w-5 h-5 text-slate-400"/></button></div>
            <div className="p-6 space-y-4">
              <div><label className="label">Full Name *</label><input className="input" value={d.full_name} onChange={e=>setD(p=>({...p,full_name:e.target.value}))}/></div>
              {!editing&&<div><label className="label">Username *</label><input className="input" value={d.username} onChange={e=>setD(p=>({...p,username:e.target.value.toLowerCase().replace(/\s/g,'')}))} placeholder="lowercase, no spaces"/></div>}
              {!editing&&<div><label className="label">Password *</label><div className="relative"><input className="input pr-9" type={show?'text':'password'} value={d.password} onChange={e=>setD(p=>({...p,password:e.target.value}))}/><button type="button" onClick={()=>setShow(s=>!s)} className="absolute right-3 top-2.5 text-slate-400">{show?<EyeOff className="w-4 h-4"/>:<Eye className="w-4 h-4"/>}</button></div></div>}
              <div><label className="label">Role</label><select className="input" value={d.role} onChange={e=>setD(p=>({...p,role:e.target.value as any}))}><option value="cashier">Cashier</option><option value="manager">Manager</option><option value="admin">Admin</option></select></div>
              <div><label className="label">PIN (optional, for quick login)</label><input className="input" type="password" maxLength={6} value={d.pin} onChange={e=>setD(p=>({...p,pin:e.target.value.replace(/\D/g,'')}))} placeholder="4-6 digits"/></div>
              <div className="flex gap-3"><button onClick={()=>setShowForm(false)} className="btn-secondary flex-1">Cancel</button><button onClick={save} disabled={saving} className="btn-primary flex-1">{saving?'Saving...':editing?'Update':'Add Staff'}</button></div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
