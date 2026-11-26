# Día 10 – Resuelve un incidente de principio a fin

- **Issue:** https://github.com/Dambril/mini-inventario/issues/16
- **Pull request:** https://github.com/Dambril/mini-inventario/pull/17
- **URL pública:** https://mini-inventario-t2yp.onrender.com

## 1. El reporte y mi hipótesis

Reporte recibido: *«Pude guardar un producto con cantidad -5. La lista lo muestra como si nada y el inventario queda mal.»*

Antes de pedir ayuda escribí mi hipótesis ([`reporte.txt`](reporte.txt)): la cantidad negativa ya se bloquea en dos lugares, en la web (Zod, `cantidad >= 0`) y en la base (`check (cantidad >= 0)`). Si se confirmaba, pasaría al reporte alterno: *«Pude registrar dos productos con el mismo SKU»*. Para ese caso también esperaba que estuviera bloqueado, por el índice único `(user_id, lower(trim(sku)))`.

![Hipótesis](01-hipotesis.png)

## 2. Reproducción e investigación

Prompt:

> Tenemos este reporte de producción: [reporte]. Usa playwright-cli en la URL pública para reproducirlo y toma una captura. Revisa los logs recientes con el MCP de Render y consulta los datos con Supabase en solo lectura. Explica la causa. No cambies nada todavía.

El agente cargó la skill `pruebas-inventario` y usó el MCP de Render, `supabase-lectura` y playwright-cli en la URL pública.

- **Cantidad −5:** **no se reproduce.** La web bloquea el envío con Zod, y en los datos no hay filas con cantidad negativa. Mi hipótesis era correcta.
- **SKU repetido:** **encontró un hueco real.** La web (`trim` de JavaScript) y el índice único (`trim` de Postgres) **no limpian el texto igual**, y ninguno quita los caracteres invisibles ni junta los espacios internos. Por eso la misma cuenta podía guardar dos SKU que **en pantalla se ven iguales**:

| Diferencia respecto a `ABC-1` | ¿La web lo limpia? | ¿La base lo detecta como duplicado? |
|---|---|---|
| Espacios al inicio o al final | Sí | Sí |
| Tabulador o espacio no separable al final | Sí | **No**, si se llama directo a Supabase |
| Carácter invisible U+200B | **No** | **No** |
| Uno o dos espacios en medio (`ABC 1` / `ABC  1`) | **No** | **No** |

Los logs de Render no mostraban errores, y en los datos actuales no había SKU duplicados de este tipo: era un hueco en las reglas, no algo que ya hubiera pasado en producción.

![Prompt](02-prompt-reproducir.png)
![Causa](03-investigacion-causa.png)

## 3. Issue

Con `gh` se creó el **issue #16**: *"Una misma cuenta puede registrar SKU que se ven iguales (la web y la base normalizan distinto)"*, con la etiqueta `bug`. Tiene:
- **Pasos para reproducir** tres casos: A) carácter invisible desde la web; B) doble espacio interno desde la web; C) tabulador enviado directo a Supabase.
- **Causa:** el `trim` de JavaScript y el de Postgres no limpian lo mismo.
- **Criterios de aceptación:** la misma regla en la web y en la base, una migración nueva, pruebas, y que dos cuentas distintas puedan seguir usando el mismo SKU.

No incluyó correos, credenciales ni datos de usuarios.

