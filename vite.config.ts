import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { formatBuildVersion } from './src/lib/build-version'

// Versión de la compilación (AAAAMMDDHHmm, America/Lima), fijada al iniciar el build.
const BUILD_VERSION = formatBuildVersion(new Date())

export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD_VERSION__: JSON.stringify(BUILD_VERSION),
  },
  server: {
    port: 5173,
    host: true
  }
})
