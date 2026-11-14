import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as productos from '../public/productos.js';

// localStorage falso en memoria.
function almacenFalso() {
  const datos = new Map();
  return {
    getItem: (clave) => (datos.has(clave) ? datos.get(clave) : null),
    setItem: (clave, valor) => datos.set(clave, String(valor)),
  };
}

beforeEach(() => productos.usarAlmacen(almacenFalso()));

const cafe = { nombre: 'Café', sku: 'CAF-1', cantidad: 10, minimo: 3 };

async function codigoDe(promesa) {
  try {
    await promesa;
  } catch (error) {
    return error.code;
  }
  return null;
}

test('crea y lista un producto con exactamente sus valores', async () => {
  const creado = await productos.crearProducto(cafe);
  const lista = await productos.listarProductos();
  assert.equal(lista.length, 1);
  assert.deepEqual(lista[0], creado);
  assert.deepEqual({ ...lista[0], id: undefined, created_at: undefined }, { ...cafe, id: undefined, created_at: undefined });
});

test('el SKU es único sin distinguir mayúsculas ni espacios', async () => {
  await productos.crearProducto(cafe);
  assert.equal(await codigoDe(productos.crearProducto({ ...cafe, sku: ' caf-1 ' })), 'SKU_DUPLICADO');
  assert.equal((await productos.listarProductos()).length, 1);
});

test('editar cambia nombre, SKU y mínimo, pero nunca la cantidad', async () => {
  const { id } = await productos.crearProducto(cafe);
  await productos.editarProducto(id, { nombre: 'Café molido', sku: 'CAF-2', minimo: 12, cantidad: 999 });
  const editado = await productos.obtenerProducto(id);
  assert.equal(editado.nombre, 'Café molido');
  assert.equal(editado.sku, 'CAF-2');
  assert.equal(editado.minimo, 12);
  assert.equal(editado.cantidad, 10);
  assert.ok(productos.estaBajoMinimo(editado));
});

test('editar puede conservar su propio SKU pero no tomar el de otro', async () => {
  const a = await productos.crearProducto(cafe);
  await productos.crearProducto({ ...cafe, sku: 'TE-1' });
  await productos.editarProducto(a.id, { nombre: 'Otro', sku: 'caf-1', minimo: 3 });
  assert.equal(await codigoDe(productos.editarProducto(a.id, { nombre: 'X', sku: 'te-1', minimo: 3 })), 'SKU_DUPLICADO');
});

test('un id inexistente da NO_ENCONTRADO', async () => {
  const id = crypto.randomUUID();
  assert.equal(await codigoDe(productos.obtenerProducto(id)), 'NO_ENCONTRADO');
  assert.equal(await codigoDe(productos.editarProducto(id, { nombre: 'A', sku: 'B', minimo: 1 })), 'NO_ENCONTRADO');
  assert.equal(
    await codigoDe(productos.registrarMovimiento({ producto_id: id, tipo: 'entrada', unidades: 1 })),
    'NO_ENCONTRADO',
  );
});

test('entradas suman, salidas restan y una salida excesiva no cambia nada', async () => {
  const { id } = await productos.crearProducto(cafe);
  assert.equal(await productos.registrarMovimiento({ producto_id: id, tipo: 'entrada', unidades: 5, nota: 'compra' }), 15);
  assert.equal(await productos.registrarMovimiento({ producto_id: id, tipo: 'salida', unidades: 15 }), 0);
  assert.equal(
    await codigoDe(productos.registrarMovimiento({ producto_id: id, tipo: 'salida', unidades: 1 })),
    'STOCK_INSUFICIENTE',
  );
  assert.equal((await productos.obtenerProducto(id)).cantidad, 0);
  assert.equal((await productos.listarMovimientos(id)).length, 3);
});

test('rechaza unidades no positivas y tipos inválidos', async () => {
  const { id } = await productos.crearProducto(cafe);
  for (const datos of [{ tipo: 'entrada', unidades: 0 }, { tipo: 'entrada', unidades: 1.5 }, { tipo: 'inicial', unidades: 1 }]) {
    assert.equal(await codigoDe(productos.registrarMovimiento({ producto_id: id, ...datos })), 'DATOS_INVALIDOS');
  }
  assert.equal((await productos.listarMovimientos(id)).length, 1);
});

test('el historial va del más reciente al más antiguo y cuadra con la cantidad', async () => {
  const { id } = await productos.crearProducto(cafe);
  await productos.registrarMovimiento({ producto_id: id, tipo: 'entrada', unidades: 4 });
  await productos.registrarMovimiento({ producto_id: id, tipo: 'salida', unidades: 7, nota: 'venta' });

  const historial = await productos.listarMovimientos(id);
  assert.deepEqual(historial.map((m) => m.tipo), ['salida', 'entrada', 'inicial']);
  assert.equal(historial[0].nota, 'venta');

  const suma = historial.reduce((total, m) => total + (m.tipo === 'salida' ? -m.unidades : m.unidades), 0);
  assert.equal(suma, (await productos.obtenerProducto(id)).cantidad);
});

test('bajo mínimo: cantidad 5 / mínimo 5 aparece, 6 / 5 no', async () => {
  assert.deepEqual(await productos.listarBajoMinimo(), []);
  const justo = await productos.crearProducto({ nombre: 'A', sku: 'A', cantidad: 5, minimo: 5 });
  await productos.crearProducto({ nombre: 'B', sku: 'B', cantidad: 6, minimo: 5 });

  const bajo = await productos.listarBajoMinimo();
  assert.deepEqual(bajo, [{ id: justo.id, nombre: 'A', sku: 'A', cantidad: 5, minimo: 5, faltan: 1 }]);

  await productos.registrarMovimiento({ producto_id: justo.id, tipo: 'entrada', unidades: 1 });
  assert.deepEqual(await productos.listarBajoMinimo(), []);
});

test('datos guardados corruptos no rompen la lectura', async () => {
  const almacen = almacenFalso();
  almacen.setItem('superdami.inventario', '{no es json');
  productos.usarAlmacen(almacen);
  assert.deepEqual(await productos.listarProductos(), []);
});
