import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validar, productoNuevo, productoEdicion, movimiento, idProducto, LIMITES } from '../public/js/esquemas.js';

const valido = { nombre: 'Café 500 g', sku: 'CAF-500', cantidad: '10', minimo: '3' };

test('productoNuevo acepta datos de formulario y los convierte', () => {
  const r = validar(productoNuevo, { ...valido, nombre: '  Café 500 g  ', cantidad: '0' });
  assert.deepEqual(r, { ok: true, datos: { nombre: 'Café 500 g', sku: 'CAF-500', cantidad: 0, minimo: 3 } });
});

test('nombre y SKU vacíos o solo espacios son obligatorios', () => {
  const r = validar(productoNuevo, { ...valido, nombre: '', sku: '   ' });
  assert.equal(r.ok, false);
  assert.equal(r.errores.nombre, 'Este campo es obligatorio');
  assert.equal(r.errores.sku, 'Este campo es obligatorio');
});

for (const [entrada, mensaje] of [
  ['-1', 'La cantidad no puede ser negativa'],
  ['2.5', 'Escribe un número entero'],
  ['abc', 'Escribe un número entero'],
  ['', 'Este campo es obligatorio'],
]) {
  test(`cantidad ${JSON.stringify(entrada)} se rechaza en su campo`, () => {
    const r = validar(productoNuevo, { ...valido, cantidad: entrada });
    assert.equal(r.ok, false);
    assert.deepEqual(Object.keys(r.errores), ['cantidad']);
    assert.equal(r.errores.cantidad, mensaje);
  });
}

test('mínimo negativo o decimal se rechaza', () => {
  assert.equal(validar(productoNuevo, { ...valido, minimo: '-1' }).errores.minimo, 'El mínimo no puede ser negativo');
  assert.equal(validar(productoNuevo, { ...valido, minimo: 1.5 }).errores.minimo, 'Escribe un número entero');
});

test('respeta los límites de longitud', () => {
  assert.equal(validar(productoNuevo, { ...valido, nombre: 'a'.repeat(LIMITES.nombre) }).ok, true);
  assert.equal(validar(productoNuevo, { ...valido, nombre: 'a'.repeat(LIMITES.nombre + 1) }).ok, false);
  assert.equal(validar(productoNuevo, { ...valido, sku: 'a'.repeat(LIMITES.sku + 1) }).ok, false);
});

test('los campos desconocidos son un error', () => {
  const r = validar(productoNuevo, { ...valido, user_id: 'x' });
  assert.equal(r.ok, false);
  assert.ok(r.errores.user_id);
});

test('productoEdicion no admite cantidad', () => {
  assert.equal(validar(productoEdicion, { nombre: 'A', sku: 'B', minimo: '2' }).ok, true);
  const r = validar(productoEdicion, { nombre: 'A', sku: 'B', minimo: '2', cantidad: '9' });
  assert.equal(r.ok, false);
  assert.ok(r.errores.cantidad);
});

const id = crypto.randomUUID();

test('movimiento válido, con y sin nota', () => {
  assert.deepEqual(validar(movimiento, { producto_id: id, tipo: 'salida', unidades: '4', nota: ' venta ' }), {
    ok: true,
    datos: { producto_id: id, tipo: 'salida', unidades: 4, nota: 'venta' },
  });
  const sinNota = validar(movimiento, { producto_id: id, tipo: 'entrada', unidades: '1', nota: '' });
  assert.equal(sinNota.ok, true);
  assert.equal(sinNota.datos.nota, undefined);
  assert.equal(validar(movimiento, { producto_id: id, tipo: 'entrada', unidades: '1' }).ok, true);
});

test('movimiento rechaza unidades 0, tipo inválido y nota larga', () => {
  const r = validar(movimiento, { producto_id: id, tipo: 'inicial', unidades: '0', nota: 'x'.repeat(LIMITES.nota + 1) });
  assert.equal(r.ok, false);
  assert.equal(r.errores.unidades, 'Las unidades deben ser mayores que 0');
  assert.equal(r.errores.tipo, 'Elige entrada o salida');
  assert.ok(r.errores.nota);
});

test('idProducto rechaza un uuid inválido', () => {
  assert.equal(validar(idProducto, id).ok, true);
  const r = validar(idProducto, 'no-es-uuid');
  assert.equal(r.ok, false);
  assert.equal(r.errores._, 'Producto no encontrado');
});
