/**
 * TAIGÜEY — Google Apps Script
 * Pegar en Extensiones > Apps Script de la HOJA NATIVA de Google.
 * Implementar como Aplicación web: Ejecutar como "Yo"; acceso "Cualquier persona".
 * No colocar este código en script.js.
 */
const HOJA_RESERVAS = 'Reservaciones';
const HOJA_ITEMS = 'Productos';
const ZONA_HORARIA = 'America/Santo_Domingo';

// Los precios se calculan aquí y NO se aceptan desde el navegador.
// Estos 12 productos son la selección inicial: NO son la carta completa.
// Mantener sincronizados IDs, nombres y precios con catalogo.js.
const PRECIOS = {
  e1: ['Tuna Turéy Crocante', 675],
  e2: ['Ceviche en Guaje Coco', 775],
  e3: ['Taquitos de Boriken', 925],
  p1: ['Risotto Coabey', 1170],
  p2: ['Salmón del Bohío', 1400],
  p3: ['Lomo Areito', 1200],
  p4: ['Cordon Karaya', 950],
  d1: ['Volcán de Chocolate', 750],
  d2: ['Arroz con Leche', 510],
  b1: ['Mezcalita Guataúba', 585],
  b2: ['Anacaona Spritz', 575],
  b3: ['Beso Taíno', 550]
};

const ENCABEZADO_RESERVAS = [
  'Código', 'Registrado el', 'Nombre', 'Apellido', 'Teléfono',
  'Correo', 'Fecha', 'Hora', 'Subtotal RD$', 'Estado',
  'Observaciones', 'ID de solicitud'
];
const ENCABEZADO_PRODUCTOS = [
  'Código', 'Producto', 'Cantidad', 'Precio RD$', 'Subtotal RD$'
];

// Abrir la URL /exec en el navegador mostrará una señal de actividad.
function doGet() {
  return responder({ ok: true, servicio: 'Reservaciones Taigüey', mensaje: 'Servicio activo. Para reservar se requiere POST.' });
}

