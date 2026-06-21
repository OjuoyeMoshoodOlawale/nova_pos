// src/renderer/src/App.tsx
import { useEffect, useState, lazy, Suspense } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore }    from './store/authStore'
import { useAppStore }     from './store/appStore'
// ── Lazy-loaded pages ──────────────────────────────────
// Only the page the user navigates to gets loaded. This cuts
// initial bundle parse time dramatically — the browser doesn't
// need to parse POSPage, Recharts, etc. until they're needed.
const ActivationPage = lazy(() => import('./pages/Activation/ActivationPage'))
const SetupWizard    = lazy(() => import('./pages/Setup/SetupWizard'))
const LoginPage      = lazy(() => import('./pages/Login/LoginPage'))
const DashboardPage  = lazy(() => import('./pages/Dashboard/DashboardPage'))
const POSPage        = lazy(() => import('./pages/POS/POSPage'))
const ProductList    = lazy(() => import('./pages/Inventory/ProductList'))
const SalesHistory   = lazy(() => import('./pages/Sales/SalesHistory'))
const ReportsPage    = lazy(() => import('./pages/Reports/ReportsPage'))
const CustomersPage  = lazy(() => import('./pages/Customers/CustomersPage'))
const SuppliersPage  = lazy(() => import('./pages/Suppliers/SuppliersPage'))
const StaffPage      = lazy(() => import('./pages/Staff/StaffPage'))
const SettingsPage   = lazy(() => import('./pages/Settings/SettingsPage'))
const StockAuditPage = lazy(() => import('./pages/Inventory/StockAuditPage'))
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
      <Suspense fallback={
        <div className="flex items-center justify-center h-screen bg-slate-50">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }>
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
      </Suspense>
    </HashRouter>
  )
}
