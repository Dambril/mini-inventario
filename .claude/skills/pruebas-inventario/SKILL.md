---
name: pruebas-inventario
description: Escribe o corrige pruebas de navegador con Playwright para Mini Inventario (Super Dami). Úsala siempre que se pidan pruebas, tests, e2e o cobertura de Mini Inventario: inicio de sesión, agregar productos, SKU, stock o alerta "Bajo mínimo".
---

# Pruebas de Mini Inventario con Playwright

Sigue estas reglas al crear o modificar pruebas de la app.

## Dónde y cómo

- Las pruebas de navegador van en `tests/` con extensión `*.spec.js` (`playwright.config.js` solo recoge ese patrón; los `*.test.js` son de `node --test`).
- Usa `import { test, expect } from '@playwright/test'` y reutiliza las ayudas de `tests/ayudas-e2e.js` (`iniciarSesion`, `agregarProducto`, `skuUnico`, `borrarProductos`, `credenciales`) antes de escribir otras.
- Ejecuta con `npm run test:e2e`. El servidor lo levanta Playwright (`webServer`).
- Modelo a seguir: `tests/inventario.spec.js`.

## Reglas obligatorias

1. **Credenciales del entorno.** Lee `TEST_EMAIL`, `TEST_PASSWORD`, `SUPABASE_URL` y `SUPABASE_KEY` de `process.env` (en local salen de `.env`). Nunca escribas correos, contraseñas ni llaves en el código, ni las imprimas. Si faltan, falla con un error claro.
2. **SKU único por prueba.** Genera el SKU con `skuUnico()` en cada prueba; nunca uses SKU fijos, para que no choquen entre pruebas ni corridas.
3. **Borrar lo creado.** Registra cada SKU creado en un arreglo y bórralo en `test.afterEach` con `borrarProductos(creados)`, pase o falle la prueba. No dejes datos en la base.
4. **Selectores por rol o etiqueta.** Usa `getByRole` (button, heading, row, cell, tab, alert, status) y `getByLabel`. Evita CSS, XPath o `data-testid`, salvo que no exista rol ni etiqueta accesible (y entonces anótalo en un comentario).
5. **Caso correcto y caso de error.** Toda funcionalidad cubierta lleva como mínimo:
   - un caso feliz (p. ej. inicio de sesión válido, producto agregado y visible en la lista);
   - un caso de error (p. ej. contraseña incorrecta con el mensaje en un `alert` y sin entrar a la app, o SKU duplicado rechazado).
6. **Aserciones web-first.** Usa `await expect(locator)...`, sin `waitForTimeout` ni sleeps.

## Plantilla

```js
import { test, expect } from '@playwright/test';
import { agregarProducto, borrarProductos, iniciarSesion, skuUnico } from './ayudas-e2e.js';

let creados;
test.beforeEach(() => { creados = []; });
test.afterEach(async () => { await borrarProductos(creados); });

test('caso correcto', async ({ page }) => {
  const sku = skuUnico();
  creados.push(sku);
  await iniciarSesion(page);
  await agregarProducto(page, { sku, nombre: `Prueba ${sku}`, cantidad: 20, minimo: 5 });
  await expect(page.getByRole('row').filter({ hasText: sku })).toBeVisible();
});

test('caso de error', async ({ page }) => {
  // Datos inválidos → mensaje en getByRole('alert'), sin crear nada.
});
```

## Antes de terminar

- Corre `npm run test:e2e` y reporta el resultado real, incluidas las fallas.
- Comprueba que no quedaron productos de prueba en la base.
