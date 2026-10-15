# Taigüey Signature Experience — versión inicial

Web responsive en HTML, CSS y JavaScript con catálogo editable y reservaciones individuales.

## Importante

- El catálogo contiene **12 productos de ejemplo basados en nombres y precios previamente identificados**, NO la carta completa. Verifica todos los datos con la carta oficial y agrega los demás productos a `catalogo.js` y `PRECIOS` en `Codigo.gs` antes de lanzar.
- Las imágenes de portada son composiciones CSS provisionales; reemplázalas por fotografías autorizadas.
- El envío no funcionará hasta configurar Google Sheets y Netlify.
- Cada registro es una **solicitud pendiente**, no una mesa confirmada. No se incluye control de cupos ni disponibilidad en esta versión.

## Conectar Google Sheets

1. Crea una hoja de cálculo nueva en Google Sheets.
2. Ve a **Extensiones → Apps Script** y pega el contenido de `Codigo.gs`.
3. Selecciona **Implementar → Nueva implementación → Aplicación web**.
4. Ejecutar como: **Yo**. Acceso: **Cualquier persona** (necesario para la función pública de Netlify). Autoriza los permisos.
5. Copia la URL que termina en `/exec`.
6. En Netlify, crea la variable de entorno `APPS_SCRIPT_URL` con esa URL (no la expongas en la web).
7. Publica el proyecto en Netlify usando Git o la CLI con soporte de Netlify Functions. **No uses solo arrastrar la carpeta** si no se despliega la función serverless.
8. La URL permanece exclusivamente en la variable de entorno de Netlify. No es necesario modificar `script.js`.
9. Haz una reserva de prueba y verifica las pestañas `Reservaciones` y `Productos`.

## Nota de producción

Antes de utilizarlo públicamente, añade protección contra spam, política de privacidad, controles de disponibilidad, notificaciones al restaurante y revisión de impuestos/cargos. Para un sitio con tráfico significativo, considera una base de datos en lugar de Sheets.
