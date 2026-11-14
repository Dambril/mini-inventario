import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../server.js';

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
  assert.match(respuesta.headers.get('content-security-policy'), /script-src 'self' 'sha256-/);
  assert.equal(respuesta.headers.get('x-content-type-options'), 'nosniff');
});

test('una ruta desconocida da 404 y no sale de public/', async () => {
  assert.equal((await fetch(`${base}/no-existe`)).status, 404);
  assert.equal((await fetch(`${base}/..%2fpackage.json`)).status, 404);
});
