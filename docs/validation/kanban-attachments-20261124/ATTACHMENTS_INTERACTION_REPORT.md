# Adjuntos: seleccionar, arrastrar o pegar

Componente: `src/components/requests/AttachmentPicker.tsx`. Filtro común: `src/lib/attachment-intake.ts`. Se usa en el formulario de creación del cliente (`PublicRequestForm`) y en las evidencias internas del ticket (`EvidenceSection`). Ambos conservan su flujo de envío.

## 1. Contrato inspeccionado (sin cambios)

| Regla | Valor | Fuente |
|---|---|---|
| Archivos por ticket | 4 | `attachment-prep.ts` `MAX_ATTACHMENTS`, `contracts/ticket-security-client.mjs` `MAX_ATTACHMENT_FILES`, RPC de reserva (`n>=4`) |
| Total combinado | 2.500.000 bytes | `MAX_TOTAL_BYTES`, `MAX_ATTACHMENT_TOTAL_BYTES`, reserva (`reserved+legacy+size>2500000`) |
| Máximo por archivo | 2.500.000 bytes | `storage.buckets.file_size_limit` (migración 20261118000500) |
| Imagen de origen | ≤ 25 MB antes de comprimir | `MAX_SOURCE_IMAGE_BYTES` |
| Extensiones | `.png .jpg .jpeg .webp .gif .pdf .txt .csv .xlsx .xls .docx .doc` | `ATTACHMENT_ACCEPT`, que se movió de `attachments.ts` a `attachment-intake.ts` y se reexporta con el mismo valor |
| MIME | Los 11 de `allowed_mime_types` del bucket | Migración 20261118000400 |
| Inferencia de MIME | La misma tabla por extensión que el adaptador | `contracts/ticket-security-client.mjs` `metadata()` |
| Compresión | Solo imágenes PNG/JPEG/WEBP/BMP, y solo si se excede el total | `prepareAttachments` (sin cambios) |
| Reserva y subida | `client_reserve_attachments` / `reserve_board_evidence`, una reserva por lote y luego una subida por archivo, sin `upsert` | `attachment-delivery.ts` (sin cambios) |

No se modificaron Supabase, SQL, migraciones, RPC, RLS, Storage, Edge Functions, sesiones ni contratos. `git diff e653138 -- supabase contracts` está vacío.

## 2. Tres orígenes, un filtro

`screenIncoming(existentes, entrantes)` revisa en este orden **formato → tamaño → duplicado → cantidad**:

- **Formato**: la extensión debe estar en `ATTACHMENT_ACCEPT` y el MIME (declarado o inferido) en la lista del bucket. Si el navegador informa un MIME no permitido, se rechaza. Es lo mismo que haría el servidor.
- **Tamaño**: un documento o un GIF de más de 2.500.000 bytes se rechaza, porque no se comprime y nunca cabría. Una imagen comprimible se acepta hasta 25 MB y la comprime `prepareAttachments`.
- **Duplicado**: por **contenido**, con el tamaño y el SHA-256 de WebCrypto. Si no hay WebCrypto, se usa nombre y tamaño. Detecta el mismo archivo elegido dos veces, el mismo archivo con otro nombre y repeticiones dentro de un mismo lote. Si el nombre coincide, el mensaje dice «ya está en la lista»; si no, «tiene el mismo contenido que «X»».
- **Cantidad**: nunca hay más de 4 en la lista. Si sobran, se explica cuáles quedaron fuera.

Lo rechazado no entra en la lista. El total combinado y la compresión siguen en `prepareAttachments`, sin cambios, y su error se muestra como antes (`role="alert"`).

## 3. Portapapeles (Ctrl/Cmd + V)

- La zona tiene foco propio (`tabIndex=0`, `role="group"`). El evento `paste` se escucha en la zona, así que funciona con el foco en la zona, en «Seleccionar archivos» o en un botón «Quitar». Pegar en los campos de texto del formulario no se intercepta.
- Solo se leen **archivos reales** que expone `ClipboardEvent.clipboardData`: primero `files`, luego los `items` con `kind === 'file'`. Varios elementos entran juntos. Nunca se lee `text/plain`.
- Una imagen pegada sin nombre propio (los navegadores la llaman `image.png`) recibe el nombre `captura-AAAAMMDD-HHMMSS.png`. Los bytes no cambian; solo cambia el nombre.
- **Si el portapapeles solo trae texto o una ruta** (algunos navegadores no exponen los archivos copiados desde el explorador): no se crea ningún archivo y se muestra «El portapapeles no contiene archivos que el navegador pueda leer. Si copiaste un archivo desde tu carpeta y tu navegador no lo permite, arrástralo aquí o usa «Seleccionar archivos»».
- La instrucción visible es «Puedes arrastrar tus archivos aquí o pegarlos con **Ctrl + V**». En macOS/iOS dice **Cmd + V**.

## 4. Arrastrar y soltar

