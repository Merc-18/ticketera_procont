import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import Toaster from './components/ui/Toaster'
import BuildVersion from './components/ui/BuildVersion'
import InteractionMode from './components/ui/InteractionMode'
import './index.css'
import { configurationError } from './lib/supabase'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <InteractionMode />
    <a className="skip-link" href="#main-content">Saltar al contenido</a>
    <ErrorBoundary>
      {configurationError ? (
        <div role="alert" className="max-w-xl mx-auto p-8 text-red-800">
          <h1 className="text-xl font-semibold mb-3">Configuración pendiente</h1>
          <p>{configurationError}</p>
          <p className="mt-3">Revisa .env.example y reinicia Vite después de configurar .env.local.</p>
        </div>
      ) : <App />}
      <Toaster />
    </ErrorBoundary>
    {/* Versión de la compilación al pie de todas las pantallas (incluida la de error). */}
    <BuildVersion />
  </React.StrictMode>,
)
