import { readFileSync } from 'node:fs'
import path from 'node:path'

type SitemapManifest = {
  origin: string
  pages: Array<{ path: string }>
}

export function GET() {
  const manifest = JSON.parse(readFileSync(path.join(process.cwd(), 'src/content-data/pages/manifest.json'), 'utf8')) as SitemapManifest
  const urls = manifest.pages.map((page) => {
    const loc = new URL(page.path, manifest.origin).toString()

    return `<url><loc>${loc}</loc></url>`
  })

  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
    },
  })
}
