import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, access, readdir } from 'node:fs/promises'
import path from 'node:path'
import * as cheerio from 'cheerio'
const manifest = JSON.parse(await readFile('src/content-data/pages/manifest.json', 'utf8'))
const routes = new Set(manifest.pages.map(p => p.path))
const errors = []
const check = (value, message) => { if (!value) errors.push(message) }
const redirects = manifest.redirects
const assetPaths = new Set()
const documents = new Map()
const normalize = value => value.replace(/\s+/g, ' ').trim()
for (const page of manifest.pages) {
  const file = path.join('dist', page.path, 'index.html')
  const $ = cheerio.load(await readFile(file, 'utf8'))
  documents.set(page.path, $)
  const hashes = new Set($('main p, main h1, main h2, main h3, main h4, main h5, main h6, main td, main blockquote, main .elementor-widget-text-editor').toArray().map(el => createHash('sha256').update(normalize($(el).text())).digest('hex')))
  for (const hash of page.sourceContentHashes) check(hashes.has(hash), `${page.path}: missing source content block ${hash}`)
  check($('title').text() === page.title, `${page.path}: wrong title`)
  check($('link[rel=canonical]').attr('href') === manifest.origin + page.path, `${page.path}: wrong canonical`)
  check($('script[src*="wp-"], script[src*="jquery"]').length === 0, `${page.path}: WordPress runtime dependency`)
  $('img[src], link[rel=stylesheet][href], script[src]').each((_, el) => {
    const src = $(el).attr('src') || $(el).attr('href')
    if (src.startsWith('/')) assetPaths.add(decodeURIComponent(src.split(/[?#]/)[0]))
    else check(!src.startsWith('http') || (el.tagName === 'script' && src === 'https://datafa.st/js/script.js'), `${page.path}: remote asset ${src}`)
  })
  $('[srcset]').each((_, el) => $(el).attr('srcset').split(',').forEach(part => assetPaths.add(decodeURIComponent(part.trim().split(/\s+/)[0]))))
  // Compare each original prose block, without treating changed form/status UI as editorial content.
  let original
  try { original = cheerio.load(await readFile(`.wordpress-import/cache/${encodeURIComponent(page.path)}.html`, 'utf8')) } catch {}
  if (original) {
    const text = normalize($('main').text())
    original('main p, main h1, main h2, main h3, main h4, main h5, main h6, main td, main blockquote, main .elementor-widget-text-editor').each((_, el) => {
      if (original(el).hasClass('must-log-in')) return
      if (original(el).parents('form').length || original(el).find('form').length) return
      const block = normalize(original(el).text())
      if (block && !block.includes('[email protected]')) check(text.includes(block), `${page.path}: missing original content: ${block.slice(0, 90)}`)
    })
  }
}
for (const url of manifest.sourceUrls) check(routes.has(new URL(url).pathname), `Missing source route: ${url}`)
for (const [route, $] of documents) {
  $('a[href]').each((_, el) => {
    const value = $(el).attr('href')
    if (!value || value === '#' || /^(https?:|mailto:|tel:)/.test(value)) return
    const url = new URL(value, manifest.origin + route)
    let target = url.pathname
    if (redirects[target]) target = redirects[target]
    if (target.startsWith('/assets/')) { assetPaths.add(decodeURIComponent(target)); return }
    if (['/recherche/'].includes(target)) return
    check(routes.has(target), `${route}: broken link ${value}`)
    if (url.hash && documents.has(target)) {
      const id = decodeURIComponent(url.hash.slice(1))
      const doc = documents.get(target)
      check(doc('[id]').toArray().some(el => doc(el).attr('id') === id) || doc('[name]').toArray().some(el => doc(el).attr('name') === id), `${route}: broken anchor ${value}`)
    }
  })
}
async function cssFiles(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) await cssFiles(file)
    else if (entry.name.endsWith('.css')) {
      const css = await readFile(file, 'utf8')
      for (const match of css.matchAll(/url\(['"]?(\/[^)'"\s]+)/g)) assetPaths.add(decodeURIComponent(match[1].split(/[?#]/)[0]))
      check(!/url\(['"]?https?:\/\//.test(css), `${file}: WordPress asset dependency`)
    }
  }
}
await cssFiles('dist/assets')
for (const asset of assetPaths) {
  try { await access(path.join('dist', asset)) } catch { errors.push(`Missing asset: ${asset}`) }
}
const blogLinks = new Set()
for (const [route, $] of documents) if (route === '/blog/' || route.startsWith('/blog/page/')) $('.raven-post-title-link').each((_, el) => blogLinks.add($(el).attr('href')))
for (const post of manifest.postPaths) check(blogLinks.has(post), `Article missing from blog: ${post}`)
assert.deepEqual(errors, [], `${errors.length} migration problems:\n${errors.join('\n')}`)
console.log(`Verified ${routes.size} routes, ${manifest.sourceUrls.length} sitemap URLs, ${blogLinks.size} articles, ${assetPaths.size} assets, original prose, links and anchors.`)
