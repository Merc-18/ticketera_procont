# FASE 1: saneamiento del repositorio y entorno local

Fecha: 2026-11-17. Directorio: `/home/procont/projects/ticketera-procont`.

## Referencia recuperable del estado inicial

- HEAD inicial: `c6d63af`.
- Respaldo externo: `/home/procont/backups/ticketera-procont/phase1-20261117T152749Z`.
- `history.bundle`: historia y referencias Git; validado con `git bundle verify`.
- `worktree.tar.gz`: bytes y permisos originales de los 74 archivos versionados,
  más el índice, configuración y HEAD originales de Git.
- `manifest.json`: SHA-256 original y normalizado de cada archivo, tamaño y modo.
- `initial.patch` e `initial-status.txt`: diferencias y estado previos.
- Se verificaron los 74 archivos del archivo comprimido contra el manifiesto.
- El respaldo es privado y no se incorpora al repositorio. Conserva también
  material histórico que se ha retirado del árbol actual.

El estado inicial tenía 60 diferencias exclusivamente CRLF/LF respecto del
índice y ninguna diferencia real de contenido ni cambios preparados. Los otros
14 archivos ya tenían CRLF en el índice. Los 74 tenían permisos locales `777`,
aunque Git registraba `100644`. No había archivos nuevos no ignorados ni remotos.

## Cambios realizados

- Permisos `644` para los 74 archivos originales. Ninguno necesita ejecución
  directa: las herramientas se invocan mediante Node/npm y no hay scripts con
  shebang que requieran conservar el bit ejecutable.
- LF para todos los textos y `.gitattributes` con `* text=auto eol=lf`.
  La renormalización del índice incorpora también los 14 archivos cuyo blob
  original contenía CRLF; los binarios quedan sujetos a detección automática.
- `core.filemode=true` en la configuración Git local para detectar futuros
  cambios de ejecución. Esta configuración local no forma parte del commit.
- `.gitignore` cubre todos los nombres `.env*`, salvo `.env.example`.
- `setup.js` lee `.env.example` en lugar de contener URL y clave pública del
  backend anterior. No se ejecutó ni se convierte en instalador soportado.
- README actualizado para WSL, `npm ci`, requisito Node 20+, compilación sin
  credenciales y límites de los scripts históricos.
- Este informe documenta validaciones y pendientes.

No se modificaron fuentes `src/`, SQL, configuración de compilación ni
dependencias por motivos funcionales. Sus cambios, si aparecen en el commit,
son solo de finales de línea. No fue necesario corregir bloqueos TypeScript.

El commit reúne 18 archivos: 14 con CRLF en el índice original (incluido
`setup.js`), README, `.gitignore` y los dos archivos nuevos. Los 60 archivos que
solo tenían CRLF en el árbol local recuperan su representación original LF.

`git diff --cached --check` identifica tres líneas con espacios finales
preexistentes en `useAuth.ts` y `useRequests.ts`. Se compararon con el respaldo
y se conservaron para mantener intacto su contenido. La comprobación adicional
con `core.whitespace=-blank-at-eol` debe finalizar sin errores; no se ha
desactivado permanentemente ninguna regla de Git.

## Instalación y compilación

Entorno utilizado: Node `26.8.2`, npm `11.19.1`.

- `npm ci`: correcto; 209 paquetes instalados, 210 auditados.
- `package-lock.json`: contenido idéntico al inicial después de normalizar LF.
- `npm run build`: correcto, código 0; ejecuta `tsc && vite build`.
- Vite `5.4.21`: 181 módulos transformados; compilación en 1,72 s.
- Artefactos principales: CSS 41,94 kB y JavaScript 997,32 kB
  (296,87 kB comprimidos con gzip).
- `dist/` y `node_modules/` permanecen ignorados.

Avisos no bloqueantes: datos Browserslist antiguos, chunk JavaScript superior a
500 kB y aviso npm sobre la política de scripts de instalación de esbuild.
El build completado valida que esbuild funciona en este entorno. No se
actualizaron dependencias ni se ejecutó `npm audit fix`.

`npm audit --json` devolvió 16 vulnerabilidades: 9 altas, 6 moderadas y 1 baja;
ninguna crítica. Entre las dependencias directas señaladas están `vite`,
`postcss`, `react-router-dom` y `xlsx`. npm no ofrece corrección para `xlsx`
en este árbol y propone un cambio mayor de Vite. Estos resultados no prueban
explotabilidad de cada aviso en esta aplicación. El resultado completo se
conserva en `npm-audit.json` dentro del respaldo externo.

## Integridad y credenciales

La comparación contra el manifiesto inicial normaliza exclusivamente CRLF a LF,
sin ignorar espacios, comentarios ni instrucciones. Las únicas modificaciones
de contenido intencionales en archivos originales son `.gitignore`, `README.md`
y la retirada de configuración incrustada en `setup.js`. Se añaden
`.gitattributes` y este informe. El resto debe coincidir con su SHA-256
normalizado inicial, incluido todo `src/`, SQL y el lockfile.

Solo `.env.example` está versionado y contiene valores de plantilla. No existe
`.env.local` ni se han definido credenciales Supabase en el proceso utilizado.
Se comprobaron las reglas de exclusión para `.env`, `.env.local`,
`.env.production`, `.env.development` y `.env.production.local`.

La búsqueda estática de claves Supabase, JWT y claves privadas en los archivos
versionados detectó la clave pública histórica en `setup.js`, que se retiró;
no detectó claves secretas de esos formatos. No es una garantía exhaustiva de
ausencia de secretos. No se reescribió la historia: la configuración antigua
sigue en commits previos y en el respaldo.

`admin_setup.sql` conserva contraseñas demo conocidas; son datos de prueba
heredados, no credenciales locales configuradas. No se ejecutaron ni se
modificaron scripts SQL. Su retirada y sustitución por un procedimiento seguro
queda pendiente antes de preparar una base de pruebas.

## Referencias heredadas y FASE 2

- El nombre de paquete, textos de interfaz y scripts conservan la identidad
  Ticketera Controlling/Gilat. No se realizó un cambio de marca.
- El origen histórico es `Merc-18/ticketera-controlling`; no hay remoto Git
  configurado. El README deja de indicar que se clone el repositorio original.
- `fix_enable_rls_all_tables.sql` conserva una referencia a un proyecto Supabase
  heredado, distinta de la que contenía `setup.js`; no se utilizó ninguna.
- `setup.js` continúa siendo un generador antiguo, con CommonJS en un paquete
  ESM y capacidad de sobrescribir archivos. No ejecutarlo.
- Faltan esquema base y trigger de numeración. Recuperarlos como definiciones
  de esquema, sin importar datos de producción.
- Corregir RLS, protección de roles/columnas, exposición pública y usuarios
  inactivos antes de conectar un backend independiente de pruebas.
- Corregir numeración, escrituras parciales, idempotencia, errores omitidos y
  diferencias de checklist/SLA entre creación manual y aprobación.
- Revisar dependencias vulnerables en un cambio separado y validar sus efectos.

La compilación es estática: no ejecuta React, no crea el cliente Supabase en un
navegador y no valida autenticación, RLS ni registros. No se inició el servidor,
no se accedió a producción, no se ejecutaron SQL/seeds/setup, ni se realizó
push, merge o despliegue. La fase termina antes de cambios en base de datos.
