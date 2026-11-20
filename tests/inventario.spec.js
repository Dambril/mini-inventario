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

  await expect(page.getByRole('alert').filter({ hasText: 'Correo o contraseña incorrectos' })).toBeVisible();
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
