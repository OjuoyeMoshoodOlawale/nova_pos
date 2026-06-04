import { useAppStore } from '../../store/appStore'
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react'
const ICONS = { success: CheckCircle, error: XCircle, warning: AlertTriangle, info: Info }
const COLORS = { success:'bg-green-500', error:'bg-red-500', warning:'bg-amber-500', info:'bg-blue-500' }
export default function ToastContainer() {
  const { toasts, removeToast } = useAppStore()
  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 pointer-events-none">
      {toasts.map(t => {
        const Icon = ICONS[t.type]
        return (
          <div key={t.id} className={`pointer-events-auto flex items-center gap-3 ${COLORS[t.type]} text-white px-4 py-3 rounded-xl shadow-lg max-w-sm animate-fade-in`}>
            <Icon className="w-4 h-4 flex-shrink-0"/>
            <span className="text-sm font-medium flex-1">{t.message}</span>
            <button onClick={()=>removeToast(t.id)} className="opacity-80 hover:opacity-100"><X className="w-4 h-4"/></button>
          </div>
        )
      })}
    </div>
  )
}
