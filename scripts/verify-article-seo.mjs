import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { load } from 'cheerio'
import { guideCatalog, guideHeading } from '../src/content-data/guide-catalog.ts'
const manifest = JSON.parse(await readFile('src/content-data/pages/manifest.json', 'utf8'))
const sitemap = load(await readFile('dist/sitemap.xml', 'utf8'), { xmlMode: true })
// src/lib/articles.ts needs Vite to import, so read its `retiredPosts` map from source.
const retiredBlock = (await readFile('src/lib/articles.ts', 'utf8')).match(/export const retiredPosts[^=]*=\s*\{([^}]*)\}/)?.[1]
assert(retiredBlock, 'retiredPosts not found in src/lib/articles.ts')
const retired = new Set([...retiredBlock.matchAll(/'([^']+)'\s*:/g)].map(m => m[1]))
const postPaths = manifest.postPaths.filter(path => !retired.has(path))
assert(postPaths.length > 0 && postPaths.length === manifest.postPaths.length - retired.size, 'retired posts must come from the legacy post list')
// New articles live in src/content-data/articles/<slug>.json; a slug that matches a legacy post only rewrites it.
const articleFiles = (await readdir('src/content-data/articles')).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5))
const newArticlePaths = articleFiles.filter(id => !manifest.pages.some(p => p.id === id)).map(id => `/${id}/`)
const paths = [...guideCatalog.map(guide => guide.path), ...postPaths, ...newArticlePaths]
const titles = new Set(), descriptions = new Set()
for (const path of paths) {
  const $ = load(await readFile(`dist${path}index.html`, 'utf8'))
  const canonical = `https://latroisiemevague.com${path}`
  assert.equal($('main h1').length, 1, `${path}: one H1`)
  assert.equal($('link[rel=canonical]').length, 1, `${path}: one canonical`)
  assert.equal($('link[rel=canonical]').attr('href'), canonical)
  assert.equal($('meta[name=description]').length, 1)
  const title = $('title').text(), description = $('meta[name=description]').attr('content')
  assert(title && !titles.has(title), `${path}: unique title`)
  assert(description && !descriptions.has(description), `${path}: unique description`)
  titles.add(title); descriptions.add(description)
  assert(!/noindex/.test($('meta[name=robots]').attr('content') || ''), `${path}: indexable`)
  assert.equal($('meta[property="og:title"]').attr('content'), title)
  assert.equal($('meta[name="twitter:title"]').attr('content'), title)
  assert.equal($('meta[name="twitter:description"]').attr('content'), description)
  const graph = $('script[type="application/ld+json"]').toArray().flatMap(el => JSON.parse($(el).html())['@graph'] || [])
  const articles = graph.filter(item => ['Article', 'BlogPosting'].includes(item['@type']))
  assert.equal(articles.length, 1, `${path}: exactly one article schema`)
  const article = articles[0]
  assert.equal(article.headline, $('main h1').text().trim())
  assert.equal(article.url, canonical)
  assert.equal(article.description, description)
  assert.equal(article.inLanguage, 'fr-FR')
  assert(Number.isFinite(Date.parse(article.datePublished)), `${path}: publication date`)
  assert(Date.parse(article.dateModified) >= Date.parse(article.datePublished), `${path}: modification date`)
  assert.equal(article.datePublished, $('meta[property="article:published_time"]').attr('content'))
  assert.equal(article.dateModified, $('meta[property="article:modified_time"]').attr('content'))
  const author = article.author?.['@id'] ? graph.find(item => item['@id'] === article.author['@id']) : article.author
  assert(author?.name && author?.url, `${path}: identifiable author`)
  assert(article.publisher?.name && article.wordCount > 100, `${path}: publisher and word count`)
  assert(graph.some(item => item['@type'] === 'BreadcrumbList'), `${path}: breadcrumbs`)
  const guide = guideCatalog.find(guide => guide.path === path)
  if (guide) {
    assert.equal($('main h1').text(), guideHeading(guide))
    assert.equal($('.reader-toc').length, 1)
    assert($('.reader-toc summary').text().includes('Sommaire'))
    assert.equal($('.reader-progress[aria-label="Progression de lecture"]').length, 1)
    assert.equal($('.guide-illustration img[width][height][alt]').length, 1)
    assert(sitemap('url').toArray().some(el => sitemap(el).find('loc').text() === canonical && sitemap(el).find('lastmod').text() === article.dateModified.slice(0, 10)), `${path}: sitemap lastmod`)
    // Guides display their update date; it must match the schema.
    assert($('time').toArray().some(el => $(el).attr('datetime') === article.dateModified), `${path}: visible update date`)
  } else {
    assert(sitemap('url').toArray().some(el => sitemap(el).find('loc').text() === canonical && sitemap(el).find('lastmod').text() === article.dateModified.slice(0, 10)), `${path}: sitemap lastmod`)
    assert($('time').toArray().some(el => [article.datePublished, article.dateModified].includes($(el).attr('datetime'))), `${path}: visible publication or update date`)
    const legacy = manifest.pages.find(page => page.path === path)
    if (legacy) {
      const original = load(await readFile(`src/content-data/pages/${legacy.id}.head.html`, 'utf8'))
      assert.equal(article.datePublished, original('meta[property="article:published_time"]').attr('content'), `${path}: preserve original date`)
    }
  }
}
console.log(`Verified SEO for ${guideCatalog.length} guides and ${postPaths.length} blog articles: unique metadata, canonical URLs, Article/BlogPosting schema, authors, dates, breadcrumbs and sitemap.`)
