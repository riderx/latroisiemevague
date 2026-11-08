import assert from 'node:assert/strict'
import { readFile, readdir, access } from 'node:fs/promises'
import path from 'node:path'
import { load } from 'cheerio'
import { guideCatalog } from '../src/content-data/guide-catalog.ts'

const ORIGIN = 'https://latroisiemevague.com'
const ANALYTICS = 'https://datafa.st/js/script.js'
const NOINDEX = new Set(['/404.html', '/recherche/'])
const errors = []
const check = (condition, message) => { if (!condition) errors.push(message) }
const exists = file => access(path.join('dist', file)).then(() => true, () => false)

const manifest = JSON.parse(await readFile('src/content-data/pages/manifest.json', 'utf8'))
// src/lib/articles.ts needs Vite to import, so read its `retiredPosts` map from source.
const retiredBlock = (await readFile('src/lib/articles.ts', 'utf8')).match(/export const retiredPosts[^=]*=\s*\{([^}]*)\}/)?.[1]
assert(retiredBlock, 'retiredPosts not found in src/lib/articles.ts')
const retired = Object.fromEntries([...retiredBlock.matchAll(/'([^']+)'\s*:\s*'([^']+)'/g)].map(m => [m[1], m[2]]))
const articlePaths = manifest.postPaths.filter(p => !retired[p])

async function htmlFiles(dir) {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...await htmlFiles(file))
    else if (entry.name.endsWith('.html')) out.push(file)
  }
  return out
}
const routeOf = file => { const rel = '/' + path.relative('dist', file).split(path.sep).join('/'); return rel.endsWith('/index.html') ? rel.slice(0, -'index.html'.length) : rel }

const documents = new Map()
for (const file of await htmlFiles('dist')) documents.set(routeOf(file), load(await readFile(file, 'utf8')))

