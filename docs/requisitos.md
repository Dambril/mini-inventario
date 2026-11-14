# Requisitos — Mini Inventario "Super Dami"

Web donde una persona inicia sesión, registra productos con nombre, SKU, cantidad y cantidad mínima, y ve cuáles están por debajo del mínimo.

## Decisiones

- Cada usuario tiene **su propio inventario**; nadie ve productos de otra persona.
- Las cuentas se crean con **registro con correo y contraseña** desde la web.
- Alcance de la primera versión: alta, edición, historial de movimientos (entradas y salidas) y vista de productos bajo mínimo. Eliminar y buscar quedan fuera por ahora.
- Un producto está **bajo mínimo** cuando **cantidad ≤ cantidad mínima**.
- El SKU es único **por usuario**; nombre y SKU son obligatorios.
- Cantidad y cantidad mínima son enteros ≥ 0.
- La cantidad inicial se fija al crear el producto; después **solo cambia mediante movimientos**, para que el historial cuadre siempre con el stock.
- Una salida no puede dejar la cantidad en negativo.

---

## HU1 — Registro e inicio de sesión

**Como** persona que gestiona su negocio, **quiero** crear una cuenta e iniciar sesión, **para** que mi inventario sea privado.

Criterios de aceptación:

1. Con un correo válido no registrado y contraseña de ≥ 8 caracteres, se crea la cuenta y quedo con sesión iniciada en mi inventario (vacío).
2. Si el correo ya está registrado, veo "Ese correo ya tiene una cuenta" y no se crea otra.
3. Con correo y contraseña correctos inicio sesión; con cualquiera incorrecto veo "Correo o contraseña incorrectos" (sin indicar cuál falló).
4. Al cerrar sesión, abrir la URL del inventario me redirige a la pantalla de inicio de sesión.
5. La contraseña no se guarda en texto plano (verificable revisando la base de datos).

## HU2 — Registrar un producto

**Como** usuaria con sesión iniciada, **quiero** registrar un producto con nombre, SKU, cantidad y cantidad mínima, **para** llevar su control.

Criterios de aceptación:

1. Con los 4 campos válidos, el producto aparece en mi lista con exactamente esos valores.
2. Si falta nombre o SKU, no se guarda y se señala el campo vacío.
3. Si cantidad o mínimo es negativo, decimal o no numérico, no se guarda y se muestra un error en ese campo.
4. Si ya tengo un producto con ese SKU, veo "Ya existe un producto con este SKU" y no se guarda; otro usuario sí puede usar el mismo SKU.
5. Un producto creado por la usuaria A no aparece en la lista de la usuaria B, ni es accesible por su URL directa (B recibe "no encontrado").

## HU3 — Editar un producto

**Como** usuaria, **quiero** corregir el nombre, SKU o cantidad mínima de un producto, **para** mantener los datos al día.

Criterios de aceptación:

1. Al guardar cambios válidos, la lista muestra los nuevos valores tras recargar la página.
2. Se aplican las mismas validaciones que en HU2 (campos obligatorios, enteros ≥ 0, SKU único por usuario).
3. El formulario de edición no permite cambiar la cantidad directamente; indica que se ajusta con movimientos (HU4).
4. Si cambio el mínimo de modo que cantidad ≤ mínimo, el producto pasa a aparecer como bajo mínimo (HU5) sin más acciones.
5. Una usuaria no puede editar productos de otra (la petición devuelve "no encontrado" y nada cambia).

## HU4 — Registrar entradas y salidas (historial)

**Como** usuaria, **quiero** registrar entradas y salidas de stock, **para** que la cantidad se actualice y quede constancia de cada cambio.

Criterios de aceptación:

1. Una entrada de N unidades (N entero > 0) suma N a la cantidad del producto.
2. Una salida de N unidades resta N; si N es mayor que la cantidad actual, se rechaza con "No hay stock suficiente" y la cantidad no cambia.
3. Cada movimiento guardado aparece en el historial del producto con fecha y hora, tipo (entrada/salida), unidades y nota opcional, ordenado del más reciente al más antiguo.
4. La cantidad actual siempre es igual a la cantidad inicial + entradas − salidas del historial.
5. Los movimientos rechazados no aparecen en el historial.

## HU5 — Ver productos bajo el mínimo

**Como** usuaria, **quiero** ver qué productos tienen cantidad ≤ mínimo, **para** saber qué reabastecer.

Criterios de aceptación:

1. Existe una vista "Bajo mínimo" que lista solo mis productos con cantidad ≤ cantidad mínima (ej.: cantidad 5 / mínimo 5 → aparece; 6 / 5 → no aparece).
2. En la lista general, esos productos se distinguen visualmente (etiqueta "Bajo mínimo", no solo color).
3. Tras registrar una salida que deja cantidad ≤ mínimo, el producto aparece en la vista al recargar; tras una entrada que la deja por encima, desaparece.
4. Cada fila muestra nombre, SKU, cantidad actual, mínimo y cuántas unidades faltan para superar el mínimo (mínimo − cantidad + 1).
5. Si ningún producto está bajo mínimo, se muestra "Todo en orden: ningún producto bajo el mínimo".
