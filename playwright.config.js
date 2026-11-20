import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// TEST_EMAIL, TEST_PASSWORD, SUPABASE_URL y SUPABASE_KEY salen del entorno;
// en local se completan desde .env sin pisar lo que ya esté definido.
if (existsSync('.env')) process.loadEnvFile('.env');

const puerto = process.env.PORT || 3000;
const baseURL = `http://localhost:${puerto}`;

export default defineConfig({
  testDir: './tests',
  // Solo las pruebas de navegador; las de "npm test" (node --test) son *.test.js.
  testMatch: '**/*.spec.js',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm start',
    url: `${baseURL}/health`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
