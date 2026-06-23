import site from '../data/site.json'

export function GET() {
  const urls = site.pages.map((page) => {
    const loc = new URL(page.path, site.origin).toString()

    return `<url><loc>${loc}</loc></url>`
  })

  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
    },
  })
}
