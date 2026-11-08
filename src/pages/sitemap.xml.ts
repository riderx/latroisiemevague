import { pages } from '../lib/pages'
export function GET() {
  const urls = pages.filter(p => !['oups-404', 'jet-popup-popup'].includes(p.id))
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(p => `<url><loc>https://latroisiemevague.com${p.path}</loc></url>`).join('')}</urlset>`, { headers: { 'Content-Type': 'application/xml' } })
}
