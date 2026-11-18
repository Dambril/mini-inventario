import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as productos from '../public/productos.js';

// Cliente de Supabase falso: anota cada llamada y responde siempre `respuesta`.
// Las reglas reales (RLS, SKU único, stock) se prueban contra la base de datos.
function clienteFalso(respuesta) {
  const llamadas = [];
  const consulta = new Proxy(
    {},
    {
      get(_, metodo) {
        if (metodo === 'then') return (ok, mal) => Promise.resolve(respuesta).then(ok, mal);
        return (...args) => {
          llamadas.push([metodo, ...args]);
          return consulta;
        };
      },
    },
  );
  const cliente = {
    from: (tabla) => {
      llamadas.push(['from', tabla]);
      return consulta;
    },
    rpc: (funcion, args) => {
      llamadas.push(['rpc', funcion, args]);
      return Promise.resolve(respuesta);
    },
  };
  productos.usarCliente(cliente);
  return llamadas;
}

const llamada = (llamadas, metodo) => llamadas.find(([m]) => m === metodo);

async function codigoDe(promesa) {
  try {
    await promesa;
  } catch (error) {
    return error.code;
  }
  return null;
}

const cafe = { nombre: 'Café', sku: 'CAF-1', cantidad: 10, minimo: 3 };
const ID = '00000000-0000-4000-8000-000000000001';

test('crear inserta solo los cuatro campos y devuelve el producto', async () => {
  const guardado = { id: ID, ...cafe, created_at: '2026-11-17T00:00:00Z' };
  const llamadas = clienteFalso({ data: guardado, error: null });
  assert.deepEqual(await productos.crearProducto({ ...cafe, user_id: 'otra' }), guardado);
  assert.deepEqual(llamada(llamadas, 'from'), ['from', 'productos']);
  assert.deepEqual(llamada(llamadas, 'insert'), ['insert', cafe]);
});

test('un SKU repetido (23505) da SKU_DUPLICADO', async () => {
  clienteFalso({ data: null, error: { code: '23505', message: 'duplicate key' } });
  assert.equal(await codigoDe(productos.crearProducto(cafe)), 'SKU_DUPLICADO');
  assert.equal(await codigoDe(productos.editarProducto(ID, cafe)), 'SKU_DUPLICADO');
});

test('editar envía nombre, SKU y mínimo, nunca la cantidad', async () => {
  const llamadas = clienteFalso({ data: { id: ID, ...cafe }, error: null });
  await productos.editarProducto(ID, { nombre: 'Café molido', sku: 'CAF-2', minimo: 12, cantidad: 999 });
  assert.deepEqual(llamada(llamadas, 'update'), ['update', { nombre: 'Café molido', sku: 'CAF-2', minimo: 12 }]);
  assert.deepEqual(llamada(llamadas, 'eq'), ['eq', 'id', ID]);
});

test('sin filas (inexistente o de otra persona) da NO_ENCONTRADO', async () => {
  clienteFalso({ data: null, error: null });
  assert.equal(await codigoDe(productos.obtenerProducto(ID)), 'NO_ENCONTRADO');
  assert.equal(await codigoDe(productos.editarProducto(ID, cafe)), 'NO_ENCONTRADO');
});

test('registrar un movimiento llama a la función y devuelve la nueva cantidad', async () => {
  const llamadas = clienteFalso({ data: 15, error: null });
  assert.equal(await productos.registrarMovimiento({ producto_id: ID, tipo: 'entrada', unidades: 5 }), 15);
  assert.deepEqual(llamada(llamadas, 'rpc'), [
    'rpc',
    'registrar_movimiento',
    { producto_id: ID, tipo: 'entrada', unidades: 5, nota: null },
  ]);
});

for (const codigo of ['STOCK_INSUFICIENTE', 'NO_ENCONTRADO']) {
  test(`el error ${codigo} de la función conserva su código`, async () => {
    clienteFalso({ data: null, error: { code: 'P0001', message: codigo } });
    assert.equal(
      await codigoDe(productos.registrarMovimiento({ producto_id: ID, tipo: 'salida', unidades: 1 })),
      codigo,
    );
  });
}

test('cualquier otro error da SUPABASE y guarda el original', async () => {
  const original = { code: '42501', message: 'permission denied' };
  clienteFalso({ data: null, error: original });
  const error = await productos.listarProductos().catch((e) => e);
  assert.equal(error.code, 'SUPABASE');
  assert.equal(error.cause, original);
});

test('el historial se pide del más reciente al más antiguo', async () => {
  const llamadas = clienteFalso({ data: [], error: null });
  await productos.listarMovimientos(ID);
  assert.deepEqual(llamada(llamadas, 'from'), ['from', 'movimientos']);
  assert.deepEqual(llamada(llamadas, 'order'), ['order', 'created_at', { ascending: false }]);
});

test('bajo mínimo: cantidad 5 / mínimo 5 sí, 6 / 5 no', () => {
  assert.equal(productos.estaBajoMinimo({ cantidad: 5, minimo: 5 }), true);
  assert.equal(productos.estaBajoMinimo({ cantidad: 6, minimo: 5 }), false);
});
