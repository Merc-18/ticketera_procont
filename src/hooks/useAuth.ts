import { useSyncExternalStore } from 'react'
import { supabase } from '../lib/supabase'
import { createAuthController } from '../lib/auth-controller'

const auth = createAuthController(supabase)
export function useAuth() {
  const state = useSyncExternalStore(auth.subscribe, auth.getSnapshot)
  return {
    ...state, signIn: auth.signIn, signOut: auth.signOut,
    isSuperAdmin: state.user?.role === 'superadmin',
    isAdmin: state.user?.role === 'admin' || state.user?.role === 'superadmin',
    isDeveloper: state.user?.role === 'developer',
    isViewer: state.user?.role === 'viewer',
  }
}
