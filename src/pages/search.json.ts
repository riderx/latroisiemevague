import { load } from 'cheerio'
import { listingPages } from '../content-data/listings'
import { guideCatalog, guideFor, guideContent } from '../lib/guides'
import { guideTitle } from '../content-data/guide-catalog'
import { articles } from '../lib/articles'
export function GET() {
  return Response.json([
    ...Object.values(listingPages).map(l => ({ path: l.path, title: l.title, description: l.description, text: l.searchText })),
    ...guideCatalog.map(entry => { const { html, description } = guideContent(guideFor(entry)); return { path: entry.path, title: guideTitle(entry), description, text: load(html).text().replace(/\s+/g, ' ').trim() } }),
    ...articles.map(a => ({ path: a.path, title: a.title, description: a.description, text: a.text })),
    { path: '/aide/', title: 'Aide et urgences', description: 'Numéros d’urgence et repères de sécurité.', text: 'aide urgence secours 15 112 drogues info service interactions contre-indications analyse produit bad trip expérience difficile' },
  ])
}
