# Auditoría inicial Modern Web Guidance — AMPA Agustinos
Fecha: 2026-11-21
Estado: evaluación estática preliminar; **sin cambios en funcionalidades ni producción**.

## Alcance revisado
- `src/components/PdfPreviewModal.tsx`
- `src/components/EmailCardModal.tsx`

Guía consultada: `.agents/skills/modern-web-guidance/guides/ui-components/dialog.md` (`dialog`; fuente GoogleChrome). Esta revisión no ejecuta automáticamente tests E2E ni `legacy-scan`.

## Hallazgos
1. **Modales personalizados** (prioridad media): ambos componentes representan overlays con `div className="fixed inset-0 ..."`. La guía recomienda `<dialog>` modal mediante `showModal()` para gestionar la capa superior, foco, inactividad del contenido subyacente y cierre con Escape. Revisar el flujo de apertura/cierre y evitar event handlers globales duplicados.
2. **Nombre accesible del botón cerrar** (prioridad media): `EmailCardModal` tiene un botón con icono `<X />` sin etiqueta accesible; añadir `aria-label="Cerrar"` como cambio mínimo independiente.
3. **Nombre accesible del diálogo** (prioridad media): al migrar a diálogo nativo, vincular `aria-labelledby` al título visible y definir el foco inicial.
4. **Exportación PDF en iOS** (mantener): `PdfPreviewModal` construye el archivo antes y llama `navigator.share(...)` de manera directa dentro del callback del usuario. Preservar este comportamiento y el enlace alternativo para descargar.
5. **Compatibilidad Safari**: la guía advierte que `closedby` no estaba disponible en Safari según su matriz. No basar la protección de formularios sucios solo en `closedby="none"`; manejar `cancel`.

## Plan para una iteración posterior
1. Corregir primero las etiquetas accesibles y validar visualmente la ausencia de regresiones.
2. Preparar una migración encapsulada a `<dialog>` nativo, con `showModal()` y un único estado de cierre, conservando el diseño original.
3. Probar `Esc`, Tab/Shift+Tab, retorno de foco, VoiceOver, Safari iOS, exportación PDF y vista A4.
4. Ejecutar `npm run lint` y `npm run build` antes de proponer merge/despliegue.

Criterio: los hallazgos son sugerencias verificables, no afirmaciones de errores de usuario reproducidos.
