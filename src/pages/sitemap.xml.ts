import { guideCatalog, guideFor, guideDates } from '../lib/guides'
import { articles } from '../lib/articles'
const SITE = 'https://latroisiemevague.com'
export function GET() {
  const urls: [string, string?][] = [['/'], ['/substances/'], ['/microdosing/'], ['/blog/'], ['/aide/'], ['/a-propos/'], ['/contact/'], ['/confidentialite/'],
    ...guideCatalog.map(g => [g.path, guideDates(guideFor(g)).modified] as [string, string]),
    ...articles.map(a => [a.path, a.modified] as [string, string])]
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(([p, m]) => `<url><loc>${SITE}${p}</loc>${m ? `<lastmod>${m.slice(0, 10)}</lastmod>` : ''}</url>`).join('')}</urlset>`, { headers: { 'Content-Type': 'application/xml' } })
}
