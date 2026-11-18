// Interfaz de la página. Los datos del inventario pasan por /productos.js y la
// sesión por sesion.js; aquí no se habla con Supabase directamente.
import * as productos from '/productos.js';
import { supabase } from './cliente.js';
import { registrar, iniciarSesion, cerrarSesion, vigilarSesion } from './sesion.js';
import { validar, credenciales, productoNuevo, productoEdicion, movimiento, idProducto } from './esquemas.js';
import { mensajeDeError } from './errores.js';

productos.usarCliente(supabase);

const $ = (selector, raiz = document) => raiz.querySelector(selector);

const formAcceso = $('#form-acceso');
const formAlta = $('#form-alta');
const formEdicion = $('#form-edicion');
const formMovimiento = $('#form-movimiento');
const dialogo = $('#dialogo-producto');

let productoAbierto = null;

// Crea un elemento con texto seguro (textContent, nunca innerHTML).
function el(etiqueta, { clase, texto } = {}, hijos = []) {
  const nodo = document.createElement(etiqueta);
  if (clase) nodo.className = clase;
  if (texto !== undefined) nodo.textContent = String(texto);
  nodo.append(...hijos);
  return nodo;
}

function etiquetaBajoMinimo() {
  return el('span', { clase: 'etiqueta-bajo', texto: 'Bajo mínimo' });
}

function botonAbrir(texto, id) {
  const boton = el('button', { clase: 'secundario', texto });
  boton.type = 'button';
  boton.addEventListener('click', () => abrirProducto(id));
  return boton;
}

// --- Formularios -----------------------------------------------------------

// Un <input type="number"> con "abc" entrega "", así que se marca como no numérico.
function leerFormulario(form) {
  const datos = Object.fromEntries(new FormData(form));
  for (const input of form.querySelectorAll('input[type="number"]')) {
    if (input.validity.badInput) datos[input.name] = 'no-numerico';
  }
  return datos;
}

function limpiarMensajes(form) {
  for (const p of form.querySelectorAll('[data-error-de], [data-estado]')) p.textContent = '';
  for (const input of form.querySelectorAll('[aria-invalid]')) input.removeAttribute('aria-invalid');
}

function mostrarErrores(form, errores) {
  let primero = null;
  for (const [campo, mensaje] of Object.entries(errores)) {
    const destino = $(`[data-error-de="${campo}"]`, form) ?? $('[data-error-de="_"]', form);
    destino.textContent = mensaje;
    const input = form.elements.namedItem(campo);
    if (input) {
      input.setAttribute('aria-invalid', 'true');
      primero ??= input;
    }
  }
  primero?.focus();
}

function mostrarEstado(form, mensaje) {
  $('[data-estado]', form).textContent = mensaje;
}

// Errores de la capa de datos o de Auth que van junto a su campo.
const CAMPO_DEL_ERROR = {
  SKU_DUPLICADO: 'sku',
  user_already_exists: 'email',
  email_exists: 'email',
  email_address_invalid: 'email',
  weak_password: 'password',
};

function mostrarErrorDeDatos(form, error) {
  const campo = CAMPO_DEL_ERROR[error?.code] ?? '_';
  mostrarErrores(form, { [campo]: mensajeDeError(error) });
}

// --- Sesión ------------------------------------------------------------------------

// Un botón envía "entrar" y el otro "registrar"; los dos usan los mismos campos.
formAcceso.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  limpiarMensajes(formAcceso);
  const resultado = validar(credenciales, leerFormulario(formAcceso));
  if (!resultado.ok) return mostrarErrores(formAcceso, resultado.errores);

  const botones = formAcceso.querySelectorAll('button');
  for (const boton of botones) boton.disabled = true;
  try {
    if (evento.submitter?.value === 'registrar') {
      const { confirmarCorreo } = await registrar(resultado.datos);
      if (confirmarCorreo) mostrarEstado(formAcceso, 'Te enviamos un correo para confirmar la cuenta.');
    } else {
      await iniciarSesion(resultado.datos);
    }
    // Si hay sesión nueva, vigilarSesion cambia de pantalla.
  } catch (error) {
    mostrarErrorDeDatos(formAcceso, error);
  } finally {
    for (const boton of botones) boton.disabled = false;
  }
});

$('#cerrar-sesion').addEventListener('click', async () => {
  try {
    await cerrarSesion();
  } catch (error) {
    // La sesión local se borra aunque falle el servidor; solo queda constancia.
    console.error(error);
  }
});

let usuariaActual;

function mostrarPantalla(id) {
  for (const pantalla of ['cargando', 'acceso', 'inventario']) $(`#${pantalla}`).hidden = pantalla !== id;
}

