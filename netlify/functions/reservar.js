'use strict';

/**
 * Puente seguro entre la web y Apps Script.
 * Netlify Environment variables:
 *   APPS_SCRIPT_URL = URL del despliegue Apps Script terminada en /exec
 *   TAIGUEY_API_KEY = opcional, igual a la propiedad de Apps Script
 */
const ESQUEMA = 'taiguey-v2-17-col';

const json = (statusCode, datos) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  },
  body: JSON.stringify(datos)
});

async function llamarAppsScript(endpoint, metodo, datos) {
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), metodo === 'GET' ? 8500 : 15000);
  try {
    const respuesta = await fetch(endpoint, {
      method: metodo,
      headers: metodo === 'POST' ? { 'Content-Type': 'text/plain;charset=utf-8' } : undefined,
      body: metodo === 'POST' ? JSON.stringify(datos) : undefined,
      redirect: 'follow',
      signal: controlador.signal
    });
    const cuerpo = await respuesta.text();
    let resultado;
    try {
      resultado = JSON.parse(cuerpo);
    } catch (_error) {
      console.error('Apps Script no devolvió JSON. HTTP:', respuesta.status,
        'Vista previa:', cuerpo.slice(0, 150));
      throw new Error('Apps Script devolvió HTML o texto; revisa la implementación y sus permisos.');
    }
    if (!respuesta.ok) {
      throw new Error('Apps Script devolvió HTTP ' + respuesta.status + '.');
    }
    return resultado;
  } finally {
    clearTimeout(temporizador);
  }
}

exports.handler = async event => {
  if (event.httpMethod !== 'POST' && event.httpMethod !== 'GET') {
    return json(405, { ok: false, error: 'Método no permitido.' });
  }

  const endpoint = (process.env.APPS_SCRIPT_URL || '').trim();
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(endpoint)) {
    console.error('APPS_SCRIPT_URL no está configurada correctamente.');
    return json(503, { ok: false, etapa: 'netlify',
      error: 'Configura APPS_SCRIPT_URL con la URL /exec vigente en Netlify.' });
  }

  if (event.httpMethod === 'POST' && (!event.body || event.body.length > 25000)) {
    return json(400, { ok: false, error: 'Solicitud vacía o demasiado grande.' });
  }
  let datos = null;
  if (event.httpMethod === 'POST') {
    try { datos = JSON.parse(event.body); }
    catch (_error) { return json(400, { ok: false, error: 'JSON inválido.' }); }
    if (!datos || typeof datos !== 'object' || Array.isArray(datos)) {
      return json(400, { ok: false, error: 'La reservación debe ser un objeto JSON.' });
    }
  }

  try {
    // Antes de escribir: comprobar que la versión de Apps Script conoce
    // las 17 columnas reales. Evita guardar datos en columnas equivocadas.
    const diagnostico = await llamarAppsScript(endpoint, 'GET');
    if (diagnostico.ok !== true || diagnostico.esquema !== ESQUEMA) {
      console.error('Apps Script no tiene el esquema esperado:', diagnostico.esquema || '(sin versión)');
      return json(503, {
        ok: false, etapa: 'apps_script',
        error: 'La implementación de Google Apps Script está desactualizada o no puede acceder a Sheets. Publica la versión nueva de Codigo.gs.'
      });
    }
    if (event.httpMethod === 'GET') {
      return json(200, {
        ok: true, etapa: 'completa', esquema: ESQUEMA,
        hoja: diagnostico.hoja,
        mensaje: 'Netlify, Google Apps Script y Google Sheets están conectados.'
      });
    }

    const clave = (process.env.TAIGUEY_API_KEY || '').trim();
    const payload = clave ? { ...datos, apiKey: clave } : datos;
    const resultado = await llamarAppsScript(endpoint, 'POST', payload);
    if (resultado.esquema !== ESQUEMA) {
      return json(502, { ok: false,
        error: 'Apps Script respondió con una versión incompatible.' });
    }
    if (resultado.ok !== true || !resultado.codigo) {
      return json(400, {
        ok: false, error: resultado.error || 'Google Sheets rechazó la reservación.'
      });
    }
    return json(200, {
      ok: true, success: true, codigo: resultado.codigo,
      total: resultado.total, estado: resultado.estado || 'Pendiente',
      repetida: Boolean(resultado.repetida),
      mensaje: resultado.repetida
        ? 'Esta solicitud ya estaba registrada: se conservó el mismo código.'
        : 'Solicitud registrada y pendiente de confirmación por el restaurante.'
    });
  } catch (error) {
    console.error('Error de conexión Taigüey:', error);
    const agotado = error && error.name === 'AbortError';
    return json(502, {
      ok: false, etapa: 'conexion',
      error: agotado
        ? 'El servidor tardó demasiado. Revisa Google Sheets antes de reintentar.'
        : (error && error.message ? error.message :
          'No fue posible comunicarse con Google Apps Script.')
    });
  }
};
