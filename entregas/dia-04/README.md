\# Día 4 – Supabase



\## Prompts clave

\- (pega el prompt del paso 3 y el del paso 4)



\## Un error de la IA y cómo lo detecté

La primera migración solo creaba la tabla productos, pero public/productos.js

ya usaba movimientos, registrar\_movimiento y productos\_bajo\_minimo.

Lo detecté revisando el código y le pedí que los agregara.



\## Un comando que aprobé o rechacé

Aprobé apply\_migration solo una vez (no "permitir siempre") después de leer el SQL.

Ignoré el aviso de contraseñas filtradas porque requiere plan de pago.



\## SQL que aprobé y por qué

(explica la política de update: using + with check)



\## Cómo comprobé que funciona

\- Capturas: el usuario A y el usuario B no ven los productos del otro.

&#x20; !\[Usuario A](usuario-a.png)  !\[Usuario B](usuario-b.png)

\- git check-ignore .env confirma que .env no se sube.