async function alCambiarSesion(usuaria) {
  // La sesión se renueva sola cada hora; solo importa si cambió la persona.
  if (usuaria?.id === usuariaActual?.id && usuariaActual !== undefined) return;
  usuariaActual = usuaria;

  if (dialogo.open) dialogo.close();
  $('#usuaria').hidden = !usuaria;
  $('#usuaria-correo').textContent = usuaria?.email ?? '';

  if (!usuaria) {
    // En un equipo compartido, lo de una cuenta no debe verse en la siguiente.
    formAlta.reset();
    limpiarMensajes(formAlta);
    borrarBorrador();
    for (const tabla of ['#tabla-productos', '#tabla-bajo-minimo']) $(`${tabla} tbody`).replaceChildren();
    formAcceso.elements.password.value = '';
    mostrarPantalla('acceso');
    return;
  }

  limpiarMensajes(formAcceso);
  formAcceso.reset();
  restaurarBorrador();
  mostrarPantalla('inventario');
  try {
    await pintarListas();
  } catch (error) {
    $('[data-error-de="_"]', formAlta).textContent = mensajeDeError(error);
  }
}

// Lo escrito en el alta sobrevive a una recarga. Es comodidad de la interfaz, no
// datos del inventario, por eso no pasa por productos.js.
const CLAVE_BORRADOR = 'superdami.borrador.alta';

function guardarBorrador() {
  try {
    localStorage.setItem(CLAVE_BORRADOR, JSON.stringify(Object.fromEntries(new FormData(formAlta))));
  } catch {
    // Sin almacenamiento (ventana privada, cuota llena): el borrador no se guarda.
  }
}

function restaurarBorrador() {
  try {
    const borrador = JSON.parse(localStorage.getItem(CLAVE_BORRADOR));
    if (!borrador || typeof borrador !== 'object') return;
    for (const [campo, valor] of Object.entries(borrador)) {
      const input = formAlta.elements.namedItem(campo);
      if (input && typeof valor === 'string') input.value = valor;
    }
  } catch {
    // Borrador ilegible: se empieza con el formulario vacío.
  }
}

function borrarBorrador() {
  try {
    localStorage.removeItem(CLAVE_BORRADOR);
  } catch {
    // Nada que borrar si no hay almacenamiento.
  }
}

formAlta.addEventListener('input', guardarBorrador);

formAlta.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  limpiarMensajes(formAlta);
  const resultado = validar(productoNuevo, leerFormulario(formAlta));
  if (!resultado.ok) return mostrarErrores(formAlta, resultado.errores);

  try {
    const creado = await productos.crearProducto(resultado.datos);
    formAlta.reset();
    borrarBorrador();
    mostrarEstado(formAlta, `Se agregó «${creado.nombre}».`);
    $('#alta-nombre').focus();
    await pintarListas();
  } catch (error) {
    mostrarErrorDeDatos(formAlta, error);
  }
});

formEdicion.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  limpiarMensajes(formEdicion);
  const resultado = validar(productoEdicion, leerFormulario(formEdicion));
  if (!resultado.ok) return mostrarErrores(formEdicion, resultado.errores);

  try {
    await productos.editarProducto(productoAbierto, resultado.datos);
    await pintarProducto();
    mostrarEstado(formEdicion, 'Cambios guardados.');
    await pintarListas();
  } catch (error) {
    mostrarErrorDeDatos(formEdicion, error);
  }
});

formMovimiento.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  limpiarMensajes(formMovimiento);
  const resultado = validar(movimiento, { ...leerFormulario(formMovimiento), producto_id: productoAbierto });
  if (!resultado.ok) return mostrarErrores(formMovimiento, resultado.errores);

  // Aviso previo con el stock en pantalla; la capa de datos es quien decide.
  const { tipo, unidades } = resultado.datos;
  const stockMostrado = Number($('#dialogo-cantidad').textContent);
  if (tipo === 'salida' && unidades > stockMostrado) {
    return mostrarErrores(formMovimiento, { unidades: 'No hay stock suficiente' });
  }

  try {
    await productos.registrarMovimiento(resultado.datos);
    formMovimiento.reset();
    await pintarProducto();
    mostrarEstado(formMovimiento, tipo === 'entrada' ? `Entrada de ${unidades} registrada.` : `Salida de ${unidades} registrada.`);
    await pintarListas();
  } catch (error) {
    mostrarErrorDeDatos(formMovimiento, error);
  }
});

// --- Listas ------------------------------------------------------------------

