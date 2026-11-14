import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import express from 'express';

const raiz = (ruta) => fileURLToPath(new URL(ruta, import.meta.url));
const ZOD_VENDOR = raiz('./vendor/zod.mjs');

// El import map va en línea en index.html; la CSP solo lo permite por su hash.
function hashImportMap() {
  const html = readFileSync(raiz('./public/index.html'), 'utf8');
  const bloque = html.match(/<script type="importmap">([\s\S]*?)<\/script>/);
  if (!bloque) throw new Error('index.html no tiene un <script type="importmap">');
  return createHash('sha256').update(bloque[1]).digest('base64');
}

const csp = [
  "default-src 'self'",
  `script-src 'self' 'sha256-${hashImportMap()}'`,
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

export const app = express();
app.disable('x-powered-by');

app.use((req, res, next) => {
  res.set({
    'Content-Security-Policy': csp,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  next();
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/vendor/zod.mjs', (req, res) => {
  res.type('text/javascript').sendFile(ZOD_VENDOR);
});

app.use(express.static(raiz('./public')));

app.use((req, res) => {
  res.status(404).type('text/plain').send('No encontrado');
});

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!existsSync(ZOD_VENDOR)) {
    console.error('Falta vendor/zod.mjs. Ejecuta "npm run build:vendor" (npm start lo hace solo).');
    process.exit(1);
  }
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Super Dami escuchando en http://localhost:${PORT}`);
  });
}
