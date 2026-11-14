# mini-inventario

Proyecto de inventario sencillo.

## Requisitos

- Node.js 22
- Python 3.12

## Cómo empezar

1. Clona el repositorio y entra en la carpeta:

   ```bash
   git clone https://github.com/Dambril/mini-inventario.git
   cd mini-inventario
   ```

2. Comprueba que tienes las versiones requeridas:

   ```bash
   node --version    # debe mostrar v22.x
   python --version  # debe mostrar Python 3.12.x
   ```

3. Comprueba el estado del repositorio y el historial de versiones:

   ```bash
   git status
   git log --oneline
   ```

## Ejecutar la aplicación

```bash
npm install
npm start          # empaqueta Zod para el navegador y abre http://localhost:3000
npm test           # pruebas con node:test
```

- El puerto se toma de `PORT` (por defecto, 3000). `GET /health` responde `{"status":"ok"}`.
- Por ahora los datos se guardan en el `localStorage` del navegador. Todo el acceso a datos está en `public/productos.js`, que se reemplazará por Supabase (ver `docs/diseno.md`).
- Aún no hay inicio de sesión.
