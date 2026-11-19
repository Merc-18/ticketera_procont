// Token opaco de la sesión de cliente: solo en sessionStorage (pestaña actual).
// Nunca se guarda la contraseña ni datos de la empresa; todo lo demás se pide al servidor.
// Si el almacenamiento no está disponible (modo privado, bloqueado) la sesión vive en memoria.

const KEY = 'ticketera.client.session'
let memory: string | null = null

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
const storage = (): StorageLike | null => {
  try { return typeof sessionStorage === 'undefined' ? null : sessionStorage } catch { return null }
}

export function createClientSessionStore(getStorage: () => StorageLike | null = storage) {
  return {
    get(): string | null {
      try { return getStorage()?.getItem(KEY) ?? memory } catch { return memory }
    },
    set(token: string) {
      memory = token
      try { getStorage()?.setItem(KEY, token) } catch { /* queda en memoria */ }
    },
    clear() {
      memory = null
      try { getStorage()?.removeItem(KEY) } catch { /* nada que limpiar */ }
    },
  }
}

export const clientSessionStore = createClientSessionStore()
