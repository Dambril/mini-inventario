// Única capa de acceso a datos. Hoy guarda en localStorage; mañana se cambia por
// Supabase sin tocar la interfaz, por eso todas las funciones son async y lanzan
// errores con `code` (ver js/errores.js).
//
// Reproduce las reglas que pondrá la base de datos (docs/diseno.md, sección 4):
// SKU único sin distinguir mayúsculas, la cantidad solo cambia con movimientos,
// ninguna salida deja el stock en negativo y cada producto empieza con un
// movimiento "inicial".

const CLAVE = 'superdami.inventario';

let almacen = globalThis.localStorage;

// Para las pruebas en Node, que no tienen localStorage.
export function usarAlmacen(nuevo) {
  almacen = nuevo;
}

function falla(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function leer() {
  try {
    const datos = JSON.parse(almacen.getItem(CLAVE));
    if (datos && Array.isArray(datos.productos) && Array.isArray(datos.movimientos)) return datos;
  } catch (error) {
    console.error('No se pudo leer el inventario guardado', error);
  }
  return { productos: [], movimientos: [] };
}

// Productos y movimientos van en una sola clave para que cada cambio sea todo o nada.
function guardar(datos) {
  try {
    almacen.setItem(CLAVE, JSON.stringify(datos));
  } catch (error) {
    throw Object.assign(falla('ALMACEN'), { cause: error });
  }
}

const normalizarSku = (sku) => sku.trim().toLowerCase();

function skuOcupado(productos, sku, excepto) {
  return productos.some((p) => p.id !== excepto && normalizarSku(p.sku) === normalizarSku(sku));
}

export function estaBajoMinimo(producto) {
  return producto.cantidad <= producto.minimo;
}

export async function listarProductos() {
  return structuredClone(leer().productos);
}

export async function obtenerProducto(id) {
  const producto = leer().productos.find((p) => p.id === id);
  if (!producto) throw falla('NO_ENCONTRADO');
  return structuredClone(producto);
}

export async function crearProducto({ nombre, sku, cantidad, minimo }) {
  const datos = leer();
  if (skuOcupado(datos.productos, sku)) throw falla('SKU_DUPLICADO');

  const ahora = new Date().toISOString();
  const producto = { id: crypto.randomUUID(), nombre, sku, cantidad, minimo, created_at: ahora };
  datos.productos.push(producto);
  datos.movimientos.push({
    id: crypto.randomUUID(),
    producto_id: producto.id,
    tipo: 'inicial',
    unidades: cantidad,
    nota: null,
    created_at: ahora,
  });
  guardar(datos);
  return structuredClone(producto);
}

// Solo nombre, SKU y mínimo: la cantidad no se puede editar directamente.
export async function editarProducto(id, { nombre, sku, minimo }) {
  const datos = leer();
  const producto = datos.productos.find((p) => p.id === id);
  if (!producto) throw falla('NO_ENCONTRADO');
  if (skuOcupado(datos.productos, sku, id)) throw falla('SKU_DUPLICADO');

  Object.assign(producto, { nombre, sku, minimo });
  guardar(datos);
  return structuredClone(producto);
}

// Equivale a la función registrar_movimiento: o se aplica todo o no cambia nada.
export async function registrarMovimiento({ producto_id, tipo, unidades, nota }) {
  if (!['entrada', 'salida'].includes(tipo) || !Number.isInteger(unidades) || unidades <= 0) {
    throw falla('DATOS_INVALIDOS');
  }
  const datos = leer();
  const producto = datos.productos.find((p) => p.id === producto_id);
  if (!producto) throw falla('NO_ENCONTRADO');

  const nuevaCantidad = producto.cantidad + (tipo === 'entrada' ? unidades : -unidades);
  if (nuevaCantidad < 0) throw falla('STOCK_INSUFICIENTE');

  producto.cantidad = nuevaCantidad;
  datos.movimientos.push({
    id: crypto.randomUUID(),
    producto_id,
    tipo,
    unidades,
    nota: nota ?? null,
    created_at: new Date().toISOString(),
  });
  guardar(datos);
  return nuevaCantidad;
}

// Del más reciente al más antiguo (se guardan en orden de llegada).
export async function listarMovimientos(producto_id) {
  return structuredClone(leer().movimientos.filter((m) => m.producto_id === producto_id).reverse());
}

// Equivale a la vista productos_bajo_minimo.
export async function listarBajoMinimo() {
  return leer()
    .productos.filter(estaBajoMinimo)
    .map(({ id, nombre, sku, cantidad, minimo }) => ({
      id,
      nombre,
      sku,
      cantidad,
      minimo,
      faltan: minimo - cantidad + 1,
    }));
}
