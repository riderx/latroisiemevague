import * as cheerio from 'cheerio'
import { mkdir, readFile, writeFile, access } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const origin = 'https://latroisiemevague.com'
const cache = path.join(root, '.wordpress-import/cache')
const contentRoot = path.join(root, 'src/content-data/pages')
const assets = new Map()
const failures = []
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))
let lastRequest = 0
async function request(url) {
  for (let attempt = 0; attempt < 5; attempt++) {
    await sleep(Math.max(0, 650 - (Date.now() - lastRequest)))
    lastRequest = Date.now()
    const response = await fetch(url, { signal: AbortSignal.timeout(60000) })
    if (response.ok) return response
    if (response.status !== 429 && response.status < 500) throw new Error(`${response.status} ${url}`)
    console.log(`Retrying ${response.status}: ${url}`)
    await sleep(Math.min(60000, 15000 * (attempt + 1)))
  }
  throw new Error(`Unable to fetch ${url}`)
}
async function cachedText(url) {
  const file = path.join(cache, encodeURIComponent(new URL(url).pathname + new URL(url).search) + '.html')
  try { return await readFile(file, 'utf8') } catch {}
  const html = await (await request(url)).text()
  await writeFile(file, html)
  return html
}
function internal(url) { return ['latroisiemevague.com', 'www.latroisiemevague.com'].includes(url.hostname) }
function localAsset(url) {
  if (internal(url)) return url.pathname.replace(/^\/wp-content\/uploads\//, '/assets/uploads/').replace(/^\/wp-content\//, '/assets/wordpress/').replace(/^\/wp-includes\//, '/assets/wordpress/includes/')
  return `/assets/external/${createHash('sha256').update(url.href).digest('hex').slice(0, 16)}${path.extname(url.pathname) || (url.hostname === 'fonts.googleapis.com' ? '.css' : '.png')}`
}
function isAsset(url) { return /\.(?:avif|css|eot|gif|ico|jpe?g|mp4|otf|pdf|png|svg|ttf|webm|webp|woff2?)$/i.test(url.pathname) || url.hostname === 'fonts.googleapis.com' }
async function download(url) {
  const local = localAsset(url)
  if (assets.has(local)) return local + url.hash
  assets.set(local, url.href)
  const file = path.join(root, 'public', decodeURIComponent(local))
  try { await access(file); return local + url.hash } catch {}
  try {
    const response = await request(url.href)
    const css = response.headers.get('content-type')?.includes('text/css') || url.pathname.endsWith('.css')
    const data = css ? await rewriteCss(await response.text(), url.href) : Buffer.from(await response.arrayBuffer())
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, data)
  } catch (error) {
    failures.push({ url: url.href, error: String(error) })
    console.warn(String(error))
  }
  return local + url.hash
}
async function rewrite(value, base, asset = false) {
  value = value?.trim()
  if (!value || /^(?:#|data:|mailto:|tel:)/i.test(value)) return value
  let url
  try { url = new URL(value, base) } catch { return value }
  if ((asset && /^https?:$/.test(url.protocol)) || (isAsset(url) && internal(url))) return download(url)
  if (internal(url) && url.pathname.startsWith('/cdn-cgi/l/email-protection') && url.hash) {
    const encoded = url.hash.slice(1), key = parseInt(encoded.slice(0, 2), 16)
    return 'mailto:' + Buffer.from(encoded.slice(2).match(/../g).map(byte => parseInt(byte, 16) ^ key)).toString()
  }
  if (internal(url) && !asset) return url.pathname.replace(/(?<!\/|\.[a-z]+)$/, '/') + url.search + url.hash
  return value
}
async function rewriteCss(css, base) {
  for (const match of [...css.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/g)]) {
    // These obsolete theme images do not render on the live site; preserve its visible design.
    if (match[2].includes('letroisiemecycle.com/')) { css = css.replace(match[0], 'none'); continue }
    css = css.replace(match[0], `url("${await rewrite(match[2], base, true)}")`)
  }
  for (const match of [...css.matchAll(/@import\s+(['"])(.*?)\1/g)]) {
    css = css.replace(match[0], `@import "${await rewrite(match[2], base, true)}"`)
  }
  return css
}
async function rewriteDom($, url) {
  for (const el of $('*').toArray()) {
    const node = $(el)
    for (const name of Object.keys(el.attribs || {})) {
      if (/^on/i.test(name)) node.removeAttr(name)
    }
    for (const attr of ['src', 'href', 'poster', 'action']) {
      const value = node.attr(attr)
      if (value) node.attr(attr, /^javascript:/i.test(value) ? '#' : await rewrite(value, url, ['src', 'poster'].includes(attr) || (el.tagName === 'link' && node.attr('rel') === 'stylesheet')))
    }
    if (node.attr('srcset')) {
      const parts = []
      for (const part of node.attr('srcset').split(',')) {
        const [src, ...size] = part.trim().split(/\s+/)
        parts.push([await rewrite(src, url, true), ...size].join(' '))
      }
      node.attr('srcset', parts.join(', '))
    }
    if (node.attr('style')) node.attr('style', await rewriteCss(node.attr('style'), url))
    if (el.tagName === 'style') node.text(await rewriteCss(node.text(), url))
    if (el.tagName === 'img') node.attr('decoding', 'async')
  }
}
function prepareForms($) {
  $('form[role=search]').attr('action', '/recherche/')
  $('form.wpcf7-form, form.jet-subscribe-form__form').each((_, el) => {
    const form = $(el)
    const kind = form.hasClass('wpcf7-form') ? 'contact' : 'newsletter'
    form.attr('action', '/api/forms').attr('method', 'post').attr('data-form-kind', kind).removeAttr('novalidate')
    form.find('input[type=hidden], [name^=_wpcf7]').remove()
    form.find('.wpcf7-response-output, .jet-subscribe-form__message').remove()
    form.prepend(`<input type="hidden" name="kind" value="${kind}">`)
    form.append('<label class="form-trap" aria-hidden="true">Site web<input name="website" tabindex="-1" autocomplete="off"></label><p class="form-status" role="status" aria-live="polite"></p>')
    form.find('[aria-required=true], input[type=email]').attr('required', '')
    form.find('input:not([type=hidden]), textarea').each((_, field) => {
      const input = $(field)
      if (input.attr('placeholder')) input.attr('aria-label', input.attr('placeholder'))
    })
    form.find('.jet-subscribe-form__submit').each((_, button) => {
      const link = $(button)
      link.replaceWith(`<button type="submit" class="${link.attr('class')}">${link.html()}</button>`)
    })
  })
  $('form#commentform').remove()
}
async function main() {
  await mkdir(cache, { recursive: true }); await mkdir(contentRoot, { recursive: true })
  const sitemap = cheerio.load(await cachedText(origin + '/sitemap_index.xml'), { xmlMode: true })
  const urls = new Set([origin + '/'])
  for (const loc of sitemap('sitemap > loc').toArray()) {
    const $ = cheerio.load(await cachedText(sitemap(loc).text()), { xmlMode: true })
    $('url > loc').each((_, el) => urls.add($(el).text()))
  }
  const sourceUrls = [...urls]
  const pages = []
  const redirects = new Map([['/les-psychedeliques-peuvent-ils-induire-des-etats-de-flux/', '/les-psychedeliques-peuvent-ils-induire-des-etats-de-flow/']])
  for (const url of urls) {
    console.log(`[${pages.length + 1}/${urls.size}] ${url}`)
    if (redirects.has(new URL(url).pathname)) continue
    const html = await cachedText(url)
    const $ = cheerio.load(html.replace(/�PNG[\s\S]*?IEND�B`�/g, ''))
    if (!$('body').length || !$('title').length) throw new Error(`Not a page: ${url}`)
    const canonical = $('link[rel=canonical]').attr('href')
    if (canonical && new URL(canonical).pathname !== new URL(url).pathname) {
      redirects.set(new URL(url).pathname, new URL(canonical).pathname)
      urls.add(canonical)
      continue
    }
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href')
      try {
        const link = new URL(href, url)
        if (internal(link) && !link.search && !isAsset(link) && !/\.(?:php|xml|json)$|\/(?:wp-|cdn-cgi\/|feed\/|comments\/)/.test(link.pathname)) {
          link.hash = ''; link.protocol = 'https:'; link.hostname = 'latroisiemevague.com'
          if (!link.pathname.endsWith('/')) link.pathname += '/'
          urls.add(link.href)
        }
      } catch {}
    })
    const pathName = new URL(url).pathname
    const id = pathName === '/' ? 'home' : pathName.replace(/^\/|\/$/g, '').replace(/\//g, '-')
    const sourceBlocks = []
    $('main p, main h1, main h2, main h3, main h4, main h5, main h6, main td, main blockquote, main .elementor-widget-text-editor').each((_, el) => {
      if ($(el).hasClass('must-log-in') || $(el).parents('form').length || $(el).find('form').length) return
      const text = $(el).text().replace(/\s+/g, ' ').trim()
      if (text && !text.includes('[email protected]')) sourceBlocks.push(createHash('sha256').update(text).digest('hex'))
    })
    const meta = { sourceContentHashes: [...new Set(sourceBlocks)], id, path: pathName, title: $('title').text(), description: $('meta[name=description]').attr('content') || '', bodyClass: ($('body').attr('class') || '').replace(/\bno-js\b/g, '') }
    $('script:not([type="application/ld+json"]), link[rel="https://api.w.org/"], link[rel=shortlink], link[rel=pingback], link[rel=alternate], link[rel=dns-prefetch], link[rel=preload][as=script], meta[name=generator]').remove()
    $('[data-settings], [data-element_type], [data-widget_type]').removeAttr('data-settings').removeAttr('data-element_type').removeAttr('data-widget_type')
    $('.elementor-invisible').removeClass('elementor-invisible')
    $('[data-cfemail]').each((_, el) => {
      const node = $(el), encoded = node.attr('data-cfemail'), key = parseInt(encoded.slice(0, 2), 16)
      const email = Buffer.from(encoded.slice(2).match(/../g).map(byte => parseInt(byte, 16) ^ key)).toString()
      if (node.is('a')) node.attr('href', `mailto:${email}`).text(email)
      else { node.parent('a').attr('href', `mailto:${email}`); node.replaceWith(email) }
    })
    prepareForms($)
    // These template IDs are duplicated by WordPress's desktop/mobile menus.
    $('nav').each((_, el) => $(el).attr('aria-label', $(el).hasClass('raven-nav-menu-mobile') ? 'Navigation mobile' : 'Navigation principale'))
    $('.must-log-in').html('<a href="/contact/">Contactez-nous</a> pour réagir à cet article.')
    if (pathName === '/substances/lsd/') $('a[href="#note-01"]').attr('href', '#notes')
    await rewriteDom($, url)
    $('link[rel=canonical]').attr('href', origin + pathName)
    for (const el of $('meta[property="og:image"], meta[property="og:image:secure_url"], meta[name="twitter:image"]').toArray()) {
      const src = pathName === '/jet-popup/popup/' ? $('body img').first().attr('src') : await rewrite($(el).attr('content'), url, true)
      $(el).attr('content', src.startsWith('/') ? origin + src : src)
    }
    $('script[type="application/ld+json"]').each((_, el) => {
      $(el).text($(el).text().replaceAll(origin + '/wp-content/uploads/', origin + '/assets/uploads/'))
    })
    if (!$('main').length) $('body').wrapInner('<main></main>')
    await writeFile(path.join(contentRoot, `${id}.html`), $('body').html().replace(/[ \t]+$/gm, '').trim() + '\n')
    await writeFile(path.join(contentRoot, `${id}.head.html`), $('head').html().replace(/[ \t]+$/gm, '').trim() + '\n')
    pages.push(meta)
  }
  const manifest = { origin, generatedAt: new Date().toISOString(), sourceUrls, pages: pages.sort((a,b) => a.path.localeCompare(b.path)), redirects: Object.fromEntries(redirects), assetFailures: failures }
  await writeFile(path.join(contentRoot, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  console.log(`Imported ${pages.length} pages, ${assets.size} assets, ${failures.length} asset failures`)
  if (failures.length) process.exitCode = 1
}
main().catch(error => { console.error(error); process.exitCode = 1 })
