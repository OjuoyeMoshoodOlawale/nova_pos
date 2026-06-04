// src/renderer/src/store/authStore.ts
import { create } from 'zustand'
import { SessionUser } from '@shared/types'

interface AuthState {
  user:  SessionUser | null
  token: string | null
  isAuthenticated: boolean
  isDev: boolean

  setSession: (user: SessionUser, token: string) => void
  clearSession: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user:  null,
  token: null,
  isAuthenticated: false,
  isDev: false,

  setSession(user, token) {
    // Persist token in sessionStorage so a renderer refresh doesn't log out
    sessionStorage.setItem('nova_token', token)
    set({
      user,
      token,
      isAuthenticated: true,
      isDev: user.username === 'nova.support',
    })
  },

  clearSession() {
    sessionStorage.removeItem('nova_token')
    set({ user: null, token: null, isAuthenticated: false, isDev: false })
  },
}))
