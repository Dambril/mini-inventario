import { test, expect } from '@playwright/test';
import { agregarProducto, borrarProductos, credenciales, iniciarSesion, skuUnico } from './ayudas-e2e.js';

// SKUs creados por la prueba en curso; se borran al terminar, pase o falle.
let creados;
test.beforeEach(() => {
  creados = [];
});
test.afterEach(async () => {
  await borrarProductos(creados);
});

function productoDePrueba(cantidad, minimo) {
  const sku = skuUnico();
  creados.push(sku);
  return { sku, nombre: `Prueba ${sku}`, cantidad, minimo };
}

test('inicia sesión con una cuenta válida', async ({ page }) => {
  await iniciarSesion(page);
  await expect(page.locator('#usuaria-correo')).toHaveText(credenciales().email);
  await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
});

test('rechaza una contraseña incorrecta', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Correo').fill(credenciales().email);
  await page.getByLabel('Contraseña').fill('contraseña-incorrecta-123');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();

  await expect(page.getByRole('alert').filter({ hasText: 'El correo o la contraseña no son correctos' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Entra a tu inventario' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Agregar producto' })).toBeHidden();
});

test('agrega un producto y aparece en la lista', async ({ page }) => {
  const producto = productoDePrueba(20, 5);
  await iniciarSesion(page);
  await agregarProducto(page, producto);

  const fila = page.getByRole('row').filter({ hasText: producto.sku });
  await expect(fila).toBeVisible();
  await expect(fila.getByRole('cell', { name: producto.nombre })).toBeVisible();
  await expect(fila.getByRole('cell', { name: 'En orden' })).toBeVisible();
  await expect(fila).not.toContainText('Bajo mínimo');
});

test('marca un producto bajo el mínimo', async ({ page }) => {
  const producto = productoDePrueba(2, 8);
  await iniciarSesion(page);
  await agregarProducto(page, producto);

  // En "Todos los productos" lleva la insignia.
  const fila = page.getByRole('row').filter({ hasText: producto.sku });
  await expect(fila).toContainText('Bajo mínimo');

  // Y aparece en la pestaña "Bajo mínimo" con lo que le falta: mínimo - cantidad + 1 = 7.
  await page.getByRole('tab', { name: /Bajo mínimo/ }).click();
  const filaBajo = page.getByRole('row').filter({ hasText: producto.sku });
  await expect(filaBajo).toBeVisible();
  await expect(filaBajo.getByRole('cell', { name: '7', exact: true })).toBeVisible();
});

test('edita nombre, SKU y mínimo de un producto', async ({ page }) => {
  const producto = productoDePrueba(10, 3);
  await iniciarSesion(page);
  await agregarProducto(page, producto);

  // Los datos nuevos; el SKU nuevo también se borra al terminar.
  const nuevoSku = skuUnico('EDIT');
  creados.push(nuevoSku);
  const nuevoNombre = `Editado ${nuevoSku}`;

  await page.getByRole('row').filter({ hasText: producto.sku })
    .getByRole('button', { name: 'Editar / movimientos' }).click();
  const dialogo = page.getByRole('dialog');
  await expect(dialogo.getByRole('heading', { name: producto.nombre })).toBeVisible();

  await dialogo.getByLabel('Nombre').fill(nuevoNombre);
  await dialogo.getByLabel('SKU').fill(nuevoSku);
  await dialogo.getByLabel('Cantidad mínima').fill('15'); // 10 < 15: pasa a "Bajo mínimo"
  await dialogo.getByRole('button', { name: 'Guardar cambios' }).click();

  await expect(dialogo.getByRole('status').filter({ hasText: 'Cambios guardados.' })).toBeVisible();
  await expect(dialogo.getByRole('heading', { name: nuevoNombre })).toBeVisible();
  // La cantidad no cambia al editar.
  await expect(dialogo.locator('#dialogo-cantidad')).toHaveText('10');

  // La lista refleja los cambios, sin recargar.
  await dialogo.getByRole('button', { name: 'Cerrar' }).click();
  const fila = page.getByRole('row').filter({ hasText: nuevoSku });
  await expect(fila.getByRole('cell', { name: nuevoNombre })).toBeVisible();
  await expect(fila).toContainText('Bajo mínimo');
  await expect(page.getByRole('row').filter({ hasText: producto.sku })).toHaveCount(0);

  // Y persiste tras recargar.
  await page.reload();
  await expect(page.getByRole('row').filter({ hasText: nuevoSku })).toContainText(nuevoNombre);
});

test('rechaza editar un producto con un SKU que ya existe', async ({ page }) => {
  const existente = productoDePrueba(10, 3);
  const otro = productoDePrueba(10, 3);
  await iniciarSesion(page);
  await agregarProducto(page, existente);
  await agregarProducto(page, otro);

  await page.getByRole('row').filter({ hasText: otro.sku })
    .getByRole('button', { name: 'Editar / movimientos' }).click();
  const dialogo = page.getByRole('dialog');
  await dialogo.getByLabel('SKU').fill(existente.sku);
  await dialogo.getByRole('button', { name: 'Guardar cambios' }).click();

  // El mensaje va junto al campo SKU (párrafo enlazado al campo, sin rol alert).
  await expect(dialogo.getByLabel('SKU')).toHaveAttribute('aria-invalid', 'true');
  await expect(dialogo.getByText('Ya existe un producto con este SKU')).toBeVisible();
  await expect(dialogo.getByRole('status').filter({ hasText: 'Cambios guardados.' })).toBeHidden();

  // Nada cambió: el producto conserva su SKU original.
  await dialogo.getByRole('button', { name: 'Cerrar' }).click();
  await expect(page.getByRole('row').filter({ hasText: otro.sku })).toHaveCount(1);
});