async function pintarListas() {
  const [todos, bajoMinimo] = await Promise.all([productos.listarProductos(), productos.listarBajoMinimo()]);

  const filas = todos.map((p) => {
    const bajo = productos.estaBajoMinimo(p);
    const fila = el('tr', { clase: bajo ? 'fila-bajo' : '' }, [
      el('td', { texto: p.nombre }),
      el('td', { clase: 'sku', texto: p.sku }),
      el('td', { clase: 'num', texto: p.cantidad }),
      el('td', { clase: 'num', texto: p.minimo }),
      el('td', {}, bajo ? [etiquetaBajoMinimo()] : [el('span', { clase: 'etiqueta-ok', texto: 'En orden' })]),
      el('td', { clase: 'acciones-fila' }, [botonAbrir('Editar / movimientos', p.id)]),
    ]);
    return fila;
  });
  $('#tabla-productos tbody').replaceChildren(...filas);
  $('#tabla-productos').hidden = todos.length === 0;
  $('#lista-vacia').hidden = todos.length > 0;

  const filasBajo = bajoMinimo.map((p) =>
    el('tr', {}, [
      el('td', { texto: p.nombre }),
      el('td', { clase: 'sku', texto: p.sku }),
      el('td', { clase: 'num', texto: p.cantidad }),
      el('td', { clase: 'num', texto: p.minimo }),
      el('td', { clase: 'num faltan', texto: p.faltan }),
      el('td', { clase: 'acciones-fila' }, [botonAbrir('Reabastecer', p.id)]),
    ]),
  );
  $('#tabla-bajo-minimo tbody').replaceChildren(...filasBajo);
  $('#tabla-bajo-minimo').hidden = bajoMinimo.length === 0;
  $('#bajo-minimo-vacio').hidden = bajoMinimo.length > 0;
  $('#contador-bajo-minimo').textContent = bajoMinimo.length > 0 ? String(bajoMinimo.length) : '';
}

// --- Pestañas ------------------------------------------------------------------

function mostrarPestana(nombre) {
  const bajo = nombre === 'bajo-minimo';
  $('#tab-todos').setAttribute('aria-selected', String(!bajo));
  $('#tab-bajo-minimo').setAttribute('aria-selected', String(bajo));
  $('#vista-todos').hidden = bajo;
  $('#vista-bajo-minimo').hidden = !bajo;
}

$('#tab-todos').addEventListener('click', () => {
  history.replaceState(null, '', location.pathname);
  mostrarPestana('todos');
});
$('#tab-bajo-minimo').addEventListener('click', () => {
  history.replaceState(null, '', '#bajo-minimo');
  mostrarPestana('bajo-minimo');
});

// --- Diálogo del producto --------------------------------------------------------

const NOMBRE_TIPO = { inicial: 'Inicial', entrada: 'Entrada', salida: 'Salida' };
const formatoFecha = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' });

async function abrirProducto(id) {
  for (const form of [formEdicion, formMovimiento]) {
    form.reset();
    limpiarMensajes(form);
  }
  $('#dialogo-error').textContent = '';
  $('#dialogo-cuerpo').hidden = false;

  if (!validar(idProducto, id).ok) return mostrarProductoNoEncontrado();
  productoAbierto = id;
  try {
    await pintarProducto({ rellenarFormulario: true });
  } catch (error) {
    if (error?.code !== 'NO_ENCONTRADO') console.error(error);
    return mostrarProductoNoEncontrado();
  }
  if (!dialogo.open) dialogo.showModal();
}

function mostrarProductoNoEncontrado() {
  productoAbierto = null;
  $('#dialogo-titulo').textContent = 'Producto';
  $('#dialogo-error').textContent = 'Producto no encontrado';
  $('#dialogo-cuerpo').hidden = true;
  if (!dialogo.open) dialogo.showModal();
}

async function pintarProducto({ rellenarFormulario = false } = {}) {
  const [producto, historial] = await Promise.all([
    productos.obtenerProducto(productoAbierto),
    productos.listarMovimientos(productoAbierto),
  ]);

  $('#dialogo-titulo').textContent = producto.nombre;
  $('#dialogo-cantidad').textContent = String(producto.cantidad);
  $('#dialogo-etiqueta').replaceChildren(...(productos.estaBajoMinimo(producto) ? [etiquetaBajoMinimo()] : []));

  if (rellenarFormulario) {
    formEdicion.elements.nombre.value = producto.nombre;
    formEdicion.elements.sku.value = producto.sku;
    formEdicion.elements.minimo.value = String(producto.minimo);
  }

  const filas = historial.map((m) => {
    const signo = m.tipo === 'salida' ? '−' : m.tipo === 'entrada' ? '+' : '';
    return el('tr', {}, [
      el('td', { texto: formatoFecha.format(new Date(m.created_at)) }),
      el('td', {}, [el('span', { clase: `tipo tipo-${m.tipo}`, texto: NOMBRE_TIPO[m.tipo] })]),
      el('td', { clase: 'num', texto: `${signo}${m.unidades}` }),
      el('td', { clase: 'nota', texto: m.nota ?? '' }),
    ]);
  });
  $('#tabla-historial tbody').replaceChildren(...filas);
}

$('[data-cerrar]', dialogo).addEventListener('click', () => dialogo.close());
dialogo.addEventListener('close', () => {
  productoAbierto = null;
});

// --- Inicio -----------------------------------------------------------------------

mostrarPestana(location.hash === '#bajo-minimo' ? 'bajo-minimo' : 'todos');
vigilarSesion(alCambiarSesion);
