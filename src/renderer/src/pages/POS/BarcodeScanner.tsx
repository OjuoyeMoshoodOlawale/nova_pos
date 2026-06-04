// src/renderer/src/pages/POS/BarcodeScanner.tsx
// ─────────────────────────────────────────────────────────
// USB barcode scanners act as keyboards — they send characters
// FAST (< 50ms apart) followed by an Enter key.
// Human typing is SLOW (> 100ms between keystrokes).
//
// This hook listens globally (even when inputs are focused)
// and fires onScan() only when it detects scanner-speed input.
// ─────────────────────────────────────────────────────────
import { useEffect, useRef } from 'react'

const SCAN_SPEED_MS   = 50   // chars faster than this = scanner
const MIN_SCAN_LENGTH = 3    // ignore accidental 1-2 char scans

export function useBarcodeScanner(onScan: (code: string) => void) {
  const buffer  = useRef('')
  const lastKey = useRef(0)
  const onScanRef = useRef(onScan)
  onScanRef.current = onScan  // keep latest callback without re-running effect

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const now = Date.now()
      const gap = now - lastKey.current
      lastKey.current = now

      // Gap too long — not a scanner sequence, reset buffer
      if (gap > 300) {
        buffer.current = ''
      }

      if (e.key === 'Enter') {
        const code = buffer.current.trim()
        buffer.current = ''

        // Only fire if the full buffer came in at scanner speed
        if (code.length >= MIN_SCAN_LENGTH) {
          // Prevent the Enter from submitting forms or triggering buttons
          e.preventDefault()
          e.stopPropagation()
          onScanRef.current(code)
        }
        return
      }

      // Only accumulate printable single characters
      if (e.key.length === 1) {
        // If chars are coming in at scanner speed, accumulate
        // If they're slow (human typing in a search box), ignore
        if (gap <= SCAN_SPEED_MS || buffer.current.length > 0) {
          buffer.current += e.key
        }
      }
    }

    // capture: true so we intercept before any input handler
    window.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true })
  }, [])  // runs once, uses ref for callback
}
