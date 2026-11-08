import { defineConfig } from '@playwright/test'
const port = Number(process.env.PLAYWRIGHT_PORT ?? 4321)
const baseURL = `http://127.0.0.1:${port}`
export default defineConfig({
  testDir: './tests/browser',
  use: { baseURL, viewport: { width: 1440, height: 1000 } },
  webServer: { command: `bunx astro preview --host 127.0.0.1 --port ${port}`, url: baseURL, reuseExistingServer: false },
})
