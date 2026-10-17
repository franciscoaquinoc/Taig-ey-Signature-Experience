# Taigüey Signature Experience — reservaciones con Netlify Forms

**Sistema actual:** el formulario público envía las solicitudes directamente a **Netlify Forms**. No requiere Google Apps Script, credenciales ni Google Sheets para registrar las solicitudes. No hay confirmación automática de mesas ni cobros.

## Activación OBLIGATORIA (una sola vez)

1. En https://app.netlify.com/projects/taiguey abre **Forms**.
2. Si aparece **Enable form detection**, actívala.
3. Ve a **Deploys** y vuelve a desplegar el último commit de \`main\` (Deploy project without cache si está disponible). Netlify detecta los formularios durante el despliegue del HTML.
4. En **Forms**, confirma que aparece un formulario activo llamado **taiguey-reservaciones**. **No hagas una reserva de prueba si todavía no aparece.**
5. Abre https://taiguey.netlify.app/ (Ctrl+Shift+R), selecciona un plato y envía **una sola solicitud** con fecha futura.
6. Comprueba la recepción dentro de **Forms → taiguey-reservaciones → Submissions**. Si aparece una entrada con sus datos, productos, subtotal estimado y estado Pendiente, la instalación funciona.

Netlify almacena los formularios y admite exportar resultados y configurar notificaciones por correo desde **Forms → Submission notifications**. Revisa el uso y las condiciones de tu plan en Forms → Usage.

## Arquitectura

- \`index.html\`: formulario HTML estático con \`name="taiguey-reservaciones"\`, \`data-netlify="true"\`, honeypot y campos para detalle/importe.
- \`script.js\`: catálogo, carrito y validaciones; rellena los campos ocultos y envía el formulario **POST nativo**, sin fetch a Google Apps Script.
- \`solicitud-recibida.html\`: página a la que Netlify redirige tras procesar correctamente el formulario.
- \`catalogo.js\`: 12 productos demostrativos con precios referenciales (verificar contra menú vigente).
- \`netlify/functions/reservar.js\` y \`Codigo.gs\`: código anterior conservado como respaldo **pero ya no se utiliza desde la página**.
- Google Sheets anterior: sin borrar ni modificar. No se sincroniza automáticamente con Netlify Forms.

## Qué se guarda

Nombre, apellido, teléfono, correo opcional, fecha, hora, observaciones,
detalle completo de platos y bebidas con cantidades, subtotal orientativo,
estado pendiente e ID de solicitud.

**Importante:** los precios y el subtotal son estimaciones calculadas en el navegador. No confiar en ellas para cobrar. Netlify Forms no reserva cupos, no impone límite de mesas, ni evita todas las solicitudes duplicadas. El restaurante debe revisar y confirmar cada solicitud manualmente.

Si posteriormente necesitas inventario de mesas, pagos, roles de empleados, auditoría e idempotencia de servidor, es mejor migrar a una base de datos transaccional, como Supabase/Postgres, no usar Netlify Forms como gestor de mesas.

## Si no llega una solicitud

1. Verifica que el formulario **taiguey-reservaciones** aparezca en Netlify Forms.
2. Verifica que el despliegue que añadió \`data-netlify="true"\` esté Published y con detección habilitada.
3. Revisa la pestaña Spam de Forms y los límites de tu plan.
4. No sigas probando la función \`/.netlify/functions/reservar\`: pertenece a la conexión antigua y no es utilizada por la web.
5. Revisa la documentación: https://docs.netlify.com/manage/forms/setup/

**Seguridad y privacidad:** limita el acceso a las solicitudes, revisa la política de privacidad y configura notificaciones únicamente a direcciones autorizadas.