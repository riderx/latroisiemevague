import { load } from 'cheerio'
import manifest from '../content-data/pages/manifest.json' with { type: 'json' }
import { bodyFor, headFor, type Page } from './pages'

/** Legacy posts that are retired (operational instructions); they redirect elsewhere. */
export const retiredPosts: Record<string, string> = {
  '/comment-faire-son-propre-ayahuasca-chez-soit/': '/substances/ayahuasca/',
  '/microdosing-volumetrique-avec-le-lsd/': '/microdosing/lsd/',
}

const categories: Record<string, string> = { information: 'Comprendre', actualites: 'Actualités', guides: 'Guides pratiques' }
/** Illustration used as cover for each article (keeps the visual language consistent). */
const covers: Record<string, string> = {
  'a-quoi-vous-attendre-lors-de-votre-prochain-voyage-au-lsd': 's-lsd',
  'ayahuasca-lancien-antidepresseur': 's-ayahuasca',
  'comment-les-psychedeliques-liberent-les-mecanismes-de-controle-de-votre-cerveau': 'x-g6',
  'johns-hopkins-ouvre-le-plus-grand-centre-de-recherche-psychedelique-du-monde': 'x-g4',
  'la-recherche-clinique-prouve-que-le-microdosage-du-lsd-nest-pas-un-placebo': 'x-g1',
  'le-microdosage-des-psychedeliques-est-lie-a-une-meilleure-humeur-et-a-un-meilleur-objectif-dans-deux-nouveaux-documents-de-recherche': 'x-g5',
  'les-psychedeliques-peuvent-ils-induire-des-etats-de-flow': 'x-g3',
  'lsd-contexte-set-setting': 'x-g2',
  'pouvez-vous-traiter-la-depression-avec-le-microdosage': 'library',
  'quelle-est-la-legalite-de-layahuasca-dans-votre-pays': 'x-values',
  'risque-cardiaque-potentiel': 's-mdma',
  'synthese-de-la-recherche-psychedelique-sur-la-dependance': 's-ibogaine',
  'trip-au-dmt-a-quoi-vous-attendre': 's-dmt',
}

export type Article = { id: string; path: string; title: string; description: string; category: string; categoryId: string; published: string; modified: string; html: string; text: string; cover: string; words: number }

const clean = (title: string) => title.replace(/\s*[-–|]\s*La troisième vague\s*$/i, '').trim()

function parse(page: Page): Article {
  const $ = load(bodyFor(page))
  const article = $('article').first()
  const categoryId = (article.attr('class')?.match(/category-(\w+)/) ?? [])[1] ?? 'information'
  const content = article.find('.jupiterx-post-content').first()
  content.find('script,style,iframe,form,button,noscript,.sharedaddy,.jupiterx-social-share').remove()
  content.find('*').each((_, el) => {
    if (!('attribs' in el)) return
    for (const a of Object.keys(el.attribs)) if (!['href', 'src', 'alt', 'title', 'colspan', 'rowspan', 'id'].includes(a)) $(el).removeAttr(a)
  })
  const seen = new Set<string>()
  content.find('[id]').each((_, el) => {
    const id = $(el).attr('id')!
    if (seen.has(id) || ['section', 'div'].includes((el as { tagName?: string }).tagName ?? '')) $(el).removeAttr('id')
    else seen.add(id)
  })
  content.find('section,div').each((_, el) => { if (!$(el).text().trim() && !$(el).find('img').length) $(el).remove() })
  content.find('img').attr('loading', 'lazy').attr('decoding', 'async')
  content.find('a[href^="http"]').each((_, a) => { if (!$(a).attr('href')!.includes('latroisiemevague.com')) $(a).attr('rel', 'noopener') })
  content.find('a[href*="latroisiemevague.com"]').each((_, a) => { $(a).attr('href', $(a).attr('href')!.replace(/^https?:\/\/(www\.)?latroisiemevague\.com/, '')) })
  content.find('p').each((_, p) => { if (!$(p).text().trim() && !$(p).find('img').length) $(p).remove() })
  const head = load(headFor(page) || '')
  const schema = head('script[type="application/ld+json"]').html()
  const graph: { '@type': string; datePublished?: string; dateModified?: string }[] = schema ? JSON.parse(schema)['@graph'] ?? [] : []
  const node = graph.find(n => n.datePublished)
  const html = content.html() ?? ''
  const text = load(html).text().replace(/\s+/g, ' ').trim()
  return {
    id: page.id, path: page.path, title: clean($('h1').first().text() || page.title), description: page.description || text.slice(0, 160),
    category: categories[categoryId] ?? 'Comprendre', categoryId,
    published: node?.datePublished ?? '2020-01-01', modified: node?.dateModified ?? node?.datePublished ?? '2020-01-01',
    html, text, cover: covers[page.id] ?? 'library', words: text.split(/\s+/).length,
  }
}

const postPaths = new Set(manifest.postPaths)
export const articles: Article[] = manifest.pages
  .filter(p => postPaths.has(p.path) && !retiredPosts[p.path])
  .map(p => parse(p))
  .sort((a, b) => b.published.localeCompare(a.published))

export const formatDate = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
