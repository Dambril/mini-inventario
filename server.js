import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import express from 'express';

const raiz = (ruta) => fileURLToPath(new URL(ruta, import.meta.url));
const VENDOR = {
  '/vendor/zod.mjs': raiz('./vendor/zod.mjs'),
  '/vendor/supabase.mjs': raiz('./vendor/supabase.mjs'),
};

// Solo se acepta la llave pública (publishable o anon legacy). La secret o
// service_role se salta RLS, así que nunca debe llegar al navegador.
function validarLlave(llave) {
  if (llave.startsWith('sb_publishable_')) return;
  if (llave.startsWith('sb_secret_')) {
    throw new Error('SUPABASE_KEY es una llave secreta (sb_secret_…). Usa la publishable.');
  }
  const partes = llave.split('.');
  if (partes.length === 3) {
    let rol;
    try {
      rol = JSON.parse(Buffer.from(partes[1], 'base64url').toString()).role;
    } catch {
      // Se informa abajo como rol desconocido.
    }
    if (rol === 'anon') return;
    throw new Error(`SUPABASE_KEY debe ser la llave anon, no la de rol "${rol ?? 'desconocido'}".`);
  }
  throw new Error('SUPABASE_KEY no parece una llave publishable (sb_publishable_…) ni anon.');
}

// Lee y valida SUPABASE_URL y SUPABASE_KEY; lanza un error con un mensaje claro.
export function leerConfigSupabase(env = process.env) {
  const { SUPABASE_URL: url, SUPABASE_KEY: llave } = env;
  const faltan = ['SUPABASE_URL', 'SUPABASE_KEY'].filter((nombre) => !env[nombre]);
  if (faltan.length > 0) throw new Error(`Falta ${faltan.join(' y ')} en .env (ver .env.example).`);

  let origen;
  try {
    origen = new URL(url);
  } catch {
    throw new Error('SUPABASE_URL no es una URL válida.');
  }
  if (!['https:', 'http:'].includes(origen.protocol)) throw new Error('SUPABASE_URL debe empezar por https://');
  validarLlave(llave);
  return { url: origen.origin, llave };
}

// El import map va en línea en index.html; la CSP solo lo permite por su hash.
function hashImportMap() {
  const html = readFileSync(raiz('./public/index.html'), 'utf8');
  const bloque = html.match(/<script type="importmap">([\s\S]*?)<\/script>/);
  if (!bloque) throw new Error('index.html no tiene un <script type="importmap">');
  return createHash('sha256').update(bloque[1]).digest('base64');
}

const SCRIPT_SRC = `script-src 'self' 'sha256-${hashImportMap()}'`;

// El navegador solo puede conectarse a este servidor y al proyecto de Supabase.
function csp(origenSupabase) {
  return [
    "default-src 'self'",
    SCRIPT_SRC,
    "style-src 'self'",
    "img-src 'self' data:",
    `connect-src 'self'${origenSupabase ? ` ${origenSupabase}` : ''}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

// Sin configuración válida (por ejemplo, en las pruebas) se sirve la página igual,
// pero /config.js responde 503.
function configOpcional() {
  try {
    return leerConfigSupabase();
  } catch {
    return null;
  }
}

export const app = express();
app.disable('x-powered-by');

app.use((req, res, next) => {
  res.set({
    'Content-Security-Policy': csp(configOpcional()?.url),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  next();
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Lo único que el navegador necesita para hablar con Supabase. La llave es pública
// por diseño: los datos los protege RLS.
app.get('/config.js', (req, res) => {
  const config = configOpcional();
  if (!config) return res.status(503).type('text/plain').send('Supabase no está configurado');
  res
    .type('text/javascript')
    .set('Cache-Control', 'no-store')
    .send(`export default ${JSON.stringify({ SUPABASE_URL: config.url, SUPABASE_KEY: config.llave })};\n`);
});

for (const [ruta, archivo] of Object.entries(VENDOR)) {
  app.get(ruta, (req, res) => {
    res.type('text/javascript').sendFile(archivo);
  });
}

app.use(express.static(raiz('./public')));

app.use((req, res) => {
  res.status(404).type('text/plain').send('No encontrado');
});

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (existsSync(raiz('./.env'))) process.loadEnvFile(raiz('./.env'));
  try {
    leerConfigSupabase();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
  if (Object.values(VENDOR).some((archivo) => !existsSync(archivo))) {
    console.error('Faltan archivos en vendor/. Ejecuta "npm run build:vendor" (npm start lo hace solo).');
    process.exit(1);
  }
  const PORT = process.env.PORT || 3000;
  // 0.0.0.0: necesario para que el contenedor acepte conexiones desde fuera.
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Super Dami escuchando en 0.0.0.0:${PORT}`);
  });
}
