// src/renderer/src/pages/Setup/SetupWizard.tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore }  from '../../store/appStore'
import {
  Building2, Percent, UserCog, Mail,
  Receipt, Printer, Package, Network, HardDrive,
  ChevronRight, ChevronLeft, CheckCircle,
} from 'lucide-react'

// Step components (defined inline for brevity; split to steps/ folder in prod)
import StepBusinessProfile from './steps/BusinessProfile'
import StepTaxConfig       from './steps/TaxConfig'
import StepCreateAdmin     from './steps/CreateAdmin'
import StepEmailConfig     from './steps/EmailConfig'
import StepReceiptCustom   from './steps/ReceiptCustom'
import StepHardware        from './steps/HardwareSetup'
import StepOpeningStock    from './steps/OpeningStock'
import StepNetwork         from './steps/NetworkSetup'
import StepBackup          from './steps/BackupSetup'

const STEPS = [
  { id: 1,  label: 'Business',      icon: Building2,  component: StepBusinessProfile },
  { id: 2,  label: 'Tax',           icon: Percent,    component: StepTaxConfig       },
  { id: 3,  label: 'Admin Account', icon: UserCog,    component: StepCreateAdmin     },
  { id: 4,  label: 'Email / SMTP',  icon: Mail,       component: StepEmailConfig     },
  { id: 5,  label: 'Receipt',       icon: Receipt,    component: StepReceiptCustom   },
  { id: 6,  label: 'Printer',       icon: Printer,    component: StepHardware        },
  { id: 7,  label: 'Opening Stock', icon: Package,    component: StepOpeningStock    },
  { id: 8,  label: 'Network',       icon: Network,    component: StepNetwork         },
  { id: 9,  label: 'Backup',        icon: HardDrive,  component: StepBackup          },
]

export default function SetupWizard() {
  const navigate = useNavigate()
  const { setSetupComplete, setProfile, addToast } = useAppStore()
  const [current, setCurrent] = useState(0)
  const [completing, setCompleting] = useState(false)

  const step = STEPS[current]
  const isLast = current === STEPS.length - 1
  const StepComponent = step.component

  async function handleNext() {
    if (isLast) {
      await finishSetup()
    } else {
      setCurrent((c) => c + 1)
    }
  }

  async function finishSetup() {
    setCompleting(true)
    await window.api.settings.set('setup_complete', 'true')
    const prof = await window.api.profile.get()
    if (prof.success && prof.data) setProfile(prof.data)
    setSetupComplete(true)
    addToast('success', 'Setup complete! Welcome to NovaPOS.')
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-blue-950 flex">
      {/* Left sidebar — step navigation */}
      <aside className="w-64 bg-slate-950/70 backdrop-blur border-r border-white/10 p-6 flex flex-col">
        <div className="mb-8">
          <h1 className="text-xl font-bold text-white">NovaPOS</h1>
          <p className="text-sm text-slate-400">Setup Wizard</p>
        </div>
        <nav className="space-y-1 flex-1">
          {STEPS.map((s, i) => {
            const Icon = s.icon
            const done   = i < current
            const active = i === current
            return (
              <button
                key={s.id}
                onClick={() => i < current && setCurrent(i)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all
                  ${active ? 'bg-blue-600 text-white' : done ? 'text-green-400 hover:bg-white/5' : 'text-slate-500'}`}
              >
                {done
                  ? <CheckCircle className="w-4 h-4 flex-shrink-0" />
                  : <Icon className="w-4 h-4 flex-shrink-0" />}
                <span className={active ? 'font-medium' : ''}>{s.label}</span>
              </button>
            )
          })}
        </nav>
        <div className="mt-6 text-xs text-slate-600">
          Step {current + 1} of {STEPS.length}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-auto">
        <div className="flex-1 p-8 max-w-2xl mx-auto w-full">
          <div className="bg-white rounded-2xl shadow-xl p-8 min-h-[480px] flex flex-col">
            <h2 className="text-xl font-bold text-slate-800 mb-1">{step.label}</h2>
            <p className="text-sm text-slate-500 mb-6">
              {current === 0 && 'Tell us about your business so we can configure the app for you.'}
              {current === 1 && 'Configure taxes applied to your sales.'}
              {current === 2 && 'Create the main administrator account.'}
              {current === 3 && 'Set up email to receive reports and send receipts.'}
              {current === 4 && 'Customise what appears on printed receipts.'}
              {current === 5 && 'Select your receipt printer.'}
              {current === 6 && 'Enter your existing inventory to start with the right stock levels.'}
              {current === 7 && 'Connect multiple computers over your local network (optional).'}
              {current === 8 && 'Schedule automatic data backups (optional but recommended).'}
            </p>

            <div className="flex-1">
              <StepComponent onNext={handleNext} />
            </div>

            {/* Navigation */}
            <div className="flex justify-between pt-6 border-t border-slate-100 mt-6">
              <button
                onClick={() => setCurrent((c) => Math.max(0, c - 1))}
                disabled={current === 0}
                className="flex items-center gap-2 px-4 py-2 text-slate-500 hover:text-slate-800 disabled:opacity-0 transition"
              >
                <ChevronLeft className="w-4 h-4" /> Back
              </button>
              <button
                onClick={handleNext}
                disabled={completing}
                className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition"
              >
                {isLast ? (completing ? 'Finishing...' : 'Finish Setup') : 'Continue'}
                {!isLast && <ChevronRight className="w-4 h-4" />}
                {isLast && <CheckCircle className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