const redirects = new Map((await readFile('dist/_redirects', 'utf8')).split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#')).map(line => line.split(/\s+/)))
const assets = new Map()
const addAsset = (route, value) => {
  if (!value || /^(data:|#)/.test(value)) return
  if (/^https?:\/\//.test(value) || value.startsWith('//')) { if (value !== ANALYTICS) errors.push(`${route}: remote asset ${value}`); return }
  const target = decodeURIComponent(new URL(value, ORIGIN + route).pathname)
  if (!assets.has(target)) assets.set(target, route)
}
const cssUrls = (route, css) => { for (const match of css.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) addAsset(route, match[1].trim()) }

for (const [route, $] of documents) {
  const indexable = !NOINDEX.has(route)
  check($('main h1').length === 1, `${route}: expected one main h1, found ${$('main h1').length}`)
  check($('title').text().trim(), `${route}: missing title`)
  check($('meta[name=description]').attr('content')?.trim(), `${route}: missing meta description`)
  check($('html').attr('lang') === 'fr-FR', `${route}: html lang is not fr-FR`)
  check($(`script[data-website-id="dfid_QUM3eJgHP2rnqoPysAotE"][src="${ANALYTICS}"]`).length === 1, `${route}: analytics missing or duplicated`)
  if (indexable) {
    check($('link[rel=canonical]').length === 1 && $('link[rel=canonical]').attr('href') === ORIGIN + route, `${route}: canonical ${$('link[rel=canonical]').attr('href')}`)
    check(!/noindex/.test($('meta[name=robots]').attr('content') || ''), `${route}: unexpectedly noindex`)
  } else check(/noindex/.test($('meta[name=robots]').attr('content') || ''), `${route}: expected noindex`)
  $('script[type="application/ld+json"]').each((_, el) => { try { JSON.parse($(el).html()) } catch { errors.push(`${route}: invalid JSON-LD`) } })
  check($('script[src*="wp-"], link[href*="wp-"], script[src*="jquery"], [class*="jupiterx-"], [class*="raven-"], [class*="elementor"]').length === 0, `${route}: WordPress runtime or markup`)
  // Content may cite external WordPress or Google pages; only what the page loads matters.
  const loaded = [$('head').html(), ...$('[src], [srcset], link[href], style').map((_, el) => $(el).attr('src') || $(el).attr('srcset') || $(el).attr('href') || $(el).html()).get()].join('\n')
  check(!/\/wp-(content|includes|json)\//.test(loaded), `${route}: WordPress asset`)
  check(!/googleapis|gstatic|googletagmanager|google-analytics|recaptcha/.test(loaded), `${route}: Google dependency`)
  $('img[src], script[src], source[src], video[src], audio[src], iframe[src]').each((_, el) => addAsset(route, $(el).attr('src')))
  $('link[href]').each((_, el) => { if (!['canonical', 'alternate'].includes($(el).attr('rel'))) addAsset(route, $(el).attr('href')) })
  $('[srcset]').each((_, el) => $(el).attr('srcset').split(',').forEach(part => addAsset(route, part.trim().split(/\s+/)[0])))
  $('style').each((_, el) => cssUrls(route, $(el).html()))
  $('[style]').each((_, el) => cssUrls(route, $(el).attr('style')))
  $('meta[property="og:image"], meta[name="twitter:image"]').each((_, el) => { const v = $(el).attr('content'); if (v?.startsWith(ORIGIN)) addAsset(route, v.slice(ORIGIN.length)) })
}

const pages = new Set(documents.keys())
for (const [route, $] of documents) {
  const ids = $('[id]').map((_, el) => $(el).attr('id')).get()
  const duplicates = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))]
  check(!duplicates.length, `${route}: duplicate ids ${duplicates.join(', ')}`)
  for (const el of $('a[href]').toArray()) {
    const value = $(el).attr('href')
    if (!value || /^(https?:|mailto:|tel:|\/\/)/.test(value)) continue
    const url = new URL(value, ORIGIN + route)
    const target = decodeURIComponent(url.pathname)
    const ok = pages.has(target) || redirects.has(target) || target === '/api/forms' || (!target.endsWith('/') && await exists(target))
    check(ok, `${route}: broken link ${value}`)
    if (url.hash && documents.has(target)) {
      const id = decodeURIComponent(url.hash.slice(1)), doc = documents.get(target)
      check(doc('[id]').toArray().some(n => doc(n).attr('id') === id), `${route}: broken anchor ${value}`)
    }
  }
  for (const el of $('form[action]').toArray()) {
    const target = new URL($(el).attr('action'), ORIGIN + route).pathname
    check(pages.has(target) || target === '/api/forms', `${route}: broken form action ${target}`)
  }
}

for (const [asset, route] of assets) check(await exists(asset), `${route}: missing asset ${asset}`)

for (const [source, target] of redirects) {
  check(!pages.has(source), `_redirects: ${source} shadows a built page`)
  check(pages.has(new URL(target, ORIGIN).pathname) || await exists(target), `_redirects: ${source} -> missing target ${target}`)
}
for (const post of Object.keys(retired)) {
  check(redirects.has(post), `retired post ${post} has no redirect`)
  check(!pages.has(post), `retired post ${post} is still built`)
}

const linked = route => new Set(documents.get(route)?.('main a[href]').map((_, el) => new URL(documents.get(route)(el).attr('href'), ORIGIN + route).pathname).get() ?? [])
const blog = linked('/blog/')
check(documents.get('/blog/')?.('main a.afeat, main a.acard').length === articlePaths.length, `/blog/: expected ${articlePaths.length} article cards`)
for (const post of articlePaths) {
  check(pages.has(post), `article not built: ${post}`)
  check(blog.has(post), `/blog/: missing article ${post}`)
}
for (const [hub, category] of [['/substances/', 'psychedelics'], ['/microdosing/', 'microdosing']]) {
  const links = linked(hub)
  for (const guide of guideCatalog.filter(g => g.category === category)) {
    check(pages.has(guide.path), `guide not built: ${guide.path}`)
    check(links.has(guide.path), `${hub}: missing guide ${guide.path}`)
  }
}

if (errors.length) { console.error(`${errors.length} site problems:\n${errors.join('\n')}`); process.exit(1) }
console.log(`Verified ${documents.size} pages, ${assets.size} local assets, ${redirects.size} redirects, ${articlePaths.length} articles on /blog/ and ${guideCatalog.length} guides on their hubs.`)
