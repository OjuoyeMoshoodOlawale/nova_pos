// src/renderer/src/App.tsx
import { useEffect, useState } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore }    from './store/authStore'
import { useAppStore }     from './store/appStore'
import ActivationPage      from './pages/Activation/ActivationPage'
import SetupWizard         from './pages/Setup/SetupWizard'
import LoginPage           from './pages/Login/LoginPage'
import DashboardPage       from './pages/Dashboard/DashboardPage'
import POSPage             from './pages/POS/POSPage'
import ProductList         from './pages/Inventory/ProductList'
import SalesHistory        from './pages/Sales/SalesHistory'
import ReportsPage         from './pages/Reports/ReportsPage'
import CustomersPage       from './pages/Customers/CustomersPage'
import SuppliersPage       from './pages/Suppliers/SuppliersPage'
import StaffPage           from './pages/Staff/StaffPage'
import SettingsPage        from './pages/Settings/SettingsPage'
import StockAuditPage     from './pages/Inventory/StockAuditPage'
import MainLayout          from './components/Layout/MainLayout'
import ToastContainer      from './components/ui/ToastContainer'
import LoadingScreen       from './components/ui/LoadingScreen'
import { UserRole }        from '@shared/types'

// ─── Guards ──────────────────────────────────────────────

function RequireAuth({ children, roles }: { children: React.ReactNode; roles?: UserRole[] }) {
  const { isAuthenticated, user } = useAuthStore()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (roles && user && !roles.includes(user.role)) return <Navigate to="/" replace />
  return <>{children}</>
}

// ─── App ─────────────────────────────────────────────────

export default function App() {
  const [booting, setBooting] = useState(true)
  const { activated, setupComplete, setActivated, setSetupComplete, setProfile } = useAppStore()
  const { setSession, clearSession } = useAuthStore()

  useEffect(() => {
    async function boot() {
      try {
        // ── Parallel batch 1: activation + settings (independent reads) ──
        const [actResult, settings] = await Promise.all([
          window.api.activation.getStatus(),
          window.api.settings.getAll(),
        ])

        // Gate: not activated → show activation screen
        if (!actResult.success || !actResult.data?.activated) {
          setActivated(false)
          setBooting(false)
          return
        }
        setActivated(true)

        // Gate: setup not complete → show setup wizard
        if (!settings.success || settings.data?.setup_complete !== 'true') {
          setSetupComplete(false)
          setBooting(false)
          return
        }
        setSetupComplete(true)

        // ── Parallel batch 2: profile + session restore ──────────────
        const savedToken = sessionStorage.getItem('nova_token')
        const [prof, me] = await Promise.all([
          window.api.profile.get(),
          savedToken ? window.api.auth.me(savedToken) : Promise.resolve(null),
        ])

        if (prof.success && prof.data) setProfile(prof.data)

        if (me?.success && me.data) {
          setSession(me.data, savedToken!)
        } else if (savedToken) {
          clearSession()
        }
      } catch (err) {
        console.error('[Boot] Error:', err)
      } finally {
        setBooting(false)
      }
    }
    boot()
  }, [])

  if (booting) return <LoadingScreen />

  return (
    <HashRouter>
      <ToastContainer />
      <Routes>
        {/* ── Activation ── */}
        <Route path="/activate" element={
          activated ? <Navigate to={setupComplete ? '/login' : '/setup'} replace /> : <ActivationPage />
        }/>

        {/* ── Setup Wizard ── */}
        <Route path="/setup" element={
          !activated ? <Navigate to="/activate" replace /> :
          setupComplete ? <Navigate to="/login" replace /> :
          <SetupWizard />
        }/>

        {/* ── Login ── */}
        <Route path="/login" element={
          !activated ? <Navigate to="/activate" replace /> :
          !setupComplete ? <Navigate to="/setup" replace /> :
          <LoginPage />
        }/>

        {/* ── App pages (auth required) ── */}
        <Route path="/" element={
          <RequireAuth><MainLayout /></RequireAuth>
        }>
          <Route index element={<DashboardPage />} />
          <Route path="pos"        element={<POSPage />} />
          <Route path="inventory"  element={<ProductList />} />
          <Route path="stock-audit" element={<RequireAuth roles={['admin','manager']}><StockAuditPage /></RequireAuth>} />
          <Route path="sales"      element={<SalesHistory />} />
          <Route path="reports"    element={<RequireAuth roles={['admin','manager']}><ReportsPage /></RequireAuth>} />
          <Route path="customers"  element={<CustomersPage />} />
          <Route path="suppliers"  element={<RequireAuth roles={['admin','manager']}><SuppliersPage /></RequireAuth>} />
          <Route path="staff"      element={<RequireAuth roles={['admin']}><StaffPage /></RequireAuth>} />
          <Route path="settings"   element={<RequireAuth roles={['admin']}><SettingsPage /></RequireAuth>} />
        </Route>

        {/* ── Fallback ── */}
        <Route path="*" element={
          <Navigate to={!activated ? '/activate' : !setupComplete ? '/setup' : '/'} replace />
        }/>
      </Routes>
    </HashRouter>
  )
}
