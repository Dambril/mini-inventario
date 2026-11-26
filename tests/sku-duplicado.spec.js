// Issue #16: una misma cuenta puede registrar SKU que se ven iguales, porque la
// web (trim de JavaScript) y el índice único (trim de Postgres) normalizan distinto.
import { createClient } from '@supabase/supabase-js';
import { test, expect } from '@playwright/test';
import { agregarProducto, borrarProductos, credenciales, iniciarSesion, skuUnico } from './ayudas-e2e.js';

const MENSAJE_DUPLICADO = 'Ya existe un producto con este SKU';

// SKUs creados por la prueba en curso; se borran al terminar, pase o falle.
let creados;
test.beforeEach(() => {
  creados = [];
});
test.afterEach(async () => {
  await borrarProductos(creados);
});

// Cliente con la sesión de la cuenta de prueba, sin pasar por la web ni por Zod.
async function clienteConSesion() {
  const { SUPABASE_URL, SUPABASE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Faltan SUPABASE_URL y SUPABASE_KEY en el entorno (.env).');
  const cliente = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
  const { error } = await cliente.auth.signInWithPassword(credenciales());
  if (error) throw new Error(`No se pudo iniciar sesión: ${error.message}`);
  return cliente;
}

// Cuántos de estos SKU exactos quedaron guardados. Se pregunta a la base porque la
// lista de la página se repinta después del mensaje y junta los espacios.
async function guardados(skus) {
  const cliente = await clienteConSesion();
  const { data, error } = await cliente.from('productos').select('sku').in('sku', skus);
  if (error) throw new Error(`No se pudo consultar: ${error.message}`);
  return data.map(({ sku }) => JSON.stringify(sku)).sort();
}

// Crea "primero" desde la web, intenta crear "segundo" y espera la respuesta.
async function intentarDuplicar(page, primero, segundo) {
  creados.push(primero, segundo);
  await iniciarSesion(page);
  await agregarProducto(page, { sku: primero, nombre: `Primero ${primero}`, cantidad: 10, minimo: 1 });

  const alta = page.getByRole('region', { name: 'Agregar producto' });
  await alta.getByLabel('Nombre', { exact: true }).fill(`Segundo ${primero}`);
  await alta.getByLabel('SKU').fill(segundo);
  await alta.getByLabel('Cantidad inicial').fill('10');
  await alta.getByLabel('Cantidad mínima').fill('1');
  await alta.getByRole('button', { name: 'Agregar', exact: true }).click();

  const rechazo = alta.getByText(MENSAJE_DUPLICADO);
  const exito = alta.getByRole('status').filter({ hasText: `Se agregó «Segundo ${primero}».` });
  await expect(rechazo.or(exito)).toBeVisible();
  return rechazo;
}

async function esperarRechazoEnLaWeb(page, primero, segundo) {
  const rechazo = await intentarDuplicar(page, primero, segundo);
  const filas = await guardados([primero, segundo]);
  expect(filas, `solo debe guardarse el primero; en la base: ${filas.join(' y ')}`).toHaveLength(1);
  await expect(rechazo).toBeVisible();
}

// Control: este duplicado ya se rechazaba antes de la corrección.
test('control: rechaza un SKU que solo cambia en mayúsculas y espacios en los extremos', async ({ page }) => {
  const sku = skuUnico();
  await esperarRechazoEnLaWeb(page, sku, `  ${sku.toLowerCase()}  `);
});

test('#16 A: rechaza un SKU que solo añade un carácter invisible (U+200B)', async ({ page }) => {
  const sku = skuUnico();
  await esperarRechazoEnLaWeb(page, sku, `${sku}\u{200B}`);
});

test('#16 B: rechaza un SKU que solo cambia en un doble espacio interno', async ({ page }) => {
  const base = skuUnico();
  await esperarRechazoEnLaWeb(page, `${base} 1`, `${base}  1`);
});

// Inserta directo en Supabase, sin pasar por la web ni por Zod.
async function insertador(nombre) {
  const cliente = await clienteConSesion();
  return (sku) => cliente.from('productos').insert({ nombre, sku, cantidad: 10, minimo: 1 });
}

test('#16 C: la base rechaza un SKU que solo añade un tabulador, sin pasar por la web', async () => {
  const sku = skuUnico();
  const conTabulador = `${sku}\t`;
  creados.push(sku, conTabulador);
  const insertar = await insertador(`Prueba ${sku}`);

  const { error: errorPrimero } = await insertar(sku);
  expect(errorPrimero).toBeNull();

  const { error } = await insertar(conTabulador);
  const filas = await guardados([sku, conTabulador]);
  expect(filas, `solo debe guardarse el primero; en la base: ${filas.join(' y ')}`).toHaveLength(1);
  expect(error?.code).toBe('23514'); // check productos_sku_normalizado
  expect(error?.message).toContain('productos_sku_normalizado');
});

for (const [caso, armar] of [
  ['un carácter invisible', (sku) => `${sku}\u{200B}`],
  ['un doble espacio interno', (sku) => `${sku}  1`],
  ['solo caracteres invisibles', () => '\u{200B}\u{2060}'],
]) {
  test(`#16: la base rechaza un SKU con ${caso}, aunque no esté repetido`, async () => {
    const sku = skuUnico();
    const invalido = armar(sku);
    creados.push(invalido);
    const insertar = await insertador(`Prueba ${sku}`);

    const { error } = await insertar(invalido);
    expect(error?.code).toBe('23514');
    expect(await guardados([invalido])).toHaveLength(0);
  });
}

test('#16: la base acepta un SKU normalizado y rechaza repetirlo en minúsculas', async () => {
  const sku = `${skuUnico()} Ñ 1`;
  creados.push(sku, sku.toLowerCase());
  const insertar = await insertador(`Prueba ${sku}`);

  const { error: errorPrimero } = await insertar(sku);
  expect(errorPrimero).toBeNull();

  const { error } = await insertar(sku.toLowerCase());
  expect(error?.code).toBe('23505'); // índice único
  expect(await guardados([sku, sku.toLowerCase()])).toHaveLength(1);
});

test('#16: la web guarda el SKU normalizado', async ({ page }) => {
  const base = skuUnico();
  const esperado = `${base} 1`;
  const escrito = `  ${base}\u{200B}   1 `;
  creados.push(esperado, escrito);
  await iniciarSesion(page);
  await agregarProducto(page, { sku: escrito, nombre: `Prueba ${base}`, cantidad: 10, minimo: 1 });

  expect(await guardados([esperado, escrito])).toEqual([JSON.stringify(esperado)]);
});

test('#16: un SKU de solo caracteres invisibles se pide como obligatorio', async ({ page }) => {
  const invisible = '\u{200B}\u{2060}';
  creados.push(invisible);
  await iniciarSesion(page);

  const alta = page.getByRole('region', { name: 'Agregar producto' });
  await alta.getByLabel('Nombre', { exact: true }).fill(`Prueba ${skuUnico()}`);
  await alta.getByLabel('SKU').fill(invisible);
  await alta.getByLabel('Cantidad inicial').fill('10');
  await alta.getByLabel('Cantidad mínima').fill('1');
  await alta.getByRole('button', { name: 'Agregar', exact: true }).click();

  await expect(alta.getByText('Este campo es obligatorio')).toBeVisible();
  await expect(alta.getByLabel('SKU')).toHaveAttribute('aria-invalid', 'true');
  expect(await guardados([invisible])).toHaveLength(0);
});

test('#16: al editar, rechaza un SKU que solo añade un carácter invisible', async ({ page }) => {
  const existente = skuUnico();
  const otro = skuUnico();
  const repetido = `${existente}\u{200B}`;
  creados.push(existente, otro, repetido);
  await iniciarSesion(page);
  await agregarProducto(page, { sku: existente, nombre: `Primero ${existente}`, cantidad: 10, minimo: 1 });
  await agregarProducto(page, { sku: otro, nombre: `Segundo ${otro}`, cantidad: 10, minimo: 1 });

  await page.getByRole('row').filter({ hasText: otro })
    .getByRole('button', { name: 'Editar / movimientos' }).click();
  const dialogo = page.getByRole('dialog');
  await dialogo.getByLabel('SKU').fill(repetido);
  await dialogo.getByRole('button', { name: 'Guardar cambios' }).click();

  await expect(dialogo.getByText(MENSAJE_DUPLICADO)).toBeVisible();
  await expect(dialogo.getByLabel('SKU')).toHaveAttribute('aria-invalid', 'true');
  // Nada cambió: cada producto conserva su SKU.
  expect(await guardados([existente, otro, repetido])).toEqual([existente, otro].map((v) => JSON.stringify(v)).sort());
});
