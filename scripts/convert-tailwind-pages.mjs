import * as cheerio from 'cheerio'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const legacyRoot = path.join(rootDir, 'page-content/pages')
const sourceFile = process.argv[2] ? path.resolve(process.argv[2]) : path.join(rootDir, '.wordpress-import/site.json')
const contentRoot = path.join(rootDir, 'src/content-data/pages')
const pagesRoot = path.join(rootDir, 'src/pages')
const origin = 'https://latroisiemevague.com'

const blockSelector = [
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'ul',
  'ol',
  'blockquote',
  'figure',
  'table',
  'img',
  'a',
].join(',')

function toPosix(value) {
  return value.split(path.sep).join('/')
}

function importPath(fromDir, target) {
  const relative = toPosix(path.relative(fromDir, target))
  return relative.startsWith('.') ? relative : `./${relative}`
}

function pageId(pagePath) {
  if (pagePath === '/') return 'home'

  return pagePath
    .replace(/^\/|\/$/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
}

function normalizePagePath(pagePath) {
  if (!pagePath || pagePath === '/') return '/'
  return pagePath.endsWith('/') ? pagePath : `${pagePath}/`
}

function routeFile(pagePath) {
  if (pagePath === '/') return path.join(pagesRoot, 'index.astro')
  return path.join(pagesRoot, pagePath.replace(/^\/|\/$/g, ''), 'index.astro')
}

function normalizeText(value) {
  return value.replace(/\s+/g, ' ').trim()
}

function rewriteUrl(value) {
  if (!value) return value
  if (value.startsWith('data:') || value.startsWith('mailto:') || value.startsWith('tel:') || value.startsWith('#')) return value

  let next = value.replace(origin, '')
  try {
    const parsed = new URL(next, origin)
    if (parsed.origin === origin) next = parsed.pathname
  }
  catch {}

  return next.replace(/^\/wp-content\/uploads\//, '/assets/uploads/')
}

function sanitizeDom($) {
  $('svg, script, style, noscript, link, meta, header, footer, nav, form').remove()
  $('.elementor-shape, .raven-load-more, .jupiterx-a11y, .jet-popup').remove()
  $('.raven-post-excerpt').each((_, element) => {
    const text = normalizeText($(element).text())
    if (text) $(element).replaceWith(`<p>${text}</p>`)
  })

  $('*').each((_, element) => {
    const node = $(element)
    const attrs = { ...element.attribs }

    for (const attr of Object.keys(attrs)) {
      if (!['href', 'src', 'alt', 'title', 'width', 'height', 'loading'].includes(attr)) {
        node.removeAttr(attr)
      }
    }

    if (node.attr('href')) node.attr('href', rewriteUrl(node.attr('href')))
    if (node.attr('src')) node.attr('src', rewriteUrl(node.attr('src')))

    if (element.tagName === 'img') {
      node.attr('loading', node.attr('loading') || 'lazy')
      node.attr('decoding', 'async')
      if (!node.attr('alt')) node.attr('alt', '')
    }
  })
}

function isNestedBlock($, element) {
  const tag = element.tagName
  if (tag === 'img') return $(element).parents('figure, table').length > 0
  if (tag === 'a') return $(element).parents('h1,h2,h3,h4,h5,h6,p,li,figure,table').length > 0
  return $(element).parents(blockSelector).length > 0
}

function extractContent(meta, bodyHtml) {
  const $ = cheerio.load(bodyHtml, { decodeEntities: false })
  const mainHtml = $('main').first().html() || $.root().html() || ''
  const content = cheerio.load(`<main>${mainHtml}</main>`, { decodeEntities: false })

  sanitizeDom(content)

  const seen = new Set()
  const blocks = []
  content('main').find(blockSelector).each((_, element) => {
    const node = content(element)
    const tag = element.tagName
    const text = normalizeText(node.text())
    const src = tag === 'img' ? node.attr('src') : node.find('img').first().attr('src')
    const href = tag === 'a' ? node.attr('href') : ''

    if (isNestedBlock(content, element)) return
    if (!text && !src) return
    if (tag === 'a' && (!href || text.length > 90)) return
    if (tag === 'h1' && text === meta.title) return

    const key = `${tag}:${text}:${src || ''}:${href || ''}`
    if (seen.has(key)) return
    seen.add(key)

    blocks.push(content.html(element))
  })

  if (blocks.length === 0) return '<p>Contenu en cours de migration.</p>\n'
  return `${blocks.join('\n\n')}\n`
}

async function writeRoute(meta) {
  const file = routeFile(meta.path)
  const fromDir = path.dirname(file)
  const layoutPath = importPath(fromDir, path.join(rootDir, 'src/layouts/TailwindPage.astro'))
  const contentPath = `${importPath(fromDir, path.join(contentRoot, `${meta.id}.html`))}?raw`
  const source = `---\nimport TailwindPage from '${layoutPath}'\nimport content from '${contentPath}'\n\nconst routePage = ${JSON.stringify(meta, null, 2)}\n---\n\n<TailwindPage page={routePage} content={content} />\n`

  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, source)
}

async function fromWordPressExport() {
  let site
  try {
    site = JSON.parse(await readFile(sourceFile, 'utf8'))
  }
  catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }

  return {
    generatedAt: site.generatedAt,
    pages: site.pages.map((page) => {
      const pagePath = normalizePagePath(page.path)

      return {
        meta: {
          id: pageId(pagePath),
          path: pagePath,
          title: page.title,
          description: page.description || '',
        },
        bodyHtml: page.bodyHtml || '',
      }
    }),
  }
}

async function fromLegacyPageContent() {
  const entries = await readdir(legacyRoot, { withFileTypes: true })
  const pageDirs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()

  return {
    generatedAt: new Date().toISOString(),
    pages: await Promise.all(pageDirs.map(async (id) => {
      const dir = path.join(legacyRoot, id)

      return {
        meta: JSON.parse(await readFile(path.join(dir, 'meta.json'), 'utf8')),
        bodyHtml: await readFile(path.join(dir, 'body.html'), 'utf8'),
      }
    })),
  }
}

async function main() {
  const source = await fromWordPressExport() || await fromLegacyPageContent()
  const manifest = {
    origin,
    generatedAt: source.generatedAt || new Date().toISOString(),
    pages: [],
  }

  await rm(contentRoot, { recursive: true, force: true })
  await mkdir(contentRoot, { recursive: true })

  for (const { meta, bodyHtml } of source.pages) {
    const html = extractContent(meta, bodyHtml)

    await writeFile(path.join(contentRoot, `${meta.id}.html`), html)
    await writeRoute(meta)
    manifest.pages.push({ id: meta.id, path: meta.path, title: meta.title, description: meta.description })
  }

  await writeFile(path.join(contentRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`Converted ${manifest.pages.length} pages to Tailwind content and Astro routes`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