function doPost(e) {
  const bloqueo = LockService.getScriptLock();
  let bloqueado = false;
  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error('No se recibieron datos de la reservación.');
    }

    bloqueo.waitLock(20000);
    bloqueado = true;

    const datos = JSON.parse(e.postData.contents);
    const idSolicitud = texto(datos.solicitudId, 100);
    if (!/^[a-zA-Z0-9-]{8,100}$/.test(idSolicitud)) {
      throw new Error('Identificador de solicitud inválido.');
    }

    const nombre = texto(datos.nombre, 80);
    const apellido = texto(datos.apellido, 80);
    const telefono = texto(datos.telefono, 25);
    const correo = texto(datos.correo, 120);
    const fecha = texto(datos.fecha, 10);
    const hora = texto(datos.hora, 5);
    const observaciones = texto(datos.observaciones, 500);

    if (!nombre || !apellido || !telefono || telefono.replace(/\D/g, '').length < 7) {
      throw new Error('Completa nombre, apellido y teléfono válido.');
    }
    if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
      throw new Error('Correo electrónico inválido.');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) ||
        !fechaCalendarioValida(fecha) ||
        fecha < Utilities.formatDate(new Date(), ZONA_HORARIA, 'yyyy-MM-dd')) {
      throw new Error('Fecha de reservación inválida o pasada.');
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) {
      throw new Error('Hora de reservación inválida.');
    }
    if (!Array.isArray(datos.items) || datos.items.length < 1 || datos.items.length > 100) {
      throw new Error('Selecciona al menos un plato o bebida.');
    }

    const ids = new Set();
    const lineas = datos.items.map(item => {
      if (!item || typeof item.id !== 'string' || !Object.prototype.hasOwnProperty.call(PRECIOS, item.id)) {
        throw new Error('Hay un producto desconocido en la reservación.');
      }
      if (ids.has(item.id)) throw new Error('Producto duplicado en la solicitud.');
      ids.add(item.id);
      const cantidad = Number(item.cantidad);
      if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 30) {
        throw new Error('Cantidad inválida para ' + PRECIOS[item.id][0]);
      }
      const producto = PRECIOS[item.id];
      return [texto(producto[0], 120), cantidad, producto[1], cantidad * producto[1]];
    });
    const subtotal = lineas.reduce((suma, fila) => suma + fila[3], 0);

    // Requiere un script creado desde Extensiones > Apps Script de Google Sheets.
    const libro = SpreadsheetApp.getActiveSpreadsheet();
    if (!libro) throw new Error('Apps Script no está vinculado a una hoja de Google Sheets.');

    const reservas = obtenerHoja(libro, HOJA_RESERVAS, ENCABEZADO_RESERVAS);
    const productos = obtenerHoja(libro, HOJA_ITEMS, ENCABEZADO_PRODUCTOS);

    // Si la respuesta se perdió, un reintento con el mismo ID no crea otra reserva.
    if (reservas.getLastRow() > 1) {
      const encontrada = reservas.getRange(2, 12, reservas.getLastRow() - 1, 1)
        .createTextFinder(idSolicitud).matchEntireCell(true).findNext();
      if (encontrada) {
        const filaAnterior = encontrada.getRow();
        return responder({
          ok: true,
          codigo: String(reservas.getRange(filaAnterior, 1).getValue()),
          total: Number(reservas.getRange(filaAnterior, 9).getValue()),
          repetida: true
        });
      }
    }

    const codigo = 'TG-' + Utilities.getUuid().slice(0, 8).toUpperCase();
    reservas.appendRow([
      codigo, new Date(), seguro(nombre), seguro(apellido), seguro(telefono),
      seguro(correo), fecha, hora, subtotal, 'Pendiente', seguro(observaciones), idSolicitud
    ]);
    productos.getRange(productos.getLastRow() + 1, 1, lineas.length, 5)
      .setValues(lineas.map(fila => [codigo, seguro(fila[0]), fila[1], fila[2], fila[3]]));
    SpreadsheetApp.flush();

    return responder({ ok: true, codigo, total: subtotal, estado: 'Pendiente' });
  } catch (error) {
    console.error(error);
    return responder({ ok: false, error: String(error.message || error) });
  } finally {
    if (bloqueado) bloqueo.releaseLock();
  }
}

function texto(valor, longitud) {
  return String(valor === null || valor === undefined ? '' : valor)
    .trim().slice(0, longitud);
}

function seguro(valor) {
  const valorTexto = String(valor);
  // Evita que textos aportados por clientes se interpreten como fórmulas.
  return /^[=+@\-\t\r]/.test(valorTexto) ? "'" + valorTexto : valorTexto;
}

function fechaCalendarioValida(iso) {
  const partes = iso.split('-').map(Number);
  const utc = new Date(Date.UTC(partes[0], partes[1] - 1, partes[2]));
  return utc.getUTCFullYear() === partes[0] &&
    utc.getUTCMonth() + 1 === partes[1] && utc.getUTCDate() === partes[2];
}

function obtenerHoja(libro, nombre, encabezado) {
  let hoja = libro.getSheetByName(nombre);
  if (!hoja) {
    hoja = libro.insertSheet(nombre);
  }
  if (hoja.getMaxColumns() < encabezado.length) {
    hoja.insertColumnsAfter(hoja.getMaxColumns(), encabezado.length - hoja.getMaxColumns());
  }
  if (hoja.getLastRow() === 0) {
    hoja.getRange(1, 1, 1, encabezado.length).setValues([encabezado]);
    hoja.setFrozenRows(1);
  } else {
    // Compatible con la versión anterior: añade solamente la columna nueva.
    if (nombre === HOJA_RESERVAS &&
        !hoja.getRange(1, 12).getValue()) {
      hoja.getRange(1, 12).setValue('ID de solicitud');
    }
  }
  return hoja;
}

function responder(datos) {
  return ContentService.createTextOutput(JSON.stringify(datos))
    .setMimeType(ContentService.MimeType.JSON);
}
