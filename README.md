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
cp .env.example .env   # y rellena SUPABASE_URL y SUPABASE_KEY
npm start              # empaqueta Zod y supabase-js para el navegador y abre http://localhost:3000
npm test               # pruebas con node:test
```

- `SUPABASE_KEY` es la llave **publishable** (`sb_publishable_…`) o la anon legacy. El servidor no arranca con la secret ni con la service_role.
- El navegador recibe la URL y la llave desde `GET /config.js`. Los datos los protege Row Level Security (ver `supabase/migrations/`).
- El inicio de sesión y el registro usan correo y contraseña (Supabase Auth). Todo el acceso a datos está en `public/productos.js`.
- El puerto se toma de `PORT` (por defecto, 3000). `GET /health` responde `{"status":"ok"}`.
