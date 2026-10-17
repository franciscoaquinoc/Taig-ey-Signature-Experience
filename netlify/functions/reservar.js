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

// Google ContentService devuelve un 302 a /macros/echo tras ejecutar POST.
// Seguimos manualmente esa redirección por GET para evitar bucles inesperados.
async function unaLlamada(endpoint, metodo, datos) {
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), 14000);
  let url = endpoint;
  let verbo = metodo;
  try {
    for (let salto = 0; salto < 6; salto++) {
      const respuesta = await fetch(url, {
        method: verbo,
        headers: verbo === 'POST' ? { 'Content-Type': 'text/plain;charset=utf-8' } : undefined,
        body: verbo === 'POST' ? JSON.stringify(datos) : undefined,
        redirect: 'manual',
        signal: controlador.signal
      });
      if ([301, 302, 303, 307, 308].includes(respuesta.status)) {
        const ubicacion = respuesta.headers.get('location');
        if (!ubicacion) throw Error('Google redirigió sin indicar destino.');
        const destino = new URL(ubicacion, url);
        if (destino.hostname === 'accounts.google.com') {
          const e = Error('Google exige iniciar sesión; comprueba acceso "Cualquier persona".');
          e.codigo = 'PERMISOS';
          throw e;
        }
        if (destino.protocol !== 'https:' ||
            destino.hostname !== 'script.googleusercontent.com') {
          const e = Error('Google redirigió a ' + destino.hostname + ' y no entregó el resultado del POST.');
          e.codigo = 'REDIRECCION';
          throw e;
        }
        url = destino.href;
        verbo = 'GET';
        continue;
      }
      const cuerpo = await respuesta.text();
      let resultado;
      try { resultado = JSON.parse(cuerpo); }
      catch (_) {
        const login = /accounts\.google\.com|ServiceLogin/i.test(cuerpo);
        const e = Error(login
          ? 'Google devolvió una página de inicio de sesión; revisa permisos.'
          : 'Apps Script devolvió HTML o texto en lugar de JSON (HTTP ' + respuesta.status + ').');
        e.codigo = login ? 'PERMISOS' : 'HTML_GOOGLE';
        e.http = respuesta.status;
        throw e;
      }
      if (!respuesta.ok) {
        const e = Error('Apps Script devolvió HTTP ' + respuesta.status + '.');
        e.codigo = 'HTTP_GOOGLE';
        e.http = respuesta.status;
        throw e;
      }
      return resultado;
    }
    const e = Error('Google excedió el límite de redirecciones.');
    e.codigo = 'REDIRECCION';
    throw e;
  } finally {
    clearTimeout(temporizador);
  }
}

async function llamarAppsScript(endpoint, metodo, datos) {
  // El mismo solicitudId se reutiliza en los reintentos: Apps Script controla duplicados.
  const maximo = metodo === 'POST' ? 2 : 1;
  for (let intento = 1; intento <= maximo; intento++) {
    try { return await unaLlamada(endpoint, metodo, datos); }
    catch (error) {
      console.error('Google Apps Script Taigüey:', JSON.stringify({
        metodo: metodo, intento: intento, codigo: error.codigo || error.name,
        http: error.http || null
      }));
      const temporal = ['HTML_GOOGLE', 'REDIRECCION'].includes(error.codigo) ||
        error.codigo === 'HTTP_GOOGLE' && (error.http === 405 || error.http >= 500) ||
        error.name === 'AbortError' || error.name === 'TypeError';
      if (metodo !== 'POST' || !temporal || intento === maximo) throw error;
      await new Promise(resolve => setTimeout(resolve, 600));
    }
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
    const clave = (process.env.TAIGUEY_API_KEY || '').trim();
    if (event.httpMethod === 'GET') {
      if (event.queryStringParameters &&
          event.queryStringParameters.diagnostico === 'post') {
        // Sin nombre ni teléfono: doPost devuelve validación y NUNCA escribe filas.
        const prueba = { solicitudId: 'diagnostico-0001' };
        if (clave) prueba.apiKey = clave;
        const resultado = await llamarAppsScript(endpoint, 'POST', prueba);
        if (resultado.esquema === ESQUEMA && resultado.ok === false &&
            /Completa nombre, apellido y teléfono válido/i.test(resultado.error || '')) {
          return json(200, {
            ok: true, etapa: 'post', esquema: ESQUEMA,
            mensaje: 'doPost respondió correctamente en JSON. No se guardó ninguna reserva.'
          });
        }
        return json(502, {
          ok: false, etapa: 'post',
          error: resultado.error || 'La prueba POST no devolvió la validación esperada.'
        });
      }
      return json(200, {
        ok: true, etapa: 'completa', esquema: ESQUEMA,
        hoja: diagnostico.hoja,
        mensaje: 'Netlify, Google Apps Script y Google Sheets están conectados.'
      });
    }
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
      codigoError: error.codigo || (agotado ? 'TIMEOUT' : 'DESCONOCIDO'),
      error: agotado
        ? 'El servidor tardó demasiado. Revisa Google Sheets antes de reintentar.'
        : (error && error.message ? error.message :
          'No fue posible comunicarse con Google Apps Script.')
    });
  }
};
