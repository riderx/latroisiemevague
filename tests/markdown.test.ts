import { test } from 'node:test'
import assert from 'node:assert/strict'
import { markdownPath, serveAsset, wantsMarkdown } from '../worker/markdown.ts'
import { notFoundMarkdown, pageMarkdown } from '../scripts/build-markdown.mjs'

const SITE = 'https://latroisiemevague.com'
const files: Record<string, { body: string; type: string }> = {
  '/': { body: '<!doctype html><title>Accueil</title>', type: 'text/html; charset=utf-8' },
  '/index.md': { body: '# Accueil\n', type: 'text/markdown' },
  '/substances/lsd/': { body: '<!doctype html><title>LSD</title>', type: 'text/html; charset=utf-8' },
  '/substances/lsd/index.md': { body: '# LSD\n', type: 'text/markdown' },
  '/404.md': { body: notFoundMarkdown, type: 'text/markdown' },
  '/og.jpg': { body: 'jpeg', type: 'image/jpeg' },
}
const redirects: Record<string, string> = { '/about/': '/a-propos/', '/substances/lsd': '/substances/lsd/' }
/** Stands in for the Workers static-assets binding: files, `_redirects`, and the HTML 404 page. */
const assets = { async fetch(input: Request) {
  const { pathname } = new URL(input.url)
  if (redirects[pathname]) return new Response(null, { status: 301, headers: { Location: redirects[pathname] } })
  const file = files[pathname]
  return file ? new Response(file.body, { headers: { 'Content-Type': file.type } }) : new Response('<!doctype html><title>404</title>', { status: 404, headers: { 'Content-Type': 'text/html' } })
} } as unknown as Fetcher
const get = (path: string, accept: string, method = 'GET') => serveAsset(new Request(SITE + path, { method, headers: { accept } }), assets)

test('Accept parsing prefers Markdown only when asked at least as strongly as HTML', () => {
  const req = (accept: string) => new Request(SITE, { headers: { accept } })
  assert.equal(wantsMarkdown(req('text/markdown')), true)
  assert.equal(wantsMarkdown(req('text/markdown, text/html;q=0.9')), true)
  assert.equal(wantsMarkdown(req('text/html, text/markdown;q=0.5')), false)
  assert.equal(wantsMarkdown(req('text/html,application/xhtml+xml,*/*;q=0.8')), false)
  assert.equal(wantsMarkdown(req('*/*')), false)
  assert.equal(wantsMarkdown(req('text/markdown;q=0')), false)
})

test('page paths map to their Markdown copy; files have none', () => {
  assert.equal(markdownPath('/'), '/index.md')
  assert.equal(markdownPath('/substances/lsd/'), '/substances/lsd/index.md')
  assert.equal(markdownPath('/substances/lsd'), '/substances/lsd/index.md')
  assert.equal(markdownPath('/og.jpg'), null)
  assert.equal(markdownPath('/llms.txt'), null)
})

test('Accept: text/markdown on the home page returns Markdown with Vary: Accept', async () => {
  const res = await get('/', 'text/markdown')
  assert.equal(res.status, 200)
  assert.match(res.headers.get('content-type')!, /^text\/markdown/)
  assert.match(res.headers.get('vary')!, /Accept/)
  assert.equal(await res.text(), '# Accueil\n')
})

test('Accept: text/html keeps the HTML page and adds Vary: Accept', async () => {
  const res = await get('/', 'text/html')
  assert.equal(res.status, 200)
  assert.match(res.headers.get('content-type')!, /^text\/html/)
  assert.match(res.headers.get('vary')!, /Accept/)
  assert.match(await res.text(), /<title>Accueil/)
})

test('a missing page returns 404 with a Markdown body that links to llms.txt and the sitemap', async () => {
  const res = await get('/nexiste-pas/', 'text/markdown')
  assert.equal(res.status, 404)
  assert.match(res.headers.get('content-type')!, /^text\/markdown/)
  const body = await res.text()
  assert.ok(body.length >= 20)
  assert.match(body, /llms\.txt/)
  assert.match(body, /sitemap\.xml/)
  assert.equal((await get('/nexiste-pas/', 'text/html')).status, 404)
})

test('redirects still apply to Markdown requests', async () => {
  const res = await get('/about/', 'text/markdown')
  assert.equal(res.status, 301)
  assert.equal(res.headers.get('location'), '/a-propos/')
  assert.match(res.headers.get('vary')!, /Accept/)
  assert.equal((await get('/substances/lsd', 'text/markdown')).status, 200)
})

test('HEAD returns Markdown headers without a body, and files are served untouched', async () => {
  const head = await get('/substances/lsd/', 'text/markdown', 'HEAD')
  assert.equal(head.status, 200)
  assert.match(head.headers.get('content-type')!, /^text\/markdown/)
  assert.equal(await head.text(), '')
  const image = await get('/og.jpg', 'text/markdown')
  assert.equal(image.headers.get('content-type'), 'image/jpeg')
  assert.equal(image.headers.get('vary'), null)
})

test('page Markdown keeps the main content, drops decoration and makes links absolute', () => {
  const md = pageMarkdown(`<!doctype html><html><head><title>LSD | La Troisième Vague</title><meta name="description" content="Effets et risques."><link rel="canonical" href="${SITE}/substances/lsd/"></head>
    <body><header><nav>Menu</nav></header><main><h1>LSD</h1><p>Voir <a href="/aide/">l’aide</a>.</p><span class="gnum" aria-hidden="true">01</span><img src="/a.webp" alt=""><button>Ouvrir</button></main><footer>Pied</footer></body></html>`)
  assert.match(md, /^# LSD/)
  assert.match(md, /\[l’aide\]\(https:\/\/latroisiemevague\.com\/aide\/\)/)
  assert.doesNotMatch(md, /Menu|Pied|Ouvrir|01|a\.webp/)
  assert.match(md, /Source : https:\/\/latroisiemevague\.com\/substances\/lsd\//)
})
