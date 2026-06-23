import * as cheerio from 'cheerio'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const origin = 'https://latroisiemevague.com'
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = path.join(rootDir, 'public')
const dataFile = path.join(rootDir, 'src/data/site.json')
const downloadedAssets = new Set()

async function fetchResponse(url) {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'latroisiemevague-astro-migration/1.0',
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`)
  }

  return response
}

async function fetchText(url) {
  const response = await fetchResponse(url)
  return response.text()
}

function sameOriginUrl(value, baseUrl = origin) {
  if (!value || value.startsWith('data:') || value.startsWith('mailto:') || value.startsWith('tel:') || value.startsWith('#')) {
    return null
  }

  try {
    const url = new URL(value, baseUrl)
    return url.origin === origin ? url : null
  }
  catch {
    return null
  }
}

function outputPathForUrl(url) {
  const cleanPath = decodeURIComponent(url.pathname)
  return path.join(publicDir, cleanPath)
}

function localPathForUrl(url) {
  return encodeURI(url.pathname).replace(/%2F/g, '/')
}

function isAssetPath(pathname) {
  return /\.(avif|css|eot|gif|ico|jpeg|jpg|js|json|mp4|otf|png|svg|ttf|txt|webm|webp|woff|woff2|xml)$/i.test(pathname)
}

async function downloadAsset(assetUrl) {
  const url = typeof assetUrl === 'string' ? sameOriginUrl(assetUrl) : assetUrl
  if (!url || !isAssetPath(url.pathname)) return

  const key = url.pathname
  if (downloadedAssets.has(key)) return
  downloadedAssets.add(key)

  const destination = outputPathForUrl(url)
  await mkdir(path.dirname(destination), { recursive: true })

  const response = await fetchResponse(url.href)
  const contentType = response.headers.get('content-type') || ''

  if (contentType.includes('text/css') || url.pathname.endsWith('.css')) {
    const css = await response.text()
    const rewritten = await rewriteCssUrls(css, url.href)
    await writeFile(destination, rewritten)
    return
  }

  const body = Buffer.from(await response.arrayBuffer())
  await writeFile(destination, body)
}

async function rewriteCssUrls(css, baseUrl) {
  const matches = [...css.matchAll(/url\((['"]?)(.*?)\1\)/g)]
  let rewritten = css

  for (const match of matches) {
    const raw = match[2].trim()
    const url = sameOriginUrl(raw, baseUrl)
    if (!url) continue

    await downloadAsset(url)
    rewritten = rewritten.replace(match[0], `url("${localPathForUrl(url)}")`)
  }

  return rewritten.replaceAll(origin, '')
}

function rewriteSrcset(value, baseUrl) {
  return value
    .split(',')
    .map((part) => {
      const [rawUrl, ...rest] = part.trim().split(/\s+/)
      const url = sameOriginUrl(rawUrl, baseUrl)
      const nextUrl = url ? localPathForUrl(url) : rawUrl
      return [nextUrl, ...rest].join(' ')
    })
    .join(', ')
}

async function rewriteElementUrls($, baseUrl) {
  const urlAttributes = ['href', 'src', 'poster', 'data-src', 'data-lazy-src']

  for (const element of $('*').toArray()) {
    const node = $(element)

    for (const attr of urlAttributes) {
      const value = node.attr(attr)
      const url = sameOriginUrl(value, baseUrl)
      if (!url) continue

      if (isAssetPath(url.pathname)) {
        await downloadAsset(url)
      }

      node.attr(attr, isAssetPath(url.pathname) ? localPathForUrl(url) : `${url.pathname}${url.hash}`)
    }

    for (const attr of ['srcset', 'data-srcset']) {
      const value = node.attr(attr)
      if (!value) continue

      const parts = value.split(',').map((part) => part.trim().split(/\s+/)[0])
      for (const part of parts) {
        const url = sameOriginUrl(part, baseUrl)
        if (url && isAssetPath(url.pathname)) {
          await downloadAsset(url)
        }
      }

      node.attr(attr, rewriteSrcset(value, baseUrl))
    }

    const style = node.attr('style')
    if (style) {
      node.attr('style', await rewriteCssUrls(style, baseUrl))
    }
  }
}

async function sitemapUrls() {
  const indexXml = await fetchText(`${origin}/sitemap_index.xml`)
  const $index = cheerio.load(indexXml, { xmlMode: true })
  const sitemapLocations = $index('sitemap > loc')
    .toArray()
    .map((loc) => $index(loc).text().trim())
    .filter(Boolean)

  const urls = new Set([`${origin}/`])

  for (const sitemapLocation of sitemapLocations) {
    const xml = await fetchText(sitemapLocation)
    const $ = cheerio.load(xml, { xmlMode: true })

    $('url > loc').each((_, loc) => {
      const value = $(loc).text().trim()
      const url = sameOriginUrl(value)
      if (url) urls.add(url.href)
    })
  }

  return [...urls].sort()
}

function pagePathFromUrl(url) {
  const pathname = url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`
  return pathname || '/'
}

async function extractPage(pageUrl) {
  const html = await fetchText(pageUrl.href)
  const $ = cheerio.load(html, { decodeEntities: false })

  $('script').remove()
  $('link[rel="preload"][as="script"]').remove()
  $('link[rel="dns-prefetch"], link[rel="alternate"], link[rel="https://api.w.org/"]').remove()

  await rewriteElementUrls($, pageUrl.href)

  const headParts = []
  $('head link[rel="stylesheet"], head link[rel="icon"], head link[rel="shortcut icon"], head style').each((_, element) => {
    headParts.push($.html(element))
  })

  $('body script').remove()

  return {
    path: pagePathFromUrl(pageUrl),
    title: $('head title').first().text().trim() || 'La Troisième Vague',
    description: $('head meta[name="description"]').first().attr('content') || '',
    bodyClass: $('body').attr('class') || '',
    headHtml: headParts.join('\n'),
    bodyHtml: $('body').html() || '',
  }
}

async function main() {
  await mkdir(publicDir, { recursive: true })

  const urls = (await sitemapUrls()).map((value) => new URL(value))
  const pages = []

  for (const [index, url] of urls.entries()) {
    console.log(`[${index + 1}/${urls.length}] ${url.href}`)
    pages.push(await extractPage(url))
  }

  const existing = JSON.parse(await readFile(dataFile, 'utf8'))
  existing.generatedAt = new Date().toISOString()
  existing.origin = origin
  existing.pages = pages

  await writeFile(dataFile, `${JSON.stringify(existing, null, 2)}\n`)
  console.log(`Wrote ${pages.length} pages and ${downloadedAssets.size} assets`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
