// Única capa de acceso a datos del inventario. Habla con Supabase; las reglas
// (SKU único, cantidad solo por movimientos, sin stock negativo, cada quien ve
// solo lo suyo) las garantiza la base de datos (docs/diseno.md, sección 4).
//
// Todas las funciones son async y lanzan errores con `code` (ver js/errores.js).

let cliente = null;

// app.js entrega el cliente de js/cliente.js; las pruebas, uno falso.
export function usarCliente(nuevo) {
  cliente = nuevo;
}

const COLUMNAS = 'id, nombre, sku, cantidad, minimo, created_at';

// Errores de la función registrar_movimiento: viajan en el mensaje.
const ERRORES_FUNCION = ['NO_ENCONTRADO', 'STOCK_INSUFICIENTE'];

function falla(code, cause) {
  const error = new Error(code, { cause });
  error.code = code;
  return error;
}

// Convierte la respuesta de Supabase en datos o en un error con `code`.
function resultado({ data, error }) {
  if (!error) return data;
  if (error.code === '23505') throw falla('SKU_DUPLICADO', error);
  if (ERRORES_FUNCION.includes(error.message)) throw falla(error.message, error);
  throw falla('SUPABASE', error);
}

export function estaBajoMinimo(producto) {
  return producto.cantidad <= producto.minimo;
}

export async function listarProductos() {
  return resultado(await cliente.from('productos').select(COLUMNAS).order('created_at'));
}

export async function obtenerProducto(id) {
  const producto = resultado(await cliente.from('productos').select(COLUMNAS).eq('id', id).maybeSingle());
  if (!producto) throw falla('NO_ENCONTRADO');
  return producto;
}

// user_id lo pone Postgres y un trigger crea el movimiento "inicial".
export async function crearProducto({ nombre, sku, cantidad, minimo }) {
  return resultado(
    await cliente.from('productos').insert({ nombre, sku, cantidad, minimo }).select(COLUMNAS).single(),
  );
}

// Solo nombre, SKU y mínimo: la base de datos no permite editar la cantidad.
export async function editarProducto(id, { nombre, sku, minimo }) {
  const producto = resultado(
    await cliente.from('productos').update({ nombre, sku, minimo }).eq('id', id).select(COLUMNAS).maybeSingle(),
  );
  if (!producto) throw falla('NO_ENCONTRADO');
  return producto;
}

// La función de la base de datos aplica todo o nada y devuelve la nueva cantidad.
export async function registrarMovimiento({ producto_id, tipo, unidades, nota }) {
  return resultado(await cliente.rpc('registrar_movimiento', { producto_id, tipo, unidades, nota: nota ?? null }));
}

// Del más reciente al más antiguo.
export async function listarMovimientos(producto_id) {
  return resultado(
    await cliente
      .from('movimientos')
      .select('id, producto_id, tipo, unidades, nota, created_at')
      .eq('producto_id', producto_id)
      .order('created_at', { ascending: false }),
  );
}

export async function listarBajoMinimo() {
  return resultado(
    await cliente.from('productos_bajo_minimo').select('id, nombre, sku, cantidad, minimo, faltan').order('nombre'),
  );
}
