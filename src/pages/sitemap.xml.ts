import { pages } from '../lib/pages'
import { guideCatalog, guideFor, guideDates } from '../lib/guides'
export function GET() {
  const urls = pages.filter(p => !['oups-404', 'jet-popup-popup'].includes(p.id))
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(p => {
    const guide = guideCatalog.find(guide => guide.path === p.path)
    const modified = guide ? guideDates(guideFor(guide)).modified : undefined
    return `<url><loc>https://latroisiemevague.com${p.path}</loc>${modified ? `<lastmod>${modified}</lastmod>` : ''}</url>`
  }).join('')}</urlset>`, { headers: { 'Content-Type': 'application/xml' } })
}
