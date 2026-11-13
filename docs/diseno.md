# Diseño técnico — Mini Inventario "Super Dami"

Este documento describe cómo se construyen las historias de [requisitos.md](requisitos.md) (HU1–HU5).

## 1. Arquitectura

```
Navegador (HTML + JS sin framework)
  │  1. GET páginas, JS, CSS ─────────────▶  Express (Node.js 22)
  │                                           sirve archivos estáticos y /config.js
  │
  │  2. Auth y datos (supabase-js) ───────▶  Supabase
  │     JWT de la usuaria en cada petición     ├─ Auth (correo + contraseña)
  │                                            └─ Postgres: tablas, RLS, función, vista
```

- **Express** solo sirve la página: los HTML, el JS, el CSS y un `/config.js` con la URL de Supabase y la *anon key*. No tiene endpoints de datos.
- **El navegador** habla directamente con Supabase usando `@supabase/supabase-js`. Cada petición lleva el JWT de la sesión.
- **Supabase** es la única fuente de verdad. La seguridad depende de Row Level Security (RLS), de los permisos por columna y de las restricciones de las tablas, no del código del navegador.

**Por qué no hay una API en Express:** con RLS, Postgres ya garantiza que cada usuaria solo toque sus datos. Una API intermedia duplicaría las validaciones sin añadir seguridad. Para que la validación sea la misma en cualquier capa, los datos de entrada se describen una sola vez con esquemas de Zod (sección 5). Si más adelante hace falta lógica que no deba vivir en el navegador (por ejemplo, correos o informes), se añadirán endpoints a Express.

## 2. Estructura del proyecto

```
server.js                     Express: estáticos, /config.js, cabeceras de seguridad
package.json                  dependencias: express, @supabase/supabase-js, zod
.env.example                  SUPABASE_URL, SUPABASE_ANON_KEY, PORT (sin valores reales)
public/
  index.html                  inicio de sesión y registro (HU1)
  inventario.html             lista de productos y alta (HU2, HU5)
  producto.html?id=<uuid>     editar, registrar movimientos e historial (HU3, HU4)
  bajo-minimo.html            vista "Bajo mínimo" (HU5)
  css/estilos.css
  js/cliente.js               crea el cliente de Supabase a partir de window.CONFIG
  js/sesion.js                protege las páginas, cierra la sesión
  js/esquemas.js              esquemas Zod de todos los datos que entran (ver sección 5)
  js/errores.js               traduce los errores de Supabase a mensajes en español
  js/inventario.js, js/producto.js, js/bajo-minimo.js, js/login.js
supabase/migrations/
  001_esquema.sql             tablas, restricciones, RLS, permisos, trigger, función, vista
tests/
  esquemas.test.js            pruebas de los esquemas con node:test
```

Las librerías supabase-js y Zod se instalan con npm y Express las sirve desde `node_modules` (`/vendor/supabase.js` y `/vendor/zod.mjs`). Así sus versiones quedan fijadas en `package-lock.json` y no se depende de un CDN.

## 3. Configuración y secretos

- `SUPABASE_URL` y `SUPABASE_ANON_KEY` se leen de `.env` con `node --env-file=.env server.js`. `.env` ya está en `.gitignore`, y en el repositorio solo se sube `.env.example`.
- La *anon key* es pública por diseño (llega al navegador); lo que protege los datos es RLS.
- **La `service_role` key no se usa en este proyecto**, y por tanto nunca va en `.env` ni llega al navegador.
- En Supabase Auth: el proveedor *Email* activado, una longitud mínima de contraseña de 8 y la opción *Confirm email* **desactivada**. Esto último es necesario porque HU1-1 pide quedar con la sesión iniciada justo al registrarse y HU1-2 pide avisar si el correo ya existe; con la confirmación activada, Supabase oculta esa información.

## 4. Modelo de datos

### 4.1 Tabla `productos`

```sql
create table productos (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null default auth.uid()
                          references auth.users(id) on delete cascade,
  nombre      text        not null check (length(trim(nombre)) between 1 and 100),
  sku         text        not null check (length(trim(sku)) between 1 and 50),
  cantidad    integer     not null default 0 check (cantidad >= 0),
  minimo      integer     not null check (minimo >= 0),
  created_at  timestamptz not null default now()
);

create unique index productos_user_sku_unico on productos (user_id, lower(trim(sku)));
```

- `cantidad` es el stock actual. Se fija al crear el producto y después solo la modifica la función `registrar_movimiento`.
- El SKU es único por usuaria y no distingue mayúsculas de minúsculas (`abc-1` y `ABC-1` se consideran el mismo).
- `integer` rechaza los decimales: Postgres no convierte en silencio un `2.5` enviado como cantidad.

