// src/renderer/src/components/Layout/MainLayout.tsx
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore }  from '../../store/authStore'
import { useAppStore }   from '../../store/appStore'
import {
  LayoutDashboard, ShoppingCart, Package, BarChart3,
  Users, Truck, UserCog, Settings, LogOut,
  ShieldAlert, Wifi, ClipboardCheck,
} from 'lucide-react'

const NAV = [
  { to: '/',          icon: LayoutDashboard, label: 'Dashboard',  roles: ['admin','manager','cashier'] },
  { to: '/pos',       icon: ShoppingCart,   label: 'POS Register',roles: ['admin','manager','cashier'] },
  { to: '/inventory', icon: Package,        label: 'Inventory',   roles: ['admin','manager'] },
  { to: '/stock-audit', icon: ClipboardCheck, label: 'Stock Audit', roles: ['admin','manager'] },
  { to: '/sales',     icon: BarChart3,      label: 'Sales',       roles: ['admin','manager','cashier'] },
  { to: '/reports',   icon: BarChart3,      label: 'Reports',     roles: ['admin','manager'] },
  { to: '/customers', icon: Users,          label: 'Customers',   roles: ['admin','manager','cashier'] },
  { to: '/suppliers', icon: Truck,          label: 'Suppliers',   roles: ['admin','manager'] },
  { to: '/staff',     icon: UserCog,        label: 'Staff',       roles: ['admin'] },
  { to: '/settings',  icon: Settings,       label: 'Settings',    roles: ['admin'] },
]

export default function MainLayout() {
  const navigate = useNavigate()
  const { user, token, clearSession, isDev } = useAuthStore()
  const { profile } = useAppStore()

  async function logout() {
    if (token) await window.api.auth.logout(token)
    clearSession()
    navigate('/login')
  }

  const allowedNav = NAV.filter((n) => user && n.roles.includes(user.role))

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* ── Sidebar ─────────────────────────────────────── */}
      <aside className="w-56 bg-slate-900 flex flex-col flex-shrink-0">
        {/* Logo */}
        <div className="px-4 py-5 border-b border-slate-700/50">
          <h1 className="text-lg font-bold text-white truncate">{profile?.name ?? 'NovaPOS'}</h1>
          <p className="text-xs text-slate-500 capitalize">{profile?.type ?? 'pos'}</p>
        </div>

        {/* Dev warning banner */}
        {isDev && (
          <div className="mx-3 mt-3 bg-amber-500/20 border border-amber-500/40 rounded-lg px-3 py-2 flex items-center gap-2">
            <ShieldAlert className="w-3 h-3 text-amber-400 flex-shrink-0" />
            <span className="text-xs text-amber-300">Developer Mode</span>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 py-3 overflow-y-auto space-y-0.5 px-2">
          {allowedNav.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all
                 ${isActive
                   ? 'bg-blue-600 text-white font-medium'
                   : 'text-slate-400 hover:text-white hover:bg-slate-800'}`
              }
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User footer */}
        <div className="p-3 border-t border-slate-700/50">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
              {user?.full_name?.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-white truncate">{user?.full_name}</p>
              <p className="text-xs text-slate-500 capitalize">{user?.role}</p>
            </div>
            <button onClick={logout} title="Log out" className="text-slate-500 hover:text-red-400 transition">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────── */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
