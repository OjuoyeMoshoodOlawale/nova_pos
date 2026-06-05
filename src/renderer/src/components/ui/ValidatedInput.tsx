// src/renderer/src/components/ui/ValidatedInput.tsx
import { forwardRef } from 'react'
import { AlertCircle } from 'lucide-react'

interface Props extends React.InputHTMLAttributes<HTMLInputElement> {
  label?:   string
  error?:   string
  hint?:    string
  prefix?:  string
  suffix?:  string
}

const ValidatedInput = forwardRef<HTMLInputElement, Props>(
  ({ label, error, hint, prefix, suffix, className = '', ...rest }, ref) => (
    <div className="space-y-1">
      {label && <label className="label">{label}</label>}
      <div className="relative">
        {prefix && (
          <span className="absolute left-3 top-2.5 text-slate-400 text-sm pointer-events-none">{prefix}</span>
        )}
        <input
          ref={ref}
          {...rest}
          className={`input ${prefix ? 'pl-7' : ''} ${suffix ? 'pr-10' : ''} ${error ? 'border-red-400 focus:ring-red-400' : ''} ${className}`}
        />
        {suffix && (
          <span className="absolute right-3 top-2.5 text-slate-400 text-sm pointer-events-none">{suffix}</span>
        )}
      </div>
      {error && (
        <p className="flex items-center gap-1.5 text-xs text-red-600 font-medium">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0"/>
          {error}
        </p>
      )}
      {hint && !error && (
        <p className="text-xs text-slate-400">{hint}</p>
      )}
    </div>
  )
)
ValidatedInput.displayName = 'ValidatedInput'
export default ValidatedInput
