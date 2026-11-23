import { Navigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'

interface Props {
  children: React.ReactNode
  requiredRole?: 'superadmin' | 'admin' | 'developer' | 'viewer'
}

export default function ProtectedRoute({ children, requiredRole }: Props) {
  const { user, loading, error } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando...</p>
        </div>
      </div>
    )
  }

  if (error) return <div role="alert" className="p-8 text-red-700">{error} <a href="/login" className="underline">Iniciar sesión</a></div>
  if (!user?.is_active) {
    return <Navigate to="/portal" replace />
  }

  if (requiredRole && user.role !== requiredRole && user.role !== 'superadmin') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="bg-white p-8 rounded-lg shadow-lg text-center">
          <h2 className="text-2xl font-bold text-red-700 mb-2">Acceso Denegado</h2>
          <p className="text-gray-600">No tienes permisos para acceder a esta página.</p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
