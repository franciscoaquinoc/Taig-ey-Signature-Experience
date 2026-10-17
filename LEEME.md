# Taigüey Signature Experience

Sitio HTML/CSS/JS con reservas individuales. La web registra una **solicitud pendiente**, que el restaurante debe confirmar. No realiza cobros.

## Arquitectura

Web \`script.js\` → \`/.netlify/functions/reservar\` → Google Apps Script \`Codigo.gs\` → Google Sheets.

- Google Sheets: https://docs.google.com/spreadsheets/d/1UyQOpmnroQjD2j-QpHpiWl6MwizU_SZjz_L6nU_ZZpI/edit
- Pestaña **Reservaciones**: conserva sus 17 encabezados existentes.
- Pestaña **Productos**: el script la crea al registrar la primera solicitud, si no existe. Almacena el detalle de platos y bebidas por código.
- El precio lo calcula **Apps Script** con los mismos IDs y precios definidos en \`catalogo.js\` (12 productos de ejemplo, NO carta completa verificada).
- Una solicitud es para **una persona** y se aplica el límite configurado de **30 solicitudes por hora**.
- El estado queda **Pendiente** hasta una confirmación manual del restaurante.
- El mismo \`solicitudId\` sirve para reintentar sin duplicar; si el usuario modifica la selección se genera otro ID.

## Pasos para ponerlo en producción

1. Abre Apps Script y **sustituye su \`Código.gs\` por el archivo \`Codigo.gs\` de este repositorio**. El archivo de GitHub NO se ejecuta en Google Apps Script automáticamente.
2. Guarda y ve a **Implementar → Administrar implementaciones → Editar → Nueva versión → Implementar**. Ejecuta como **Yo** y permite acceso a **Cualquier persona**.
3. Abre la URL \`/exec\` del despliegue de Apps Script. Debe devolver JSON con \`"ok":true\` y \`"esquema":"taiguey-v2-17-col"\`. Si no, revisar permisos, ID y encabezados.
4. En Netlify, en **Environment variables**, comprueba que \`APPS_SCRIPT_URL\` tenga la URL \`/exec\` vigente y esté disponible para Functions en Production.
5. Publica el último commit de \`main\` en Netlify. \`netlify.toml\` configura \`publish = "."\` y \`functions = "netlify/functions"\`.
6. Abre \`https://TU-SITIO.netlify.app/.netlify/functions/reservar\` en el navegador. Debe mostrar JSON \`"ok":true\` y \`"etapa":"completa"\`. Esta prueba GET **no añade filas**.
7. Haz **una** solicitud de prueba desde la web; comprueba el código \`TG-...\` en la pestaña Reservaciones y sus productos en Productos. Si el formulario indica error, consulta Sheets antes de repetir el envío.

## Seguridad opcional recomendada antes de abrir al público

Define una propiedad de script **TAIGUEY_API_KEY** en Apps Script y la misma variable de entorno **TAIGUEY_API_KEY** en Netlify (disponible para Functions). Usa un secreto largo y aleatorio. Nunca lo coloques en el HTML, \`script.js\` o GitHub. Si lo defines solo en Apps Script o solo en Netlify, la protección no funcionará correctamente.

Aún faltan controles adicionales antes de producción pública: protección anti-spam/rate limits, datos personales, políticas de privacidad y verificación de los nombres/precios de los productos. Los precios y las imágenes actuales son ilustrativos/referenciales.

## Diagnósticos

- Si GET en la función de Netlify devuelve **503 / apps_script**, falta publicar la nueva versión de \`Codigo.gs\` o esta no pudo acceder a Sheets.
- Si devuelve **503 / netlify**, revisar \`APPS_SCRIPT_URL\`.
- Si devuelve **404**, la función no está desplegada en Netlify.
- Si devuelve **502**, revisar Netlify → Logs → Functions y Apps Script → Ejecuciones.
- El enlace \`/exec\` antiguo puede seguir activo; la precomprobación de versión evita que escriba en columnas equivocadas.

Nunca borrar ni reconstruir la pestaña Reservaciones para resolver errores de conexión.
