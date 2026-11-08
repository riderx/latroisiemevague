// Content negotiation for agents: `Accept: text/markdown` gets the Markdown copy written by
// scripts/build-markdown.mjs (dist/<path>/index.md); other requests get the static asset as before.

/** Quality value of `type` in an Accept header (0 when absent). Only an exact match counts. */
function quality(accept: string, type: string) {
  for (const part of accept.split(',')) {
    const [media, ...params] = part.trim().toLowerCase().split(';')
    if (media.trim() !== type) continue
    const q = params.map(p => p.trim()).find(p => p.startsWith('q='))
    return q ? Number(q.slice(2)) || 0 : 1
  }
  return 0
}

/** True when the client asks for Markdown at least as strongly as for HTML. */
export function wantsMarkdown(request: Request) {
  const accept = request.headers.get('accept') || ''
  const markdown = quality(accept, 'text/markdown')
  return markdown > 0 && markdown >= quality(accept, 'text/html')
}

/** The Markdown asset for a page path: `/a/` → `/a/index.md`; files with an extension have none. */
export function markdownPath(pathname: string) {
  if (pathname.endsWith('/')) return `${pathname}index.md`
  return /\.[a-z0-9]+$/i.test(pathname) ? null : `${pathname}/index.md`
}

const markdownHeaders = (status: number) => ({
  'Content-Type': 'text/markdown; charset=utf-8',
  Vary: 'Accept',
  'Cache-Control': status === 200 ? 'public, max-age=300' : 'no-store',
  'X-Content-Type-Options': 'nosniff',
})

function withVary(response: Response) {
  const out = new Response(response.body, response)
  out.headers.append('Vary', 'Accept')
  return out
}

export async function serveAsset(request: Request, assets: Fetcher) {
  if (!['GET', 'HEAD'].includes(request.method)) return assets.fetch(request)
  const url = new URL(request.url)
  const pagePath = markdownPath(url.pathname)
  if (!pagePath) return assets.fetch(request)
  if (!wantsMarkdown(request)) return withVary(await assets.fetch(request))

  const asset = await assets.fetch(new Request(new URL(pagePath, url), { method: 'GET' }))
  if (asset.ok) return new Response(request.method === 'HEAD' ? null : asset.body, { status: 200, headers: markdownHeaders(200) })
  // Keep the site's redirects (trailing slash, /about/ → /a-propos/, legacy URLs) for Markdown clients.
  const page = await assets.fetch(new Request(request.url, { method: 'GET', redirect: 'manual' }))
  if (page.status >= 300 && page.status < 400) return withVary(page)
  const notFound = await assets.fetch(new Request(new URL('/404.md', url), { method: 'GET' }))
  return new Response(request.method === 'HEAD' ? null : await notFound.text(), { status: 404, headers: markdownHeaders(404) })
}
