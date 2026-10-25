import { defineConfig } from '@playwright/test';
import original from './playwright.config';
export default defineConfig({
  ...original,
  webServer: undefined,
  outputDir: '/tmp/king-arthur-e2e',
  use: { ...original.use, baseURL: 'http://localhost:5197' },
});
