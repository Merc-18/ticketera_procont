import ModalFocus from '../ui/ModalFocus'
import { useState } from 'react'
import type { User } from '../../types/database.types'
import Icon from '../ui/Icon'
import ControlLabel from '../ui/ControlLabel'

type RoleOption = 'superadmin' | 'admin' | 'developer' | 'viewer'

interface Props {
  user?: User
  currentUserRole: RoleOption
  currentUserId?: string
  onClose: () => void
  onCreate?: (data: { email: string; password: string; full_name: string; role: RoleOption }) => Promise<{ sessionLost: boolean }>
  onUpdate?: (userId: string, data: { full_name?: string; role?: RoleOption; is_active?: boolean }) => Promise<void>
}

const ALL_ROLES: { value: RoleOption; label: string; desc: string; color: string }[] = [
  { value: 'superadmin', label: 'Superadmin', desc: 'Control total del sistema, único que puede gestionar admins', color: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
  { value: 'admin',      label: 'Admin',      desc: 'Gestión de proyectos, solicitudes y usuarios',                 color: 'bg-red-100 text-red-800 border-red-200' },
  { value: 'developer',  label: 'Usuario',    desc: 'Gestión de proyectos, actualizar fases y progreso',            color: 'bg-brand-100 text-brand-800 border-brand-200' },
  { value: 'viewer',     label: 'Viewer',     desc: 'Solo lectura: puede ver proyectos y dashboard',                color: 'bg-gray-100 text-gray-700 border-gray-200' },
]

export default function UserModal({ user, currentUserRole, currentUserId, onClose, onCreate, onUpdate }: Props) {
  const isEdit      = !!user
  const isSuperAdmin = currentUserRole === 'superadmin'

  // Roles disponibles según quien edita
  const availableRoles = isSuperAdmin
    ? ALL_ROLES
    : ALL_ROLES.filter(r => r.value === 'developer' || r.value === 'viewer')

  const defaultRole: RoleOption = user?.role ?? 'developer'

  const [fullName, setFullName] = useState(user?.full_name ?? '')
  const [email,    setEmail]    = useState(user?.email ?? '')
  const [password, setPassword] = useState('')
  const [role,     setRole]     = useState<RoleOption>(defaultRole)
  const [isActive, setIsActive] = useState(user?.is_active !== false)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!fullName.trim()) { setError('El nombre es requerido'); return }
    if (!isEdit && !email.trim()) { setError('El email es requerido'); return }
    if (!isEdit && (password.length < 12 || password.length > 128)) { setError('La contraseña debe tener entre 12 y 128 caracteres'); return }

    setSaving(true)
    setError(null)
    try {
      if (isEdit && onUpdate && user) {
        await onUpdate(user.id, { full_name: fullName.trim(), role, is_active: isActive })
        onClose()
      } else if (!isEdit && onCreate) {
        const result = await onCreate({ email: email.trim(), password, full_name: fullName.trim(), role })
        if (!result.sessionLost) onClose()
      }
    } catch (err: any) {
      setError(err.message ?? 'Error al guardar usuario')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Administrar usuario" className="modal-panel bg-white rounded-xl max-w-lg w-full shadow-xl" onClick={e => e.stopPropagation()}>
        <ModalFocus onDismiss={onClose} />

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-xl font-bold text-gray-900">
            <ControlLabel icon={isEdit ? 'edit' : 'plus'}>{isEdit ? 'Editar usuario' : 'Nuevo usuario'}</ControlLabel>
          </h2>
          <button aria-label="Cerrar" onClick={onClose} className="text-gray-600 hover:text-gray-900 hover:bg-gray-100"><Icon name="close" size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Nombre */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre completo *</label>
            <input
              type="text"
              value={fullName}
              disabled={isEdit && user?.id !== currentUserId}
              title={isEdit && user?.id !== currentUserId ? "Solo el titular puede editar su nombre" : undefined}
              onChange={e => setFullName(e.target.value)}
              placeholder="Ej: María García"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              autoFocus
            />
          </div>

          {/* Email (solo creación) */}
          {!isEdit && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="usuario@empresa.com"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          )}

          {/* Contraseña (solo creación) */}
          {!isEdit && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña *</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Entre 12 y 128 caracteres"
                autoComplete="new-password"
                maxLength={128}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          )}

          {/* Rol */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Rol *</label>
            <div className="space-y-2">
              {availableRoles.map(r => (
                <label
                  key={r.value}
                  className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition ${
                    role === r.value ? 'border-primary bg-brand-50' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="role"
                    value={r.value}
                    checked={role === r.value}
                    onChange={() => setRole(r.value)}
                    className="mt-0.5 accent-primary"
                  />
                  <div>
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold border ${r.color} mr-2`}>
                      {r.label}
                    </span>
                    <span className="text-xs text-gray-500">{r.desc}</span>
                  </div>
                </label>
              ))}
            </div>
            {!isSuperAdmin && (
              <p className="text-xs text-gray-400 mt-2">
                <Icon name="lock" size={14} className="inline-block mr-1 -mt-0.5" />Solo un Superadmin puede asignar roles Admin o Superadmin
              </p>
            )}
          </div>

          {/* Activo / Inactivo (solo edición) */}
          {isEdit && (
            <div className="flex items-center justify-between bg-gray-50 rounded-lg p-3 border">
              <div>
                <p className="text-sm font-medium text-gray-700">Estado del usuario</p>
                <p className="text-xs text-gray-500">Los usuarios inactivos no pueden iniciar sesión</p>
              </div>
              <button
                type="button"
                onClick={() => setIsActive(v => !v)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  isActive ? 'bg-green-700' : 'bg-gray-300'
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  isActive ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Aviso creación */}
          {!isEdit && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 text-xs text-yellow-800">
              <strong>Nota:</strong> la cuenta se crea con el correo confirmado y queda activa con el rol
              elegido. Verifica la identidad de la persona y entrégale la contraseña por un canal aprobado.
            </div>
          )}

          {/* Acciones */}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition">
              Cancelar
            </button>
            <button type="submit" disabled={saving} className="px-5 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition">
              {saving ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear usuario'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