![Issue creado](04-issue-creado.png)
![Issue #16](05-issue-16-github.png)

## 4. Primero la prueba

En la rama `dia-10-incidente`:

> Escribe una prueba de Playwright en tests/ que reproduzca el issue #16. Córrela y muéstrame que falla. No corrijas nada todavía.

El agente creó `tests/sku-duplicado.spec.js` con los casos A, B y C, más uno de control. Cada prueba usa un SKU único, cuenta las filas **en la base** (no en pantalla, porque HTML junta los espacios) y borra lo que creó.

**Resultado antes de corregir: 3 failed, 1 passed.** En los tres casos se esperaba 1 fila y quedaron 2.

![Prueba fallando](06-prueba-falla.png)

## 5. Corrección en la web y en la base

Prompt:

> Corrige el issue validando el dato en la web y agregando una restricción en la base con una migración mediante el MCP de Supabase. Primero muéstrame cuántas filas incumplen la regla y propón qué hacer con ellas. Espera mi aprobación antes de modificar datos o aplicar el SQL. Después corre las pruebas.

**Regla única del SKU**, en este orden:
1. Quitar caracteres invisibles (U+200B, U+FEFF, U+00AD y otros).
2. Unificar la forma Unicode (NFC).
3. Convertir cada grupo de espacios (incluidos tabuladores y espacios no separables) en un solo espacio.
4. Quitar el espacio inicial y el final.

- **Web:** `normalizarSku()` en `public/js/esquemas.js` aplica esa regla en el alta y en la edición.
- **Base:** la migración `supabase/migrations/002_sku_normalizado.sql` agrega `check productos_sku_normalizado`, que rechaza cualquier SKU que no esté normalizado, aunque se envíe directo a Supabase. Con eso, el índice único que ya existía detecta los duplicados que se ven iguales.
- **Filas incorrectas:** el agente contó las filas que incumplían la regla: **0**. No hubo que modificar ni borrar datos, y la restricción se pudo aplicar sin limpiar nada.
- **Documentación:** `docs/diseno.md` describe la regla y la nueva protección.

Revisé el SQL, el conteo y la forma de deshacerlo (`alter table ... drop constraint productos_sku_normalizado`) y **lo aprobé** ("Sí, ejecútalo").

![Corrección](07-correccion-inicio.png)
![SQL aprobado](09-sql-aprobado.png)

**Resultado después de corregir:** `npm test`, **43 aprobadas, 0 fallidas**; `npm run test:e2e`, **17 aprobadas**. Los casos A, B y C, que antes fallaban, ahora pasan.

![Pruebas pasan](10-pruebas-pasan.png)

## 6. Publicación y verificación

PR **#17** desde `dia-10-incidente` hacia `main`, que cierra el issue #16. Al hacer merge con el CI en verde, Render despliega la versión corregida. La protección de la base ya está activa en producción desde que se aplicó la migración, porque Render y la app local usan la misma base de Supabase.

## 7. Cierre del ciclo

**Qué aprendió el sistema:** que "SKU único" no basta si la web y la base no entienden igual qué es "el mismo" SKU. Una regla de validación tiene que vivir **en un solo lugar conceptual** y repetirse exactamente igual en cada capa. Ahora la regla está escrita en `docs/diseno.md`, aplicada en la web, impuesta por la base y protegida por pruebas que fallarían si alguna capa se desalinea. También quedó claro que un reporte puede ser incorrecto (el −5 ya estaba bloqueado) y aun así llevar a un problema real cercano.

**Siguiente requisito:** decidir qué hacer con **letras parecidas de otros alfabetos**, por ejemplo una `А` cirílica y una `A` latina, que hoy siguen contando como SKU distintos. También haría que la web **avise** cuando normaliza un SKU ("se quitaron espacios o caracteres invisibles"), en lugar de cambiarlo en silencio.

**Qué le delegaría a un agente:** reproducir reportes en la URL pública, leer logs con el MCP de Render, consultar datos en solo lectura, escribir la primera versión de la prueba que falla, proponer la migración y correr las pruebas. Lo hizo bien y rápido, y encontró casos que yo no había pensado.

**Qué seguiría revisando yo:** el **SQL antes de aplicarlo** en producción, el **conteo de filas afectadas** y qué se hace con ellas, **las decisiones de negocio** (por ejemplo, si `ABC 1` y `ABC  1` son el mismo SKU), lo que se publica en issues de un repositorio público y que no se cuelen secretos. Y mantendría la aprobación manual para cualquier escritura en la base o despliegue.

## 8. Bitácora

**Prompts clave:** el de reproducir e investigar (paso 2), el del issue (paso 3), el de la prueba que falla (paso 4) y el de la corrección con aprobación (paso 5).

**Error de la IA:** al escribir el código de prueba de la regla, la herramienta del agente convirtió las secuencias `​` en **caracteres invisibles reales** y rompió la expresión regular. El agente lo notó al ver resultados raros, consultó en Postgres qué texto había llegado y rehízo el código armando los caracteres desde sus códigos. Por eso el SQL y el JavaScript finales usan escapes (`\x200B`, `\u{200B}`) y no los caracteres literales. Lo detecté en la captura 08 y en su resumen final ("la herramienta de escritura había convertido el ​…").

![Error de la IA](08-error-ia-invisibles.png)

**Comando aprobado o rechazado:** trabajé en *manual mode*. Aprobé la migración `002_sku_normalizado.sql` solo después de ver que 0 filas incumplían la regla y cómo deshacerla. El agente **no escribió datos de prueba en producción sin pedirme permiso**: probó la regla con consultas de solo lectura sobre textos fijos. No acepté que hiciera commit, push o despliegue por su cuenta; esos pasos los hice yo.

**Cómo comprobé que funciona:**
- La prueba nueva falló antes de corregir (3 failed) y pasó después.
- Todas las pruebas pasan: 43 de `npm test` y 17 de `test:e2e`.
- La base rechaza un SKU no normalizado aunque se envíe directo a Supabase (caso C).
- El CI del PR #17 corre todas las pruebas antes del merge.
