/**
 * Pie con la versión exacta de la compilación desplegada («Versión AAAAMMDDHHmm», America/Lima).
 * El valor lo incrusta Vite al compilar; no depende de la hora del navegador ni de servicios.
 * Va en el flujo normal del documento (no fijo), por lo que nunca cubre botones, formularios
 * ni tablas.
 */
export default function BuildVersion() {
  return (
    <footer data-testid="build-version" className="build-version text-xs text-center py-2 px-4 select-all">
      Versión {__BUILD_VERSION__}
    </footer>
  )
}
