// src/renderer/src/store/appStore.ts
import { create } from 'zustand'
import { BusinessProfile } from '@shared/types'

type Toast = { id: string; type: 'success' | 'error' | 'info' | 'warning'; message: string }

interface AppState {
  activated: boolean
  setupComplete: boolean
  profile: BusinessProfile | null
  toasts: Toast[]

  setActivated: (v: boolean) => void
  setSetupComplete: (v: boolean) => void
  setProfile: (p: BusinessProfile) => void
  addToast: (type: Toast['type'], message: string) => void
  removeToast: (id: string) => void
}

export const useAppStore = create<AppState>((set) => ({
  activated: false,
  setupComplete: false,
  profile: null,
  toasts: [],

  setActivated:     (v) => set({ activated: v }),
  setSetupComplete: (v) => set({ setupComplete: v }),
  setProfile:       (p) => set({ profile: p }),

  addToast(type, message) {
    const id = Date.now().toString()
    set((s) => ({ toasts: [...s.toasts, { id, type, message }] }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4500)
  },

  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))
