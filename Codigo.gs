/**
 * TAIGÜEY — Google Apps Script
 * Copiar al editor de Apps Script, guardar y PUBLICAR UNA VERSIÓN NUEVA.
 * La web registra solicitudes PENDIENTES, no confirmaciones definitivas.
 */
const SPREADSHEET_ID = '1UyQOpmnroQjD2j-QpHpiWl6MwizU_SZjz_L6nU_ZZpI';
const HOJA_RESERVAS = 'Reservaciones';
const HOJA_ITEMS = 'Productos';
const ZONA_HORARIA = 'America/Santo_Domingo';
const ESQUEMA = 'taiguey-v2-17-col';
const MAX_CUPOS_POR_HORA = 30;

// Precios calculados EN EL SERVIDOR, nunca desde el navegador.
// Sincronizar con catalogo.js al actualizar la carta.
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

// Debe coincidir EXACTAMENTE con los encabezados ya existentes en Google Sheets.
const ENCABEZADO_RESERVAS = [
  'Fecha de registro', 'Codigo de reserva', 'ID de solicitud', 'Nombre',
  'Telefono', 'Correo', 'Fecha de reservacion', 'Hora', 'Personas',
  'Menu', 'Entrada', 'Plato principal', 'Postre', 'Bebidas',
  'Precio total', 'Comentarios', 'Estado'
];
const ENCABEZADO_PRODUCTOS = [
  'Código', 'Producto', 'Cantidad', 'Precio RD$', 'Subtotal RD$'
];

// Diagnóstico no destructivo. Un código desactualizado NO devuelve ESQUEMA.
function doGet() {
  try {
    const libro = SpreadsheetApp.openById(SPREADSHEET_ID);
    const hoja = libro.getSheetByName(HOJA_RESERVAS);
    if (!hoja) throw new Error('No se encontró la pestaña Reservaciones.');
    validarEncabezados(hoja, ENCABEZADO_RESERVAS);
    return responder({
      ok: true, esquema: ESQUEMA, hoja: HOJA_RESERVAS,
      servicio: 'Reservaciones Taigüey',
      mensaje: 'Google Apps Script y Google Sheets están conectados.'
    });
  } catch (error) {
    console.error('Diagnóstico Taigüey:', error);
    return responder({
      ok: false, esquema: ESQUEMA,
      error: 'No se puede acceder a Reservaciones con los encabezados esperados.'
    });
  }
}

function doPost(e) {
  const bloqueo = LockService.getScriptLock();
  let bloqueado = false;
  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error('No se recibieron datos de la reservación.');
    }
    const datos = JSON.parse(e.postData.contents);
    if (!datos || typeof datos !== 'object' || Array.isArray(datos)) {
      throw new Error('Formato de reservación inválido.');
    }

    // Protección opcional para llamadas directas a Apps Script.
    // Si se configura esta propiedad, definir el MISMO valor en Netlify.
    const clave = PropertiesService.getScriptProperties().getProperty('TAIGUEY_API_KEY');
    if (clave && datos.apiKey !== clave) {
      throw new Error('Solicitud no autorizada.');
    }

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
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !fechaCalendarioValida(fecha)) {
      throw new Error('Fecha de reservación inválida.');
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) {
      throw new Error('Hora de reservación inválida.');
    }
    const ahora = Utilities.formatDate(new Date(), ZONA_HORARIA, 'yyyy-MM-dd HH:mm');
    if ((fecha + ' ' + hora) < ahora) {
      throw new Error('Selecciona una fecha y hora futuras.');
    }
    if (!Array.isArray(datos.items) || datos.items.length < 1 || datos.items.length > 100) {
      throw new Error('Selecciona al menos un plato o bebida.');
    }

    const ids = new Set();
    const lineas = datos.items.map(item => {
      if (!item || typeof item.id !== 'string' ||
          !Object.prototype.hasOwnProperty.call(PRECIOS, item.id)) {
        throw new Error('Hay un producto desconocido en la reservación.');
      }
      if (ids.has(item.id)) throw new Error('Producto duplicado en la solicitud.');
      ids.add(item.id);
      const cantidad = Number(item.cantidad);
      if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 30) {
        throw new Error('Cantidad inválida para ' + PRECIOS[item.id][0]);
      }
      const producto = PRECIOS[item.id];
      return {
        id: item.id, nombre: producto[0], cantidad: cantidad,
        precio: producto[1], subtotal: cantidad * producto[1]
      };
    });
    const subtotal = lineas.reduce((suma, linea) => suma + linea.subtotal, 0);

    bloqueo.waitLock(20000);
    bloqueado = true;
    const libro = SpreadsheetApp.openById(SPREADSHEET_ID);
    const reservas = obtenerHoja(libro, HOJA_RESERVAS, ENCABEZADO_RESERVAS, false);
    const productos = obtenerHoja(libro, HOJA_ITEMS, ENCABEZADO_PRODUCTOS, true);
    const ultima = reservas.getLastRow();
    const filas = ultima > 1
      ? reservas.getRange(2, 1, ultima - 1, ENCABEZADO_RESERVAS.length).getValues()
      : [];

    // Protección contra duplicados: mismo ID => mismo código.
    for (let i = 0; i < filas.length; i++) {
      const fila = filas[i];
      if (String(fila[2]).trim() === idSolicitud) {
        const codigoAnterior = String(fila[1]);
        asegurarProductos(productos, codigoAnterior, lineas);
        SpreadsheetApp.flush();
        return responder({
          ok: true, esquema: ESQUEMA, codigo: codigoAnterior,
          total: Number(fila[14]) || 0,
          estado: String(fila[16] || 'Pendiente'),
          repetida: true
        });
      }
    }

    // Una reservación corresponde a una persona; se limita el cupo por hora.
    let ocupados = 0;
    filas.forEach(fila => {
      const estado = String(fila[16] || '').toLowerCase().trim();
      if (fechaNormalizada(fila[6]) === fecha &&
          horaNormalizada(fila[7]) === hora && estado !== 'cancelada') {
        ocupados += Number(fila[8]) || 1;
      }
    });
    if (ocupados >= MAX_CUPOS_POR_HORA) {
      throw new Error('Ya no hay cupos disponibles para esa fecha y hora.');
    }

    const resumen = prefijo => lineas
      .filter(linea => linea.id.charAt(0) === prefijo)
      .map(linea => linea.cantidad + ' × ' + linea.nombre)
      .join(', ');
    const codigo = 'TG-' + Utilities.getUuid().slice(0, 8).toUpperCase();

    // Orden de columnas de la hoja existente: A a Q.
    reservas.appendRow([
      new Date(), codigo, seguro(idSolicitud), seguro(nombre + ' ' + apellido),
      seguro(telefono), seguro(correo), fecha, hora, 1, 'A la carta',
      seguro(resumen('e')), seguro(resumen('p')), seguro(resumen('d')),
      seguro(resumen('b')), subtotal, seguro(observaciones), 'Pendiente'
    ]);

    // Si falla el detalle después de guardar la reserva, reintentar con el
    // mismo ID completa Productos sin crear otra fila en Reservaciones.
    asegurarProductos(productos, codigo, lineas);
    SpreadsheetApp.flush();
    return responder({
      ok: true, esquema: ESQUEMA, codigo: codigo, total: subtotal,
      estado: 'Pendiente', repetida: false
    });
  } catch (error) {
    console.error('Error al registrar Taigüey:', error);
    return responder({ ok: false, esquema: ESQUEMA, error: String(error.message || error) });
  } finally {
    if (bloqueado) bloqueo.releaseLock();
  }
}

