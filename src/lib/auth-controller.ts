import type { Session, SupabaseClient } from '@supabase/supabase-js'
import type { User } from '../types/database.types.ts'
import { loadActiveProfile } from './access.ts'
import { errorMessage } from './supabase-errors.ts'

export function createAuthController(client: Pick<SupabaseClient, 'auth' | 'from'>) {
  let snapshot: { user: User | null; loading: boolean; error: string | null } = { user: null, loading: true, error: null }
  const listeners = new Set<() => void>()
  let started = false
  let generation = 0
  let eventSequence = 0
  let pending: { id: string; promise: Promise<User | null> } | undefined
  function publish(next: typeof snapshot) { snapshot = next; listeners.forEach(listener => listener()) }
  async function sync(session: Session | null): Promise<User | null> {
    if (session?.user.id && pending?.id === session.user.id) return pending.promise
    const version = ++generation
    if (!session) { pending = undefined; publish({ user: null, loading: false, error: null }); return null }
    // Revalidating the same identity must not unmount forms or lose retry keys.
    const previous = snapshot.user?.id === session.user.id ? snapshot.user : null
    publish({ user: previous, loading: !previous, error: null })
    const promise = loadActiveProfile(client, session.user.id).then(user => {
      if (version === generation) publish({ user, loading: false, error: null })
      return version === generation ? user : null
    }).catch(error => {
      if (version === generation) publish({ user: null, loading: false, error: errorMessage(error) })
      return null
    }).finally(() => { if (version === generation) pending = undefined })
    pending = { id: session.user.id, promise }
    return promise
  }
  function start() {
    if (started) return
    started = true
    const initialVersion = generation
    const initialEvent = eventSequence
    client.auth.onAuthStateChange((_event, session) => {
      // Never await a Supabase query inside its Auth callback.
      const event = ++eventSequence
      if (!session) { void sync(null); return }
      queueMicrotask(() => { if (event === eventSequence) void sync(session) })
    })
    void client.auth.getSession().then(({ data, error }) => {
      if (generation !== initialVersion || eventSequence !== initialEvent) return
      if (error) publish({ user: null, loading: false, error: errorMessage(error) })
      else void sync(data.session)
    }).catch(error => {
      if (generation === initialVersion && eventSequence === initialEvent) {
        publish({ user: null, loading: false, error: errorMessage(error) })
      }
    })
  }
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); start(); return () => { listeners.delete(listener) } },
    async signIn(email: string, password: string) {
      const { data, error } = await client.auth.signInWithPassword({ email, password })
      if (error) throw new Error(errorMessage(error))
      const profile = await sync(data.session)
      if (!profile) {
        const message = snapshot.error ?? 'No se pudo validar el perfil activo.'
        const { error: signOutError } = await client.auth.signOut()
        if (signOutError) throw new Error(`${message} No se pudo cerrar la sesión; vuelve a intentarlo.`)
        throw new Error(message)
      }
    },
    async signOut() {
      const { error } = await client.auth.signOut()
      if (error) throw new Error(errorMessage(error))
      await sync(null)
    },
  }
}
