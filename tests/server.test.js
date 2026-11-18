import { test, after } from 'node:test';
import assert from 'node:assert/strict';

// Llave anon legacy de prueba: un JWT cuyo payload dice role "anon".
const jwt = (rol) =>
  ['{"alg":"HS256"}', JSON.stringify({ role: rol })].map((parte) => Buffer.from(parte).toString('base64url')).join('.') +
  '.firma';

process.env.SUPABASE_URL = 'https://ejemplo.supabase.co';
process.env.SUPABASE_KEY = 'sb_publishable_prueba';
const { app, leerConfigSupabase } = await import('../server.js');

const servidor = app.listen(0);
const base = `http://localhost:${servidor.address().port}`;
after(() => servidor.close());

test('GET /health responde ok', async () => {
  const respuesta = await fetch(`${base}/health`);
  assert.equal(respuesta.status, 200);
  assert.deepEqual(await respuesta.json(), { status: 'ok' });
});

test('sirve la página con cabeceras de seguridad', async () => {
  const respuesta = await fetch(`${base}/`);
  assert.equal(respuesta.status, 200);
  assert.match(await respuesta.text(), /Super Dami/);
  const csp = respuesta.headers.get('content-security-policy');
  assert.match(csp, /script-src 'self' 'sha256-/);
  assert.match(csp, /connect-src 'self' https:\/\/ejemplo\.supabase\.co;/);
  assert.equal(respuesta.headers.get('x-content-type-options'), 'nosniff');
});

test('/config.js entrega la URL y la llave pública como módulo', async () => {
  const respuesta = await fetch(`${base}/config.js`);
  assert.equal(respuesta.status, 200);
  assert.match(respuesta.headers.get('content-type'), /javascript/);
  assert.equal(respuesta.headers.get('cache-control'), 'no-store');
  assert.equal(
    await respuesta.text(),
    'export default {"SUPABASE_URL":"https://ejemplo.supabase.co","SUPABASE_KEY":"sb_publishable_prueba"};\n',
  );
});

test('/config.js responde 503 si la configuración no es válida', async () => {
  const llave = process.env.SUPABASE_KEY;
  process.env.SUPABASE_KEY = 'sb_secret_prueba';
  try {
    assert.equal((await fetch(`${base}/config.js`)).status, 503);
  } finally {
    process.env.SUPABASE_KEY = llave;
  }
});

test('acepta la llave publishable y la anon legacy', () => {
  const url = 'https://ejemplo.supabase.co/';
  assert.deepEqual(leerConfigSupabase({ SUPABASE_URL: url, SUPABASE_KEY: 'sb_publishable_x' }), {
    url: 'https://ejemplo.supabase.co',
    llave: 'sb_publishable_x',
  });
  assert.equal(leerConfigSupabase({ SUPABASE_URL: url, SUPABASE_KEY: jwt('anon') }).llave, jwt('anon'));
});

test('rechaza la llave secreta, la service_role y las desconocidas', () => {
  const url = 'https://ejemplo.supabase.co';
  assert.throws(() => leerConfigSupabase({ SUPABASE_URL: url, SUPABASE_KEY: 'sb_secret_x' }), /secreta/);
  assert.throws(() => leerConfigSupabase({ SUPABASE_URL: url, SUPABASE_KEY: jwt('service_role') }), /service_role/);
  assert.throws(() => leerConfigSupabase({ SUPABASE_URL: url, SUPABASE_KEY: 'cualquier-cosa' }), /publishable/);
});

test('exige SUPABASE_URL y SUPABASE_KEY, y una URL válida', () => {
  assert.throws(() => leerConfigSupabase({}), /SUPABASE_URL y SUPABASE_KEY/);
  assert.throws(() => leerConfigSupabase({ SUPABASE_URL: 'no es url', SUPABASE_KEY: 'sb_publishable_x' }), /URL válida/);
  assert.throws(() => leerConfigSupabase({ SUPABASE_URL: 'ftp://x', SUPABASE_KEY: 'sb_publishable_x' }), /https/);
});

test('una ruta desconocida da 404 y no sale de public/', async () => {
  assert.equal((await fetch(`${base}/no-existe`)).status, 404);
  assert.equal((await fetch(`${base}/..%2fpackage.json`)).status, 404);
  assert.equal((await fetch(`${base}/.env`)).status, 404);
});