function asegurarProductos(hoja, codigo, lineas) {
  let existentes = 0;
  if (hoja.getLastRow() > 1) {
    const codigos = hoja.getRange(2, 1, hoja.getLastRow() - 1, 1).getDisplayValues();
    codigos.forEach(fila => { if (fila[0] === codigo) existentes++; });
  }
  if (existentes === lineas.length) return;
  if (existentes !== 0) {
    throw new Error('El detalle de productos necesita revisión manual; la reserva ya existe.');
  }
  hoja.getRange(hoja.getLastRow() + 1, 1, lineas.length, 5)
    .setValues(lineas.map(item => [
      codigo, seguro(item.nombre), item.cantidad, item.precio, item.subtotal
    ]));
}

function texto(valor, longitud) {
  return String(valor === null || valor === undefined ? '' : valor).trim().slice(0, longitud);
}
function seguro(valor) {
  const cadena = String(valor);
  return /^[=+@\-\t\r]/.test(cadena) ? "'" + cadena : cadena;
}
function fechaCalendarioValida(iso) {
  const partes = iso.split('-').map(Number);
  const fecha = new Date(Date.UTC(partes[0], partes[1] - 1, partes[2]));
  return fecha.getUTCFullYear() === partes[0] &&
    fecha.getUTCMonth() + 1 === partes[1] && fecha.getUTCDate() === partes[2];
}
function fechaNormalizada(valor) {
  return valor instanceof Date
    ? Utilities.formatDate(valor, ZONA_HORARIA, 'yyyy-MM-dd')
    : String(valor || '').trim().slice(0, 10);
}
function horaNormalizada(valor) {
  if (valor instanceof Date) return Utilities.formatDate(valor, ZONA_HORARIA, 'HH:mm');
  if (typeof valor === 'number') {
    const minutos = Math.round((valor % 1) * 24 * 60);
    return ('0' + Math.floor(minutos / 60)).slice(-2) + ':' +
      ('0' + (minutos % 60)).slice(-2);
  }
  return String(valor || '').trim().slice(0, 5);
}
function validarEncabezados(hoja, encabezados) {
  const actuales = hoja.getRange(1, 1, 1, encabezados.length).getDisplayValues()[0];
  for (let i = 0; i < encabezados.length; i++) {
    if (actuales[i] !== encabezados[i]) {
      throw new Error('Encabezado incorrecto en columna ' + (i + 1) +
        ': se esperaba ' + encabezados[i]);
    }
  }
}
function obtenerHoja(libro, nombre, encabezados, crearSiFalta) {
  let hoja = libro.getSheetByName(nombre);
  if (!hoja) {
    if (!crearSiFalta) throw new Error('No existe la pestaña ' + nombre);
    hoja = libro.insertSheet(nombre);
  }
  if (hoja.getMaxColumns() < encabezados.length) {
    hoja.insertColumnsAfter(hoja.getMaxColumns(), encabezados.length - hoja.getMaxColumns());
  }
  if (hoja.getLastRow() === 0) {
    if (!crearSiFalta) throw new Error('La pestaña ' + nombre + ' no tiene encabezados.');
    hoja.getRange(1, 1, 1, encabezados.length).setValues([encabezados]);
    hoja.setFrozenRows(1);
  } else {
    validarEncabezados(hoja, encabezados);
  }
  return hoja;
}
function responder(datos) {
  return ContentService.createTextOutput(JSON.stringify(datos))
    .setMimeType(ContentService.MimeType.JSON);
}
