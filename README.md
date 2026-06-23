# La Troisième Vague

Static Astro migration of `latroisiemevague.com`.

## Local

```bash
npm install
npm run crawl
npm run build
npm run dev
```

## Deployment

Production deploys run from GitHub Actions on pushes to `main`.

Required repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

The build output is deployed as Cloudflare Workers static assets from `dist/`.
