import * as cheerio from 'cheerio'
import { readFile, writeFile } from 'node:fs/promises'
const root = new URL('../', import.meta.url)
const content = new URL('src/content-data/pages/', root)
const manifest = JSON.parse(await readFile(new URL('manifest.json', content), 'utf8'))
const postsFile = new URL('.wordpress-import/posts.json', root)
let posts
try { posts = JSON.parse(await readFile(postsFile, 'utf8')) }
catch {
  const response = await fetch(`${manifest.origin}/wp-json/wp/v2/posts?per_page=100&_embed`)
  if (!response.ok) throw new Error(`Posts API: ${response.status}`)
  posts = await response.json()
  await writeFile(postsFile, JSON.stringify(posts))
}
const blogMeta = manifest.pages.find(page => page.path === '/blog/')
const blog = await readFile(new URL('blog.html', content), 'utf8')
const head = await readFile(new URL('blog.head.html', content), 'utf8')
const template = cheerio.load(blog)
const existingCards = new Map(template('.raven-post-item').toArray().map(el => [template(el).find('.raven-post-title-link').attr('href'), template.html(el)]))
const cardTemplate = template('.raven-post-item').first().toString()
const cards = posts.map(post => {
  const href = new URL(post.link).pathname
  if (existingCards.has(href)) return existingCards.get(href)
  const $ = cheerio.load(cardTemplate, null, false)
  $('.raven-post-item').attr('class', `raven-grid-item raven-post-item post-${post.id} post type-post status-publish`)
  $('a').attr('href', href)
  $('.raven-post-title-link').html(post.title.rendered)
  const excerpt = cheerio.load(post.excerpt.rendered).text().trim().split(/\s+/).slice(0, 20).join(' ')
  $('.raven-post-excerpt').text(excerpt)
  const image = post._embedded?.['wp:featuredmedia']?.[0]?.source_url
  if (image) $('img').attr('src', new URL(image).pathname.replace('/wp-content/uploads/', '/assets/uploads/')).removeAttr('srcset').removeAttr('sizes')
  else $('.raven-post-image-wrap').remove()
  return $.html()
})
const count = Math.ceil(cards.length / 4)
manifest.pages = manifest.pages.filter(page => !page.path.startsWith('/blog/page/'))
for (let page = 1; page <= count; page++) {
  const $ = cheerio.load(blog, null, false)
  $('.raven-posts').html(cards.slice((page - 1) * 4, page * 4).join('\n'))
  const pathname = page === 1 ? '/blog/' : `/blog/page/${page}/`
  const meta = page === 1 ? blogMeta : { ...blogMeta, sourceContentHashes: [], id: `blog-page-${page}`, path: pathname, title: `Blog — Page ${page} - La troisième vague` }
  if (page < count) $('.raven-load-more-button').attr('href', `/blog/page/${page + 1}/`)
  else $('.raven-load-more').remove()
  $('.raven-posts').after(`<nav class="migration-pagination" aria-label="Pages du blog">${Array.from({ length: count }, (_, i) => i + 1).map(n => n === page ? `<span aria-current="page">${n}</span>` : `<a href="${n === 1 ? '/blog/' : `/blog/page/${n}/`}">${n}</a>`).join('')}</nav>`)
  const h = cheerio.load(head, null, false)
  h('title').text(meta.title)
  h('link[rel=canonical]').attr('href', manifest.origin + pathname)
  h('meta[property="og:url"]').attr('content', manifest.origin + pathname)
  if (page > 1) { h('script[type="application/ld+json"]').remove(); manifest.pages.push(meta) }
  await writeFile(new URL(`${meta.id}.html`, content), $.html().replace(/[ \t]+$/gm, '').trim() + '\n')
  await writeFile(new URL(`${meta.id}.head.html`, content), h.html().replace(/[ \t]+$/gm, '').trim() + '\n')
}
manifest.postPaths = posts.map(post => new URL(post.link).pathname)
await writeFile(new URL('manifest.json', content), JSON.stringify(manifest, null, 2) + '\n')
await writeFile(new URL('public/_redirects', root), Object.entries(manifest.redirects).map(([from,to]) => `${from} ${to} 301`).join('\n') + '\n/sitemap_index.xml /sitemap.xml 301\n')
console.log(`Completed blog pagination: ${posts.length} articles across ${count} pages`)