- Solo se activa si el arrastre trae archivos (`dataTransfer.types` incluye `Files`). Texto, enlaces y tarjetas del tablero (que usan eventos de puntero) no la activan.
- **Arrastre activo**: borde sólido de acción, tinte, halo de 4 px, icono relleno y el texto «Suelta los archivos para añadirlos». Un contador de entradas evita el parpadeo al pasar sobre elementos hijos. Al salir, la zona vuelve al reposo.
- **Soltar en la zona**: se añaden los archivos válidos y se explican los rechazados.
- **Soltar fuera de la zona**: `dragover` y `drop` se cancelan en `window` solo para arrastres con archivos. El navegador no abre el archivo, el formulario no cambia y aparece «Suelta los archivos dentro de la zona de adjuntos para añadirlos».

## 5. Lista de pendientes

Cada fila muestra: miniatura (solo PNG/JPEG/WEBP/GIF, con `URL.createObjectURL`, que se libera al quitar, reiniciar o desmontar) o una pastilla con la extensión, nombre (truncado, con `title`), tipo, tamaño (original → comprimido si aplica), «Pegado» si vino del portapapeles, estado («Lista», «Comprimida», «Preparando…», «Enviando…», «Revisa el límite») y «Quitar» (44 × 44). Debajo van el total, la barra de uso y el conteo «n de 4 archivos». Al quitar, el foco vuelve a la zona y se anuncia «Se quitó «X»».

**Sin cargas automáticas**: nada se sube al añadir. La prueba comprueba que no hay subidas antes de enviar y que, al enviar, hay **1 creación, 1 reserva del lote y 3 subidas (una por archivo, sin repetir)** para 3 archivos de los tres orígenes.

## 6. Estados de interacción

| Estado | Cómo se ve | Captura (claro/oscuro; 1440/390/320) |
|---|---|---|
| Zona vacía | Borde discontinuo, tinte suave, icono, instrucción, ayuda con límites y formatos, botón | `despues-adjuntos-vacio-*` (antes: `antes-adjuntos-vacio-*`) |
| Hover | Puntero fino: el borde pasa a color de acción y el tinte se intensifica | — (CSS `@media (hover:hover)`) |
| Foco | Anillo de 2 px y borde sólido | Prueba «teclado» |
| Arrastre activo | Borde sólido, halo e icono relleno; «Suelta los archivos…» | `despues-adjuntos-drag-activo-*` |
| Archivo añadido | Fila nueva y aviso verde «Se añadió…» | `despues-adjuntos-portapapeles-*` |
| Duplicado / no permitido | Aviso rojo con el motivo y el nombre; no entra en la lista | `despues-adjuntos-archivos-y-errores-*` |
| Límite superado | «Llegaste al máximo de 4 archivos», botón deshabilitado, aviso de los que quedaron fuera | `despues-adjuntos-limite-*` |
| Tamaño excedido | «… pesa 2.60 MB y supera el máximo de 2.50 MB. Los documentos no se comprimen.» | `despues-adjuntos-tamano-excedido-*` |
| Eliminación | Aviso «Se quitó…»; el foco vuelve a la zona | Prueba «arrastrar…» |
| Preparación | «Preparando…» por fila y «Optimizando imágenes…» en el total | — |
| Carga | `sending`: la zona queda atenuada y de solo lectura, cada fila dice «Enviando…» y el total dice «Enviando adjuntos con la solicitud…». Los botones «Quitar» se deshabilitan. | — |
| Error | Error de preparación (`role=alert`, sin cambios). Error de entrega: aviso existente del recibo con «Reintentar adjuntos» (sin cambios) | — |
| Éxito | Recibo: «Se adjuntaron N archivos a la solicitud.» (nuevo, `role=status`) | Prueba «envío» |

Los avisos van en una región `role="status"` / `aria-live="polite"`. Todos los textos están en español.

## 7. Integración

- `PublicRequestForm`: `sending={loading}` y el contador de entregados en el recibo. La creación, la RPC, los reintentos y el borrador no cambian.
- `EvidenceSection`: `sending={busy}`. La subida interna, las claves idempotentes y los reintentos no cambian.
- El `<input type=file>` conserva `id="ticket-attachments"`, `multiple` y `accept`. Su nombre accesible ahora contiene el texto visible («Seleccionar archivos para adjuntar»).
- No se añadieron dependencias.

## 8. Límites del navegador (declarados)

- Que el explorador del sistema exponga archivos copiados depende del navegador y del sistema operativo. Chrome y Edge en Windows sí los exponen como `File`; otros pueden entregar solo texto o nada. La aplicación no simula archivos a partir de rutas o nombres: informa y deja disponibles arrastrar y «Seleccionar archivos».
- En móvil (sin arrastre) el botón «Seleccionar archivos» ocupa todo el ancho (44 px de alto), y pegar funciona donde el sistema entrega archivos al portapapeles.
- Las pruebas simulan `DataTransfer` y `ClipboardEvent` en Chromium sin interfaz gráfica. No se probó con portapapeles reales del sistema operativo ni en Safari o Firefox.
