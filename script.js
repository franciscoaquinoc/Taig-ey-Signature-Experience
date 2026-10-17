'use strict';

// Las solicitudes se guardan con Netlify Forms, sin funciones ni Apps Script.
// Netlify debe detectar el formulario "taiguey-reservaciones" al desplegar.
const catalogo = Array.isArray(window.CATALOGO) ? window.CATALOGO : [];
const productosPorId = new Map(catalogo.map(producto => [producto.id, producto]));
const carrito = new Map();
const $ = selector => document.querySelector(selector);
const dinero = valor => 'RD$' + Number(valor).toLocaleString('es-DO', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2
});

// Imágenes ilustrativas, no fotografías oficiales del restaurante.
const fotosPorCategoria = {
  'Entradas': 'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=700&q=80',
  'Platos principales': 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=700&q=80',
  'Postres': 'https://images.unsplash.com/photo-1488477181946-6428a0291777?auto=format&fit=crop&w=700&q=80',
  'Cócteles': 'https://images.unsplash.com/photo-1470337458703-46ad1756a187?auto=format&fit=crop&w=700&q=80'
};

const categorias = ['Todos', ...new Set(catalogo.map(p => p.categoria))];
let categoriaActual = 'Todos';
let solicitudPendienteId = null;
let solicitudPendienteFirma = null;
let enviando = false;

function aviso(tipo, titulo, mensaje = '') {
  const contenedor = $('#formStatus');
  contenedor.className = 'form-status ' + (tipo ? 'form-' + tipo : '');
  contenedor.setAttribute('role', tipo === 'error' ? 'alert' : 'status');
  contenedor.replaceChildren();

  const encabezado = document.createElement('strong');
  encabezado.textContent = titulo;
  contenedor.append(encabezado);

  if (mensaje) {
    const detalle = document.createElement('span');
    detalle.textContent = mensaje;
    contenedor.append(detalle);
  }

  // Hace visible el resultado tras enviar el formulario.
  if (tipo === 'success' || tipo === 'error') {
    contenedor.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function renderCategorias() {
  $('#categories').replaceChildren(...categorias.map(categoria => {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'chip' + (categoria === categoriaActual ? ' active' : '');
    boton.textContent = categoria;
    boton.setAttribute('aria-pressed', String(categoria === categoriaActual));
    boton.addEventListener('click', () => {
      categoriaActual = categoria;
      renderCategorias();
      renderMenu();
    });
    return boton;
  }));
}

function renderMenu() {
  const productos = catalogo.filter(p =>
    categoriaActual === 'Todos' || p.categoria === categoriaActual
  );

  $('#menuGrid').replaceChildren(...productos.map(producto => {
    const tarjeta = document.createElement('article');
    tarjeta.className = 'menu-card';

    const foto = document.createElement('img');
    foto.className = 'menu-photo';
    foto.loading = 'lazy';
    foto.alt = 'Imagen ilustrativa de ' + producto.categoria;
    foto.src = fotosPorCategoria[producto.categoria] || fotosPorCategoria['Platos principales'];
    foto.addEventListener('error', () => { foto.style.display = 'none'; });

    const info = document.createElement('div');
    info.className = 'menu-info';

    const etiqueta = document.createElement('span');
    etiqueta.className = 'tag';
    etiqueta.textContent = producto.categoria;

    const titulo = document.createElement('h3');
    titulo.textContent = producto.nombre;

    const pie = document.createElement('div');
    pie.className = 'bottom';

    const precio = document.createElement('span');
    precio.className = 'price';
    precio.textContent = dinero(producto.precio);

    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'add-btn';
    boton.textContent = '+ Añadir';
    boton.setAttribute('aria-label', 'Añadir ' + producto.nombre);
    boton.addEventListener('click', () => {
      const cantidad = carrito.get(producto.id) || 0;
      if (cantidad >= 30) {
        aviso('error', 'Cantidad máxima alcanzada', 'Puedes seleccionar hasta 30 unidades por producto.');
        return;
      }
      carrito.set(producto.id, cantidad + 1);
      renderCarrito();
      boton.textContent = '✓ Añadido';
      setTimeout(() => { boton.textContent = '+ Añadir'; }, 900);
    });

    pie.append(precio, boton);
    info.append(etiqueta, titulo, pie);
    tarjeta.append(foto, info);
    return tarjeta;
  }));
}

function renderCarrito() {
  const lineas = [...carrito].filter(([id, cantidad]) =>
    productosPorId.has(id) && cantidad > 0
  );
  const contenedor = $('#cartItems');

  if (lineas.length === 0) {
    const vacio = document.createElement('p');
    vacio.className = 'empty';
    vacio.textContent = 'Aún no has seleccionado productos. Explora nuestra carta.';
    contenedor.replaceChildren(vacio);
  } else {
    contenedor.replaceChildren(...lineas.map(([id, cantidad]) => {
      const producto = productosPorId.get(id);
      const linea = document.createElement('div');
      linea.className = 'cart-line';

      const info = document.createElement('div');
      const nombre = document.createElement('strong');
      nombre.textContent = producto.nombre;
      const detalle = document.createElement('small');
      detalle.textContent = `${cantidad} × ${dinero(producto.precio)} = ${dinero(cantidad * producto.precio)}`;
      info.append(nombre, detalle);

      const quitar = document.createElement('button');
      quitar.type = 'button';
      quitar.textContent = '−';
      quitar.setAttribute('aria-label', 'Quitar una unidad de ' + producto.nombre);
      quitar.addEventListener('click', () => {
        if (cantidad === 1) carrito.delete(id);
        else carrito.set(id, cantidad - 1);
        renderCarrito();
      });
      linea.append(info, quitar);
      return linea;
    }));
  }

  const subtotal = lineas.reduce((suma, [id, cantidad]) =>
    suma + productosPorId.get(id).precio * cantidad, 0
  );
  $('#subtotal').textContent = dinero(subtotal);
}

function hoyDominicano() {
  // Fecha local RD; evita bloquear el día actual por usar UTC.
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Santo_Domingo',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const mapa = Object.fromEntries(partes.map(p => [p.type, p.value]));
  return `${mapa.year}-${mapa.month}-${mapa.day}`;
}

function nuevoIdSolicitud() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }
  return 'web-' + Date.now() + '-' + Math.random().toString(36).slice(2, 12);
}

