'use strict';

/**
 * Netlify Function: puente HTTPS entre el formulario y Google Apps Script.
 * Environment variable APPS_SCRIPT_URL debe terminar en /exec.
 */
const json = (statusCode, datos) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  body: JSON.stringify(datos)
});

exports.handler = async event => {
  if (event.httpMethod !== 'POST') {
    return json(405, { ok: false, error: 'Método no permitido. Usa POST para reservar.' });
  }

  if (!event.body || event.body.length > 25000) {
    return json(400, { ok: false, error: 'Solicitud vacía o demasiado grande.' });
  }

  let datos;
  try {
    datos = JSON.parse(event.body);
  } catch (_error) {
    return json(400, { ok: false, error: 'El formulario envió datos JSON inválidos.' });
  }

  const endpoint = (process.env.APPS_SCRIPT_URL || '').trim();
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(endpoint)) {
    console.error('APPS_SCRIPT_URL no está configurada correctamente.');
    return json(500, { ok: false, error: 'Falta configurar Google Apps Script en Netlify.' });
  }

  try {
    const controlador = new AbortController();
    const temporizador = setTimeout(() => controlador.abort(), 12000);
    let respuesta;
    try {
      respuesta = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(datos),
        redirect: 'follow',
        signal: controlador.signal
      });
    } finally {
      clearTimeout(temporizador);
    }

    const cuerpo = await respuesta.text();
    let resultado;
    try {
      resultado = JSON.parse(cuerpo);
    } catch (_error) {
      console.error('Respuesta no JSON de Apps Script. HTTP:', respuesta.status,
        'Vista previa:', cuerpo.slice(0, 150));
      return json(502, {
        ok: false,
        error: 'Google Apps Script no respondió correctamente. Comprueba la implementación y los permisos.'
      });
    }

    if (!respuesta.ok || resultado.ok !== true || !resultado.codigo) {
      return json(400, {
        ok: false,
        error: resultado.error || 'Google Sheets rechazó la solicitud.'
      });
    }

    // La confirmación procede exclusivamente del Apps Script que escribe en Sheets.
    return json(200, {
      ok: true,
      success: true,
      codigo: resultado.codigo,
      total: resultado.total ?? datos.total ?? datos.precioTotal ?? 0,
      estado: 'Confirmada',
      mensaje: 'Reservación registrada correctamente.'
    });
  } catch (error) {
    console.error('Error al conectar con Apps Script:', error);
    const agotado = error && error.name === 'AbortError';
    return json(502, {
      ok: false,
      error: agotado
        ? 'Google Apps Script tardó demasiado en responder. Revisa Sheets antes de reintentar.'
        : 'No fue posible comunicarse con Google Apps Script. Revisa los registros de Netlify.'
    });
  }
};