### 4.2 Tabla `movimientos` (necesaria para HU4)

```sql
create table movimientos (
  id           uuid        primary key default gen_random_uuid(),
  producto_id  uuid        not null references productos(id) on delete cascade,
  user_id      uuid        not null references auth.users(id) on delete cascade,
  tipo         text        not null check (tipo in ('inicial', 'entrada', 'salida')),
  unidades     integer     not null check (unidades >= 0),
  nota         text        check (nota is null or length(nota) <= 200),
  created_at   timestamptz not null default now(),
  check (tipo = 'inicial' or unidades > 0)
);

create index movimientos_producto_fecha on movimientos (producto_id, created_at desc);
```

- Un trigger `after insert` sobre `productos` crea un movimiento de tipo `inicial` con la cantidad inicial. Así se puede comprobar HU4-4 solo con el historial: **cantidad = inicial + entradas − salidas**.
- Las usuarias no insertan en esta tabla directamente; lo hacen el trigger y la función.

### 4.3 Función `registrar_movimiento(producto_id, tipo, unidades, nota)`

Es una función `security definer` con `search_path` fijado. Todo ocurre en una sola transacción:

1. Rechaza un `tipo` distinto de `entrada`/`salida` y unas `unidades` que no sean mayores que 0.
2. Calcula el cambio (+unidades o −unidades) y hace un único `update productos set cantidad = cantidad + cambio where id = … and user_id = auth.uid() and cantidad + cambio >= 0 returning cantidad`.
3. Si no se actualizó ninguna fila: lanza `NO_ENCONTRADO` si el producto no existe o es de otra persona, o `STOCK_INSUFICIENTE` en cualquier otro caso.
4. Inserta el movimiento y devuelve la nueva cantidad.

Como la comprobación y la resta van en el mismo `update`, dos salidas simultáneas no pueden dejar el stock en negativo. Si algo falla no se inserta nada, lo que cumple HU4-5.

### 4.4 Vista `productos_bajo_minimo` (HU5)

```sql
create view productos_bajo_minimo with (security_invoker = true) as
  select id, nombre, sku, cantidad, minimo, (minimo - cantidad + 1) as faltan
  from productos
  where cantidad <= minimo;
```

`security_invoker` hace que la vista respete el RLS de quien la consulta. Hace falta una vista porque supabase-js no permite comparar dos columnas en un filtro.

### 4.5 RLS y permisos

| Tabla | select | insert | update | delete |
|---|---|---|---|---|
| `productos` | `user_id = auth.uid()` | `user_id = auth.uid()` | solo `nombre`, `sku`, `minimo`, y solo en sus filas | sin permiso (fuera de alcance) |
| `movimientos` | `user_id = auth.uid()` | sin permiso (solo trigger y función) | sin permiso | sin permiso |

- Se activa RLS en ambas tablas.
- El rol `authenticated` recibe `grant update (nombre, sku, minimo) on productos`, sin la columna `cantidad`. Así HU3-3 se cumple también en la base de datos y no solo en el formulario.
- Se revoca todo al rol `anon`, de modo que sin sesión no se lee nada.

## 5. Validación de esquemas con Zod

Todos los datos que entran a la aplicación se describen con un esquema de **Zod** en un único módulo, `public/js/esquemas.js`. Así cada historia nueva sigue el mismo patrón y no hay reglas repetidas ni contradictorias entre pantallas.

**Por qué Zod:** es ligera, no tiene dependencias, funciona igual en el navegador y en Node y da mensajes por campo. Joi está pensada para Node y pesa más en el navegador.

### 5.1 Dónde vive y cómo se carga

- `esquemas.js` es un módulo ES que hace `import { z } from 'zod'`.
- En el navegador, un *import map* en cada HTML resuelve `zod` a `/vendor/zod.mjs`, que Express sirve desde `node_modules`.
- En Node (pruebas y, en el futuro, endpoints de Express), `zod` se resuelve con npm. **El mismo archivo funciona en las dos partes sin cambios.**
- Se fija una versión exacta de Zod en `package.json`. Al implementar hay que comprobar que el archivo servido como `/vendor/zod.mjs` es un único módulo ES sin imports internos; si no lo es, se genera ese archivo con un paso de *bundle* (esbuild) en `npm run build:vendor`.
- Hoy Express no recibe datos, así que los esquemas se ejecutan en el navegador. Si mañana se añade un endpoint, valida su `req.body` con estos mismos esquemas antes de hacer nada más.

### 5.2 Esquemas iniciales

