import { defineConfig, devices } from '@playwright/test';

// BASE_URL : site à tester. Par défaut, dist/ servi localement sous /coach-echecs/
// (même chemin que GitHub Pages). En CI après déploiement : l'URL publiée.
const external = !!process.env.BASE_URL;
const baseURL = process.env.BASE_URL || 'http://localhost:4173/coach-echecs/';
const webkit = !!process.env.WITH_WEBKIT;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 90000,
  expect: { timeout: 30000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['github'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: external ? undefined : {
    command: 'node scripts/serve.mjs 4173 dist /coach-echecs/',
    url: 'http://localhost:4173/coach-echecs/',
    reuseExistingServer: true,
  },
  projects: [
    { name: 'chromium-ordinateur', use: { ...devices['Desktop Chrome'] }, grepInvert: /@mobile/ },
    { name: 'chromium-mobile', use: { ...devices['Pixel 7'] }, grep: /@mobile/ },
    ...(webkit ? [{ name: 'webkit-iphone', use: { ...devices['iPhone 14'] }, grep: /@mobile|@smoke/ }] : []),
  ],
});
