# La Troisième Vague

French, independent, sourced information about psychedelics, built with Astro and served by a Cloudflare Worker at **https://latroisiemevague.com** (the www hostname also serves the site; canonical URLs use the main domain).

## Development and verification

```sh
bun install --frozen-lockfile
bun run dev
bun run check
bun run test
bun run build
bun run verify:site
bunx playwright install chromium
bun run test:browser
```

## Structure

- `src/layouts/Base.astro`: document head, header (mega menus, mobile menu), footer. Design tokens and shared components live in `src/styles/site.css`; each page type has its own stylesheet (`home.css`, `guide.css`, `listing.css`, `article.css`, `prose.css`, `pages.css`). CSS is inlined at build time.
- Pages: home (`src/pages/index.astro`), the two hubs and the 32 guides (`ListingPage`, `GuidePage`), the articles (`ArticlePage`, `/blog/`), and `/aide/`, `/a-propos/`, `/contact/`, `/recherche/`, `404`.
- `src/data/site.ts`: substance families, illustration mapping, navigation, help lines and the Telegram link.
- Illustrations: `src/assets/ill/*.webp` (source files). `src/components/Ill.astro` serves them as responsive AVIF/WebP through `astro:assets`. The hero is split into a base image and floating pieces (`hero2-pieces.json`) so the pieces can be animated.
- Fonts (Erode, Switzer, from Fontshare under the ITF Free Font License) are self-hosted in `public/fonts`.

Articles are extracted at build time from the archived WordPress posts in `src/content-data/pages` (`src/lib/articles.ts`): only the article body is kept, with a dated archive notice. Two posts that gave practical preparation or dosing instructions are retired and redirect to the relevant guide. Legacy WordPress routes (archives, pagination, template pages) redirect through `public/_redirects`.

The guide library is the authorized French edition of Third Wave's guides. See [Third Wave content provenance and verification](docs/thirdwave-content.md).

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
