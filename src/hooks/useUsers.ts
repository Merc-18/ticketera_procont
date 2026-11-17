import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { operations } from '../lib/api'
import { errorMessage, requireData } from '../lib/supabase-errors'
import { useAuth } from './useAuth'
import { canEdit, canManageProfile } from '../lib/access'
import type { User } from '../types/database.types'

export function useUsers() {
  const { user: actor } = useAuth()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const loadUsers = useCallback(async () => {
    if (!actor?.is_active) { setUsers([]); setLoading(false); return }
    setLoading(true)
    setError(null)
    try {
      const result = await supabase.from('users').select('*').order('full_name')
      if (result.error) throw result.error
      setUsers(result.data || [])
    } catch (err) { setUsers([]); setError(errorMessage(err)) }
    finally { setLoading(false) }
  }, [actor?.id, actor?.is_active])
  useEffect(() => { void loadUsers() }, [loadUsers])

  const createUser = async (_data: { email: string; password: string; full_name: string; role: User['role'] }): Promise<{ sessionLost: boolean }> => {
    throw new Error('La creación de cuentas requiere el backend de administración Auth. No está habilitada desde este navegador.')
  }
  const deleteUser = async (_id: string) => {
    throw new Error('La eliminación de cuentas requiere el backend de administración Auth. Utiliza la desactivación.')
  }
  const updateUser = async (id: string, updates: { full_name?: string; role?: User['role']; is_active?: boolean }) => {
    const target = users.find(item => item.id === id)
    if (!target || !actor) throw new Error('Actualiza la lista de usuarios antes de continuar.')
    const nameChanged = updates.full_name !== undefined && updates.full_name !== target.full_name
    const permissionsChanged = (updates.role !== undefined && updates.role !== target.role) ||
      (updates.is_active !== undefined && updates.is_active !== target.is_active)
    if (nameChanged && id !== actor.id) throw new Error('Solo puedes editar el nombre de tu propio perfil.')
    if (permissionsChanged && !canManageProfile(actor, target)) throw new Error('No tienes permiso para administrar este perfil.')
    if (nameChanged && permissionsChanged) throw new Error('Guarda el nombre y los permisos en operaciones separadas.')
    if (nameChanged) requireData(await supabase.from('users').update({ full_name: updates.full_name })
      .eq('id', id).select('id').single(), 'Perfil')
    if (permissionsChanged) await operations.adminUpdateUser(id, updates.role ?? target.role, updates.is_active ?? target.is_active)
    await loadUsers()
  }
  const activeUsers = users.filter(item => item.is_active)
  return { users, activeUsers, assignableUsers: activeUsers.filter(canEdit), loading, error,
    reload: loadUsers, createUser, updateUser, deleteUser }
}