| Esquema | Uso | Reglas |
|---|---|---|
| `credenciales` | registro e inicio de sesión (HU1) | `email` válido; `password` de 8 a 72 caracteres (72 es el límite de bcrypt) |
| `productoNuevo` | alta (HU2) | `nombre` 1–100 y `sku` 1–50 tras quitar espacios; `cantidad` y `minimo` enteros ≥ 0 |
| `productoEdicion` | edición (HU3) | `nombre`, `sku` y `minimo` con las mismas reglas; **`.strict()`**, así que enviar `cantidad` es un error |
| `movimiento` | entradas y salidas (HU4) | `producto_id` uuid; `tipo` `entrada` o `salida`; `unidades` entero > 0; `nota` opcional ≤ 200 |
| `idProducto` | parámetro `?id=` de `producto.html` | uuid; si no lo es, "Producto no encontrado" sin consultar a Supabase |

Convenciones para todos los esquemas, actuales y futuros:

1. **Un esquema por dato de entrada, siempre en `esquemas.js`.** Una historia nueva añade o extiende esquemas ahí y nunca valida "a mano" en su pantalla. Los esquemas parecidos se derivan unos de otros (`productoNuevo.pick(...)`, `.extend(...)`) en lugar de copiarse.
2. **Los límites son constantes compartidas** (`LIMITES = { nombre: 100, sku: 50, nota: 200 }`) y coinciden con los `check` del SQL. Una prueba falla si alguien cambia uno sin el otro.
3. **Todos los esquemas usan `.strict()`:** un campo desconocido es un error, no se ignora.
4. **Los valores de formulario llegan como texto.** Se recorta el texto y una cadena vacía se convierte en `undefined` antes de validar. No se usa `z.coerce.number()` directamente, porque convierte `""` en `0` y aceptaría un campo vacío.
5. **Los mensajes de error están en español** y se definen en el esquema, que es la única fuente de los textos de validación.
6. **Una sola función de entrada:** `validar(esquema, datos)` devuelve `{ ok: true, datos }` (ya limpios y con sus tipos) o `{ ok: false, errores: { campo: mensaje } }`. Los formularios solo envían a Supabase el `datos` que devuelve `validar`.

## 6. Qué valida cada capa

La regla: **el navegador valida para ayudar, Supabase valida para proteger.** Nada que solo compruebe el navegador se considera garantizado. Los esquemas de Zod no sustituyen a las restricciones de Postgres; las repiten para dar mensajes antes de hacer una petición.

### 6.1 Navegador (HTML + JS)

Su función es dar mensajes claros y rápidos sin hacer peticiones inútiles.

- **Atributos HTML:** `required`, `type="email"`, `minlength="8"` en la contraseña, `type="number" min="0" step="1"` en cantidad y mínimo, `min="1"` en las unidades de un movimiento, y `maxlength` en nombre, SKU y nota. Son solo una ayuda visual; la validación real la hace Zod.
- **Esquemas de Zod:** cada formulario pasa sus datos por `validar(...)` con el esquema que le corresponde antes de enviarlos, y marca el campo con su mensaje de error (HU2-2, HU2-3).
- **Salida mayor que el stock:** se comprueba contra la cantidad mostrada en pantalla, fuera del esquema, porque depende de un dato de la base. Es solo un aviso previo; la función de la base de datos es quien decide.
- **`sesion.js`:** si no hay sesión, las páginas protegidas redirigen a `index.html` (HU1-4).
- **`errores.js`:** convierte las respuestas de Supabase en los mensajes de los requisitos (ver 6.4).
- **Al mostrar datos:** usa `textContent`, nunca `innerHTML`, para que un nombre como `<script>` no se ejecute.

### 6.2 Express

No valida datos del inventario, porque no los recibe; si en el futuro los recibe, los valida con los esquemas de la sección 5. Hoy sí valida:

- **Al arrancar:** que existan `SUPABASE_URL` y `SUPABASE_ANON_KEY`; si falta alguna, el proceso termina con un mensaje claro en lugar de servir una app rota.
- **Las peticiones:** solo responde a `GET` de archivos de `public/`, `/config.js`, `/vendor/supabase.js` y `/vendor/zod.mjs`; para el resto devuelve 404. `express.static` impide salir de `public/` con rutas como `../`.
- **Cabeceras de seguridad:** una `Content-Security-Policy` que solo permite scripts propios (más el hash del *import map*, que va en línea) y conexiones a `SUPABASE_URL`, además de `X-Content-Type-Options: nosniff` y `Referrer-Policy`.

### 6.3 Supabase