function horaRD() {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Santo_Domingo',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).format(new Date());
}

async function enviarReservacion(evento) {
  evento.preventDefault();
  if (enviando) return;

  const formulario = evento.currentTarget;
  const boton = $('#submitBtn');
  const lineas = [...carrito].filter(([id, cantidad]) => cantidad > 0);

  if (!formulario.reportValidity()) return;
  if (lineas.length === 0) {
    aviso('error', 'Selecciona tus productos',
      'Añade al menos un plato o una bebida antes de enviar la solicitud.');
    return;
  }

  const datos = new FormData(formulario);
  const fecha = String(datos.get('fecha') || '');
  const hora = String(datos.get('hora') || '');
  if (fecha < hoyDominicano() ||
      (fecha === hoyDominicano() && hora <= horaRD())) {
    aviso('error', 'Fecha y hora no válidas',
      'Selecciona una fecha y hora futuras para tu solicitud.');
    return;
  }

  // Conserva los productos y cantidades en el mismo formulario.
  const seleccion = lineas.map(([id, cantidad]) => {
    const producto = productosPorId.get(id);
    return cantidad + ' × ' + producto.nombre + ' (' + dinero(producto.precio) +
      ' c/u, ' + dinero(producto.precio * cantidad) + ')';
  }).join(' | ');
  const subtotal = lineas.reduce((suma, [id, cantidad]) =>
    suma + productosPorId.get(id).precio * cantidad, 0);

  if (seleccion.length > 7000) {
    aviso('error', 'Selección demasiado larga',
      'Reduce la cantidad de productos antes de enviar la solicitud.');
    return;
  }

  // Referencia de correlación: Netlify registra también su propio ID interno.
  // No equivale a la confirmación de una mesa ni a un comprobante de pago.
  const firmaActual = JSON.stringify({
    datos: [...datos.entries()].filter(([clave]) =>
      clave !== 'form-name' && clave !== 'bot-field' &&
      clave !== 'solicitud_id' && clave !== 'detalle_productos' &&
      clave !== 'subtotal_estimado' && clave !== 'estado'),
    seleccion, subtotal
  });
  if (!solicitudPendienteId || solicitudPendienteFirma !== firmaActual) {
    solicitudPendienteId = nuevoIdSolicitud();
    solicitudPendienteFirma = firmaActual;
  }

  formulario.elements.namedItem('solicitud_id').value = solicitudPendienteId;
  formulario.elements.namedItem('detalle_productos').value = seleccion;
  formulario.elements.namedItem('subtotal_estimado').value = 'RD$' + subtotal;
  formulario.elements.namedItem('estado').value = 'Pendiente';

  // Enviar Netlify Forms como application/x-www-form-urlencoded a una ruta
  // existente. La respuesta se muestra aquí, sin redirecciones a una página 404.
  enviando = true;
  boton.disabled = true;
  boton.textContent = 'Enviando solicitud…';
  aviso('loading', 'Enviando tu solicitud…',
    'Estamos enviando la información de tu reservación.');
  try {
    const cuerpo = new URLSearchParams(new FormData(formulario)).toString();
    const respuesta = await fetch('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: cuerpo,
      redirect: 'follow'
    });
    if (!respuesta.ok) {
      throw new Error('Netlify respondió con HTTP ' + respuesta.status +
        '. Comprueba si el formulario aparece en Netlify Forms.');
    }
    aviso('success', 'Solicitud enviada al servidor',
      'El servidor respondió correctamente. Comprueba la recepción en Netlify Forms. ' +
      'La reservación está pendiente de confirmación por el restaurante.');
    formulario.reset();
    carrito.clear();
    renderCarrito();
    solicitudPendienteId = null;
    solicitudPendienteFirma = null;
    $('#fecha').min = hoyDominicano();
  } catch (error) {
    aviso('error', 'No se pudo verificar el envío',
      (error && error.message ? error.message : 'Error de conexión.') +
      ' No repitas el envío antes de revisar Netlify Forms.');
  } finally {
    enviando = false;
    boton.disabled = false;
    boton.textContent = 'Enviar solicitud de reservación ↗';
  }
}

$('#navToggle').addEventListener('click', () => {
  const abierto = $('#nav').classList.toggle('open');
  $('#navToggle').setAttribute('aria-expanded', String(abierto));
});
document.querySelectorAll('nav a').forEach(enlace => {
  enlace.addEventListener('click', () => {
    $('#nav').classList.remove('open');
    $('#navToggle').setAttribute('aria-expanded', 'false');
  });
});

$('#fecha').min = hoyDominicano();
$('#reservationForm').addEventListener('submit', enviarReservacion);
renderCategorias();
renderMenu();
renderCarrito();
