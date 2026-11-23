# Resumen ejecutivo — Modo oscuro (23/11/2026)

**Veredicto: APROBADO CON OBSERVACIONES.** Rama local `dark-mode-20261123` sobre `main` publicada (`49cca39`). Sin push, sin merge y sin despliegue.

## Qué obtiene el usuario

- **Un selector Claro/Oscuro** (iconos de sol y luna) en el portal, el ingreso, el espacio del cliente, el seguimiento y el panel interno, siempre en el lado derecho.
- **La elección se recuerda** al navegar, al recargar y al entrar o salir de sesión. Quien no elige sigue viendo el modo claro.
- **Sin destello:** la página abre directamente en el tema elegido.
- **Un modo oscuro diseñado, no invertido:**
  - superficies navy con la identidad Procont;
  - azul de marca adaptado para leerse sobre oscuro;
  - el dorado oficial intacto;
  - tarjetas con escalón y borde propios;
  - sin violeta.
- **El modo claro aprobado no cambia:** sus colores renderizados coinciden con los publicados en las 115 pantallas medidas. Solo se añade el propio selector.

## Calidad medida

- **Contraste:** 0 textos por debajo de 4,5:1 en las 115 pantallas de cada tema, y 56 pares de tokens medidos desde el CSS compilado sin ningún fallo.
- **Accesibilidad:**
  - etiquetas, encabezados y foco iguales en los dos temas;
  - el selector tiene nombre, estado, 44 px y funciona con teclado.
- **Movimiento:**
  - un único fundido breve al cambiar de tema;
  - con teclado o movimiento reducido, sin animación o más breve;
  - los demás movimientos aprobados no cambian.
- **Responsive:** sin desbordamiento de 1920 a 320 px en los dos temas.
- **Rendimiento:** sin dependencias nuevas; +1,7 KB de JavaScript y +3 KB de CSS comprimido.
- **Pruebas:** unitarias 173/173, UI 69/69 (con 8 nuevas del tema) y UX sobre el build de producción 36/36.

## Observaciones

1. El gate de Taste sigue en OPEN 14 (no se reinicia) y las excepciones previas siguen como estaban.
2. Las pruebas se hicieron en Chromium emulado; queda pendiente Safari, Firefox y un lector de pantalla real.
3. Los tres recorridos con JavaScript sobre 450 KiB siguen igual que antes (ninguno supera 900).
4. Falta la revisión y autorización del usuario para publicar.

## Documentos

[REPORT](REPORT.md) · [Tokens](THEME_TOKENS.md) · [Taste](TASTE_COMPLIANCE.md) · [Emil](EMIL_COMPLIANCE.md) · [Accesibilidad](ACCESSIBILITY_REPORT.md) · [Responsive](RESPONSIVE_REPORT.md) · [Rendimiento](PERFORMANCE_REPORT.md) · [Capturas claro](screenshots/light/) · [Capturas oscuro](screenshots/dark/) · [Manifiesto](screenshots-manifest.json) · [SHA256SUMS](SHA256SUMS)
