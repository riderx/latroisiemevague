import { load } from 'cheerio'
import manifest from '../content-data/pages/manifest.json' with { type: 'json' }
import { bodyFor, headFor, type Page } from './pages'

/** Legacy posts that are retired (operational instructions); they redirect elsewhere. */
export const retiredPosts: Record<string, string> = {
  '/comment-faire-son-propre-ayahuasca-chez-soit/': '/substances/ayahuasca/',
  '/microdosing-volumetrique-avec-le-lsd/': '/microdosing/lsd/',
  '/johns-hopkins-ouvre-le-plus-grand-centre-de-recherche-psychedelique-du-monde/': '/recherche-psychedelique-2026/',
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

/** Shorter `<title>` for articles whose heading is longer than Google shows (about 60 characters). */
export const seoTitles: Record<string, string> = {
  'johns-hopkins-ouvre-le-plus-grand-centre-de-recherche-psychedelique-du-monde': 'Johns Hopkins ouvre un centre de recherche psychédélique',
  'comment-les-psychedeliques-liberent-les-mecanismes-de-controle-de-votre-cerveau': 'Psychédéliques et réseau du mode par défaut du cerveau',
  'la-recherche-clinique-prouve-que-le-microdosage-du-lsd-nest-pas-un-placebo': 'Microdosage du LSD : ce que montre un essai contrôlé',
  'synthese-de-la-recherche-psychedelique-sur-la-dependance': 'Psychédéliques et dépendances : la recherche et ses limites',
  'ayahuasca-lancien-antidepresseur': 'Ayahuasca et dépression : premiers essais et limites',
}

export type Article = { id: string; path: string; title: string; description: string; category: string; categoryId: string; published: string; modified: string; html: string; text: string; cover: string; words: number; current: boolean }

/**
 * Articles written or rewritten for the current site: src/content-data/articles/<slug>.json.
 * A file whose slug matches a legacy post replaces that post's body and keeps its URL; any other slug is a new article at /<slug>/.
 */
type ArticleFile = { title: string; description: string; category: keyof typeof categories; published: string; modified: string; cover: string; html: string }
const files = import.meta.glob('../content-data/articles/*.json', { eager: true, import: 'default' }) as Record<string, ArticleFile>
const edited = new Map(Object.entries(files).map(([file, data]) => [file.split('/').pop()!.replace(/\.json$/, ''), data]))

function fromFile(id: string, file: ArticleFile, path = `/${id}/`): Article {
  const text = load(file.html).text().replace(/\s+/g, ' ').trim()
  return { id, path, title: file.title, description: file.description, category: categories[file.category], categoryId: file.category,
    published: file.published, modified: file.modified, html: file.html, text, cover: file.cover, words: text.split(/\s+/).length, current: true }
}

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
    html, text, cover: covers[page.id] ?? 'library', words: text.split(/\s+/).length, current: false,
  }
}

const postPaths = new Set(manifest.postPaths)
const legacy = manifest.pages.filter(p => postPaths.has(p.path) && !retiredPosts[p.path])
export const articles: Article[] = [
  ...legacy.map(p => edited.has(p.id) ? fromFile(p.id, edited.get(p.id)!, p.path) : parse(p)),
  ...[...edited].filter(([id]) => !legacy.some(p => p.id === id)).map(([id, file]) => fromFile(id, file)),
].sort((a, b) => b.modified.localeCompare(a.modified))

export const formatDate = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
