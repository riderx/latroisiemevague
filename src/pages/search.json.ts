import { load } from 'cheerio'
import { pages, bodyFor } from '../lib/pages'
export function GET() {
  return Response.json(pages.filter(p => !/^(category-|author-|blog|jet-popup|oups-|portfolio)/.test(p.id)).map(page => {
    const $ = load(bodyFor(page)); $('script, style, form, nav').remove()
    return { path: page.path, title: page.title, description: page.description, text: $('main').text().replace(/\s+/g, ' ').trim() }
  }))
}