Es la capa que garantiza las reglas aunque alguien se salte el navegador (por ejemplo, llamando a la API con la anon key y su propio JWT).

| Regla | Dónde se aplica | Historia |
|---|---|---|
| Correo válido, contraseña ≥ 8, correo no repetido | Supabase Auth | HU1-1, HU1-2 |
| La contraseña se guarda con hash (bcrypt) | Supabase Auth | HU1-5 |
| Sin sesión no se lee nada | permisos de `anon` + RLS | HU1-4 |
| Nombre y SKU no vacíos, longitudes máximas | `check` en `productos` | HU2-2, HU3-2 |
| Cantidad y mínimo enteros ≥ 0 | tipo `integer` + `check` | HU2-3, HU3-2 |
| SKU único por usuaria | índice único `(user_id, lower(trim(sku)))` | HU2-4, HU3-2 |
| Cada quien ve y edita solo lo suyo | RLS (`user_id = auth.uid()`) | HU2-5, HU3-5 |
| La cantidad no se edita directamente | `grant update` sin la columna `cantidad` | HU3-3 |
| Unidades > 0, tipo válido, sin stock negativo, todo o nada | `registrar_movimiento` + `check` | HU4-1, HU4-2, HU4-5 |
| El historial cuadra con el stock | trigger del movimiento `inicial` + cambios solo vía la función | HU4-4 |
| La regla de bajo mínimo es `cantidad <= minimo` | vista `productos_bajo_minimo` | HU5-1 |

### 6.4 Traducción de errores

Los errores de Zod ya vienen en español desde el esquema. Los errores de Supabase se traducen en `errores.js`:

| Respuesta de Supabase | Mensaje en pantalla |
|---|---|
| Auth: `user_already_exists` | "Ese correo ya tiene una cuenta" |
| Auth: `invalid_credentials` | "Correo o contraseña incorrectos" |
| Postgres `23505` (índice de SKU) | "Ya existe un producto con este SKU" |
| Postgres `23514` (`check`) | error en el campo correspondiente (según el nombre de la restricción) |
| Función: `STOCK_INSUFICIENTE` | "No hay stock suficiente" |
| Función: `NO_ENCONTRADO`, o consulta por `id` sin filas | "Producto no encontrado" |
| Cualquier otro error | "Algo salió mal, intenta de nuevo" (el detalle va a la consola) |

## 7. Flujos principales

En todos los flujos, primero se ejecuta `validar(esquema, datos)` y solo se llama a Supabase si el resultado es `ok`.

- **Registro / inicio de sesión (HU1):** `auth.signUp` o `auth.signInWithPassword`, después redirección a `inventario.html`. Cerrar sesión llama a `auth.signOut` y vuelve a `index.html`.
- **Alta (HU2):** `from('productos').insert({nombre, sku, cantidad, minimo})`. `user_id` lo pone Postgres y el trigger crea el movimiento `inicial`.
- **Edición (HU3):** `from('productos').update({nombre, sku, minimo}).eq('id', id)`. Si no se actualiza ninguna fila, se muestra "Producto no encontrado".
- **Movimiento (HU4):** `rpc('registrar_movimiento', {...})`; después se recargan la cantidad y el historial (`from('movimientos').select().eq('producto_id', id).order('created_at', {ascending: false})`).
- **Bajo mínimo (HU5):** `from('productos_bajo_minimo').select()`. Si no hay filas: "Todo en orden: ningún producto bajo el mínimo". La lista general marca con la etiqueta "Bajo mínimo" los productos con `cantidad <= minimo`.

## 8. Verificación

- **Pruebas unitarias** (`node --test`): cada esquema de `esquemas.js` con casos límite: `0`, `-1`, `2.5`, `"abc"`, `""`, espacios, campos desconocidos, `cantidad` en `productoEdicion` y uuid inválido. También se comprueba que `LIMITES` coincide con los `check` de `001_esquema.sql`.
- **Pruebas de la base de datos:** con dos cuentas de prueba (A y B) se comprueba con supabase-js que B no lee ni edita productos de A, que actualizar `cantidad` directamente falla, que una salida mayor que el stock falla sin crear un movimiento, y que la suma del historial coincide con `cantidad`.
- **Prueba manual:** recorrer cada criterio de aceptación de `requisitos.md` en el navegador.
- **Revisión de secretos:** antes de cada PR se confirma que `git status` no incluye `.env` y que la `service_role` key no aparece en el código.

## 9. Fuera de alcance

Eliminar productos, buscar y filtrar, recuperar la contraseña, confirmar el correo, inventarios compartidos y despliegue. El despliegue requiere aprobación explícita, como indica el CLAUDE.md.
