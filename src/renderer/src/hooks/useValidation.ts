// src/renderer/src/hooks/useValidation.ts
// Reusable field validation for all forms

export interface ValidationRule {
  required?:    boolean
  min?:         number
  max?:         number
  integer?:     boolean     // no decimal allowed
  noNegative?:  boolean     // must be >= 0
  positive?:    boolean     // must be > 0
  maxDecimals?: number      // e.g. 2 for currency
  label?:       string
}

export type ValidationErrors = Record<string, string>

export function validateField(value: unknown, rule: ValidationRule): string | null {
  const label = rule.label || 'This field'
  const num   = typeof value === 'number' ? value : parseFloat(String(value ?? ''))

  if (rule.required && (value === null || value === undefined || value === '' || (typeof value === 'number' && isNaN(value)))) {
    return `${label} is required`
  }

  if (value === '' || value === null || value === undefined) return null

  if (typeof value === 'number' || typeof value === 'string') {
    if (isNaN(num)) return `${label} must be a number`

    if (rule.noNegative && num < 0) return `${label} cannot be negative`
    if (rule.positive  && num <= 0) return `${label} must be greater than zero`
    if (rule.min !== undefined && num < rule.min) return `${label} must be at least ${rule.min}`
    if (rule.max !== undefined && num > rule.max) return `${label} cannot exceed ${rule.max}`

    if (rule.integer && !Number.isInteger(num)) {
      return `${label} must be a whole number (no decimals)`
    }

    if (rule.maxDecimals !== undefined) {
      const str = String(num)
      const dec = str.includes('.') ? str.split('.')[1].length : 0
      if (dec > rule.maxDecimals) {
        return `${label} can have at most ${rule.maxDecimals} decimal place${rule.maxDecimals!==1?'s':''}`
      }
    }
  }

  return null
}

export function validate(
  values: Record<string, unknown>,
  rules:  Record<string, ValidationRule>
): { errors: ValidationErrors; isValid: boolean } {
  const errors: ValidationErrors = {}
  for (const [key, rule] of Object.entries(rules)) {
    const err = validateField(values[key], rule)
    if (err) errors[key] = err
  }
  return { errors, isValid: Object.keys(errors).length === 0 }
}

// ── Helper components ─────────────────────────────────────
export function fieldError(errors: ValidationErrors, field: string): string | undefined {
  return errors[field]
}
