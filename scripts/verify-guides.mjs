import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { load } from 'cheerio'
import { guideCatalog, guideTitle } from '../src/content-data/guide-catalog.ts'
const audit = JSON.parse(await readFile('src/content-data/guide-source-audit.json', 'utf8'))
const errors = []
const check = (condition, message) => { if (!condition) errors.push(message) }
const search = JSON.parse(await readFile('dist/search.json', 'utf8'))
const sitemap = await readFile('dist/sitemap.xml', 'utf8')
check(guideCatalog.length === 32, 'Expected 22 substance and 10 microdosing guides')
let words = 0, references = 0
for (const entry of guideCatalog) {
  const guide = JSON.parse(await readFile(`src/content-data/guides/${entry.id}.json`, 'utf8'))
  const source = audit.find(item => item.id === entry.id)
  const raw = load(guide.blocks.join('\n'))
  const $ = load(await readFile(`dist${entry.path}index.html`, 'utf8'))
  check(guide.contentHash === source.contentHash, `${entry.id}: stale source hash`)
  check(guide.blocks.length === source.sourceBlockCount, `${entry.id}: missing translated blocks`)
  check(guide.sourceBlockCount === source.sourceBlockCount, `${entry.id}: source block count drift`)
  check(guide.editorialCorrectionsApplied === true, `${entry.id}: editorial corrections not applied`)
  check(raw('a[href]').length === source.publishedLinkCount, `${entry.id}: reference changes differ from the editorial audit`)
  for (const id of source.headingIds) check($(`[id="${id}"]`).length === 1, `${entry.id}: missing section ${id}`)
  // Same rule as src/layouts/Base.astro: a title over 60 characters drops the site-name suffix.
  const title = guideTitle(entry), shortTitle = title.length > 60 ? title.replace(/ \| La Troisième Vague$/, '') : title
  check($('title').text() === shortTitle, `${entry.id}: incorrect title`)
  check($('main h1').length === 1, `${entry.id}: expected one H1`)
  check($('html').attr('lang') === 'fr-FR', `${entry.id}: incorrect language`)
  check($('link[rel=canonical]').attr('href') === `https://latroisiemevague.com${entry.path}`, `${entry.id}: incorrect canonical`)
  check($('script[data-website-id="dfid_QUM3eJgHP2rnqoPysAotE"]').length === 1, `${entry.id}: analytics missing or duplicated`)
  check($('main dialog, main [role=dialog], main form').length === 0, `${entry.id}: unexpected popup or form`)
  const prose = $('.guide-translated-content').text().replace(/\s+/g, ' ').trim()
  const count = prose.split(/\s+/).length
  words += count; references += raw('a[href]').length
  check(count > source.sourceWords * .65, `${entry.id}: article unexpectedly shortened`)
  check(!/as an ai|as a language model|I cannot translate|je ne peux pas traduire/i.test(prose), `${entry.id}: translation error text`)
  const headings = $('.guide-translated-content h2').map((_, el) => $(el).text()).get()
  check(!headings.some(heading => /^(Overview|Experience|Effects|Benefits|Therapeutic Use|Personal Growth|Legality|History|Myths|Footnotes)$/i.test(heading)), `${entry.id}: English section heading`)
  check($('.guide-attribution a').filter((_, el) => $(el).attr('href') === entry.sourceUrl).length === 1, `${entry.id}: missing attribution`)
  const schema = JSON.parse($('script[type="application/ld+json"]').html())
  check(schema['@graph'].some(item => item['@type'] === 'Article' && item.isBasedOn === entry.sourceUrl), `${entry.id}: missing source-linked Article schema`)
  const ids = $('[id]').map((_, el) => $(el).attr('id')).get()
  check(new Set(ids).size === ids.length, `${entry.id}: duplicate IDs`)
  $('.guide-toc a[href^="#"]').each((_, el) => check(ids.includes($(el).attr('href').slice(1)), `${entry.id}: broken table of contents`))
  check(search.some(page => page.path === entry.path && page.text.length > 1000), `${entry.id}: absent from full-text search`)
  check(sitemap.includes(`<loc>https://latroisiemevague.com${entry.path}</loc>`), `${entry.id}: absent from sitemap`)
}
for (const [path, category, expected] of [['/substances/', 'psychedelics', 22], ['/microdosing/', 'microdosing', 10]]) {
  const $ = load(await readFile(`dist${path}index.html`, 'utf8'))
  check($('main a.listing-card').length === expected, `${path}: incorrect catalogue count`)
  check($('.listing-status').length === 0, `${path}: forthcoming labels remain`)
  for (const entry of guideCatalog.filter(item => item.category === category)) check($(`main a[href="${entry.path}"]`).length > 0, `${path}: missing ${entry.path}`)
}
assert.deepEqual(errors, [], `${errors.length} guide problems:\n${errors.join('\n')}`)
console.log(`Verified all 32 French guides: ${words.toLocaleString('fr-FR')} words, ${references} source links, complete sections, metadata, search, sitemap and catalogue links.`)
