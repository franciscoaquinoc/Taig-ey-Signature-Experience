# TAIGÜEY SIGNATURE EXPERIENCE — VERSIÓN CORREGIDA

Esta entrega mantiene la web con imágenes ilustrativas y corrige la conexión del formulario a Google Sheets. El mensaje **«¡Formulario enviado correctamente!»** aparece **solo** cuando Google Apps Script responde que ha escrito la solicitud en la hoja.

## Archivos

- `index.html`: página del restaurante, formulario individual y mensaje en `#formStatus`.
- `style.css`: estilos, fotografías de referencia y mensajes de éxito/error.
- `catalogo.js`: **solo 12 productos iniciales**, NO la carta completa; nombres/precios por verificar.
- `script.js`: catálogo, carrito, validaciones, envío a Netlify y confirmaciones visibles.
- `Codigo.gs`: copiar manualmente al proyecto de Apps Script vinculado a Sheets.
- `netlify/functions/reservar.js`: función para conectar con Apps Script.
- `netlify.toml`: configuración de Netlify cuando el proyecto está en la raíz.

## 1. Sustituir código de Google Apps Script

1. Abrir la **versión nativa de Google Sheets** de Taigüey. Si es un Excel `.xlsx`, convertirlo primero a Google Sheets.
2. En **Extensiones → Apps Script**, reemplazar todo el contenido de `Código.gs` por el código contenido en este paquete en `Codigo.gs`.
3. Guardar. Hacer clic en **Implementar → Administrar implementaciones → Editar**; seleccionar **Nueva versión** y **Implementar**.
4. En el despliegue web, ejecutar como **Yo** y permitir acceso de **Cualquier persona**. Autorizar la conexión a Sheets si Google lo solicita.
5. Abrir la URL `/exec` en el navegador. Ahora devuelve un JSON con `ok:true` y `servicio: Reservaciones Taigüey` para comprobar que se publicó la versión nueva. Esto NO constituye una reservación.

Si no existe una implementación anterior, usar **Implementar → Nueva implementación → Aplicación web**. Copiar la nueva URL `/exec`.

## 2. Configurar Netlify (plan gratuito)

1. En **Project configuration → Environment variables**, comprobar que `APPS_SCRIPT_URL` contiene exactamente la URL de la implementación `/exec` actualizada.
2. Asegurarse de que `APPS_SCRIPT_URL` esté disponible en **Functions** y en **Production**.
3. Subir a GitHub los archivos descomprimidos manteniendo la carpeta `netlify/functions`. No subir únicamente el ZIP a GitHub.
4. Comprobar que `index.html` y `netlify.toml` están en la raíz del repositorio. En Netlify: **Publish directory** `.`, **Functions directory** `netlify/functions`, **Build command** vacío.
5. Desplegar de nuevo Netlify después de cambiar código o variables de entorno.
6. Abrir `https://taiguey.netlify.app/.netlify/functions/reservar` en el navegador. Debe responder con **405 Método no permitido** (porque necesita POST). Si aparece **404**, Netlify no ha publicado la función: revisar ruta, carpeta y último despliegue.

## 3. Prueba completa

1. Ir a `https://taiguey.netlify.app/` con la nueva versión.
2. Seleccionar productos y rellenar los datos de una única persona con una fecha futura.
3. Pulsar «Enviar solicitud de reservación».
4. Si el servidor confirmó el registro, aparecerá el mensaje **«¡Formulario enviado correctamente!»**, con un código `TG-...` y estado **Pendiente**.
5. Buscar ese código en las pestañas `Reservaciones` y `Productos` del documento de Google Sheets vinculado al script.

Si hay error, aparecerá en rojo y el formulario NO se borrará. Revisar **F12 → Network → reservar → Response**; también **Netlify → Logs → Functions** y **Apps Script → Ejecuciones**.

## Consideraciones importantes

- **No se comprueba la disponibilidad de mesas ni se confirma una reserva de forma automática.** Solo se registra una solicitud con estado «Pendiente».
- No se realiza ningún cobro en la web y el subtotal no incluye impuestos ni cargos.
- Los precios de `catalogo.js` deben estar sincronizados con el objeto `PRECIOS` de `Codigo.gs`, que recalcula los importes sin confiar en el navegador.
- La protección por ID de solicitud evita duplicados cuando se reintenta el mismo envío tras un error de red; no garantiza transacciones atómicas entre las dos pestañas si Google Sheets falla a mitad de escritura.
- Antes de usar la web públicamente: completar/verificar la carta, añadir protección contra spam, política de privacidad, controles de cupos, notificaciones, y revisar el tratamiento de datos personales.
- Las imágenes provienen de Unsplash y son ilustrativas, NO fotografías verificadas de Taigüey. Reemplazarlas por fotos autorizadas, preferiblemente almacenadas en `/assets/images/`.
- Netlify Functions no funcionan ejecutando `index.html` solo con Live Server; probar el guardado desde Netlify.
