// Ayudas para las pruebas de navegador (*.spec.js). No es una prueba en sí.
import { createClient } from '@supabase/supabase-js';
import { expect } from '@playwright/test';

export function credenciales() {
  const { TEST_EMAIL: email, TEST_PASSWORD: password } = process.env;
  if (!email || !password) throw new Error('Faltan TEST_EMAIL y TEST_PASSWORD en el entorno (.env).');
  return { email, password };
}

// SKU distinto en cada prueba y en cada corrida.
export function skuUnico(prefijo = 'E2E') {
  return `${prefijo}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
}

export async function iniciarSesion(page) {
  const { email, password } = credenciales();
  await page.goto('/');
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.getByRole('heading', { name: 'Agregar producto' })).toBeVisible();
}

export async function agregarProducto(page, { nombre, sku, cantidad, minimo }) {
  await page.getByLabel('Nombre', { exact: true }).first().fill(nombre);
  await page.getByLabel('SKU').first().fill(sku);
  await page.getByLabel('Cantidad inicial').fill(String(cantidad));
  await page.getByLabel('Cantidad mínima').first().fill(String(minimo));
  await page.getByRole('button', { name: 'Agregar', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: `Se agregó «${nombre}».` })).toBeVisible();
}

// Borra por SKU los productos que creó una prueba. La base los borra en cascada
// con sus movimientos. RLS limita el borrado a los productos de esa usuaria.
export async function borrarProductos(skus) {
  if (skus.length === 0) return;
  const { SUPABASE_URL, SUPABASE_KEY } = process.env;
  const cliente = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
  const { error: errorSesion } = await cliente.auth.signInWithPassword(credenciales());
  if (errorSesion) throw new Error(`No se pudo limpiar: ${errorSesion.message}`);
  const { error } = await cliente.from('productos').delete().in('sku', skus);
  if (error) throw new Error(`No se pudo limpiar: ${error.message}`);
}
