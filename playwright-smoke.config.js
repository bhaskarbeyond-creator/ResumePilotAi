import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: /playwright-accessibility\.spec\.js/,
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4000',
    trace: 'on-first-retry',
    launchOptions: {
      args: ['--no-sandbox', '--headless=new', '--disable-gpu'],
    },
  },
  projects: [
    {
      name: 'chromium',
    },
  ],
});
