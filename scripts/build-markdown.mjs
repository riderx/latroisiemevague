// Writes a Markdown copy next to every built HTML page (dist/<path>/index.md), plus dist/404.md.
// The Worker serves these files to requests that send `Accept: text/markdown`.
import { readFile, writeFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { load } from 'cheerio'
import TurndownService from 'turndown'

const SITE = 'https://latroisiemevague.com'
const DIST = 'dist'
const turndown = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-', codeBlockStyle: 'fenced' })
turndown.remove(['script', 'style', 'noscript', 'svg', 'form', 'button', 'iframe', 'template', 'dialog'])

async function htmlFiles(dir) {
  const files = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...await htmlFiles(full))
    else if (entry.name === 'index.html') files.push(full)
  }
  return files
}

export function pageMarkdown(html) {
  const $ = load(html)
  const main = $('main').first()
  // Decoration, in-page navigation and interactive widgets carry no content for a reader of the Markdown.
  main.find('[aria-hidden="true"], .gnum, .guide-toc, nav, .hp-field').remove()
  main.find('img').filter((_, el) => !$(el).attr('alt')?.trim()).remove()
  main.find('a[href]').each((_, el) => { const href = $(el).attr('href'); if (href && !href.startsWith('#')) $(el).attr('href', new URL(href, SITE).href) })
  main.find('img[src]').each((_, el) => $(el).attr('src', new URL($(el).attr('src'), SITE).href))
  const title = $('title').text().trim(), description = $('meta[name=description]').attr('content')?.trim() ?? ''
  const canonical = $('link[rel=canonical]').attr('href') ?? SITE
  const body = turndown.turndown(main.html() ?? '').replace(/\n{3,}/g, '\n\n').trim()
  const heading = /^# /m.test(body) ? '' : `# ${title}\n\n`
  return `${heading}${body}\n\n---\n\n${description ? `${description}\n\n` : ''}Source : ${canonical}\n`
}

export const notFoundMarkdown = `# Page introuvable

Cette page n’existe pas ou a été déplacée.

- Accueil : ${SITE}/
- Index pour les agents : ${SITE}/llms.txt
- Plan du site : ${SITE}/sitemap.xml
- Recherche : ${SITE}/recherche/

Chaque page du site existe aussi en Markdown : envoyez l’en-tête \`Accept: text/markdown\`.
`

if (import.meta.url === `file://${process.argv[1]}`) {
  const files = (await htmlFiles(DIST)).filter(file => !file.startsWith(path.join(DIST, 'og')))
  for (const file of files) await writeFile(file.replace(/index\.html$/, 'index.md'), pageMarkdown(await readFile(file, 'utf8')))
  await writeFile(path.join(DIST, '404.md'), notFoundMarkdown)
  console.log(`Wrote ${files.length} Markdown pages and 404.md`)
}
