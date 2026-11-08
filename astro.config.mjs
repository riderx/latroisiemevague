import { defineConfig } from 'astro/config'

export default defineConfig({
  site: 'https://latroisiemevague.com',
  output: 'static',
  trailingSlash: 'always',
  build: { inlineStylesheets: 'always', format: 'directory' },
  prefetch: { prefetchAll: true, defaultStrategy: 'hover' },
  image: { responsiveStyles: false },
})
