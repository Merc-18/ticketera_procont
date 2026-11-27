# Publicación del cierre documental — 27/11/2026

**Dictamen final: APROBADO CON OBSERVACIONES.**

## Integración selectiva

- Se conserva `94b23290e19d8c8b1d445b3964657a799ea1368f` como primer commit documental sobre la base funcional `406a46351411fdf845a73a811cb798b7964617b1`.
- Se recupera únicamente la actualización sin commit de `CLAUDE.md` realizada por Claude en el checkout original `integration/board-operations`. Se mantienen sus hallazgos y se reconcilian afirmaciones documentales superadas. [Procedencia y hash del archivo fuente](claude-recovery-provenance.json).
- No se fusiona esa rama antigua ni el archivo histórico `0f353de`. Las variantes históricas de código, datos y capturas permanecen en su bundle local.
- La copia independiente escribible usa main y origin de GitHub. Se verifica el diff completo desde origin/main, limitado a AGENTS.md, CLAUDE.md, README.md y docs/. El árbol funcional y los datos ficticios permanecen iguales a la base `406a463`.

## Publicación y verificación

El usuario autoriza expresamente el **push normal a main** y el despliegue automático Vercel resultante. Esta autorización sustituye la restricción de publicación local del primer cierre; no autoriza código nuevo, cambios de Supabase ni cambios de datos. Se confirma al finalizar que origin/main coincide con HEAD y que GitHub registra el SHA final y su check Vercel. El recibo local `PUBLICATION_RECEIPT.json`, fuera del commit, conserva esos identificadores sin introducir una referencia circular al SHA del propio documento.

No se repiten pruebas ni se ejecutan migraciones. La revisión previa a publicar comprende solamente diff, correspondencia de archivos, enlaces documentales nuevos, hashes y metadatos Git. Vercel SUCCESS acredita el despliegue y no sustituye pruebas E2E.

## Observaciones que continúan abiertas

1. Login real con proveedores Quipu/QuipuFac y sus contratos oficiales de producción.
2. UI alojada con los cuatro perfiles internos activos y operaciones completas de tablero/M20.
3. Transferencias binarias usando reservas reales de Ticketera, límites y vínculo con actor.
4. Recepción E2E de eventos PostgreSQL Realtime y actualización real de Dashboard por requests.
5. Configuración operativa Auth, SMTP/invitaciones, protecciones/plan de Vercel y seis SKIP históricos.
6. Permisos de la carpeta original: su `.git` permanece de solo lectura, con archivos y material histórico conservados. No se fuerza su sincronización ni se elimina contenido local.

Los **17 PASS de ChatGPT** siguen atribuidos a evidencia externa de SQL/RPC de producción con BEGIN/ROLLBACK, no a Codex ni a pruebas E2E. Las **22 migraciones** se conservan con la confirmación previa; no se consulta ni modifica Supabase durante esta publicación. [Estado vigente](../../PROJECT_STATUS.md) y [reporte completo](REPORT.md).
