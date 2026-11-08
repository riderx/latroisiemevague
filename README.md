# La Troisième Vague

Astro migration of `https://latroisiemevague.com`, deployed to a Cloudflare Worker at **https://latroisiemevague.com**. The www hostname also serves the site; canonical URLs use the main domain.

## Development and verification

```sh
bun install --frozen-lockfile
bun run dev
bun run check
bun run test
bun run build
bun run verify:migration
bunx playwright install chromium
bun run test:browser
```

The committed import contains all 37 WordPress sitemap routes, the second author archive page, and three additional blog pagination pages. All 15 posts are discoverable without JavaScript. Search and a real 404 page are also generated. Original page markup, responsive styles, images, metadata, and section anchors are retained; WordPress, Elementor, and jQuery scripts are replaced with a small native client module. No WordPress requests are needed to build or serve the site.

`src/content-data/pages/manifest.json` records the source routes and SHA-256 fingerprints of the original prose blocks. `verify:migration` checks these against the production build, along with internal links, section anchors, canonical URLs, local assets, and blog coverage. Existing comments remain readable; the WordPress login-to-comment prompt links to Contact instead. Obsolete decorative images from the defunct `letroisiemecycle.com` domain are deliberately omitted to match the live site's appearance. A broken source link and footnote target are repaired.

## Refreshing the WordPress import

```sh
bun run crawl
```

This is an explicit editorial update, not part of builds. The crawler reads the source sitemaps, follows internal archive links, caches responses in `.wordpress-import/cache`, downloads styles and media, and preserves full HTML instead of flattening it. Delete an individual cache file to fetch a newer version; remove `.wordpress-import/posts.json` to refresh the blog inventory. The committed import remains buildable after WordPress is retired.

## Forms

The Worker receives `POST /api/forms`. Contact messages and newsletter signups are saved in D1 database `latroisiemevague` before notifications are attempted. Both **martindonadieu@gmail.com** and **orion.aubert@gmail.com** receive transactional notifications from `contact@latroisiemevague.com`, with the visitor's address as Reply-To.

Notifications have separate delivery states for each recipient. A five-minute cron retries failures with backoff. A successful send is not normally repeated; as with any at-least-once outbox, a process failure between sending and recording delivery can cause a duplicate. Duplicate newsletter addresses and replayed form requests do not create new notifications. Forms enforce field and body limits, a honeypot, same-origin checks, and a D1-backed per-IP rate limit. Raw IP addresses are not stored. These are signup notifications, not a newsletter campaign sender.

```sh
bunx wrangler d1 migrations apply DB --local
bun run preview
```

Local Wrangler development simulates the bindings. Unit tests use SQLite with a mock email sender; browser tests intercept submissions and do not email real recipients.

## Deployment

```sh
bun run build
bun run deploy
```

`wrangler.jsonc` owns the `latroisiemevague-v2` Worker, its static assets, D1 binding, email restrictions, cron, and `latroisiemevague.com/*` and `www.latroisiemevague.com/*` routes. Cloudflare Email Sending must remain enabled for `latroisiemevague.com` with its SPF/DKIM records.

Pushes to `main` run checks and deploy through GitHub Actions. Repository secrets: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. The token needs access to Workers deployment, the zone's Workers routes, D1 migrations, and Email Sending bindings. The WordPress server and legacy Pages project are not deleted; the public domain is served by the Worker through routes on the existing proxied DNS records.
