// Content negotiation for agents: `Accept: text/markdown` gets the Markdown copy written by
// scripts/build-markdown.mjs (dist/<path>/index.md); other requests get the static asset as before.

/**
 * Quality of `type` in an Accept header, using the most specific matching media range
 * (exact, then `type/*`, then `*\/*`) as in RFC 9110 §12.5.1. Returns 0 when nothing matches.
 */
function quality(accept: string, type: string, exactOnly = false) {
  let best = { specificity: -1, q: 0 }
  for (const part of accept.split(',')) {
    const [media, ...params] = part.trim().toLowerCase().split(';').map(s => s.trim())
    const specificity = media === type ? 2 : !exactOnly && media === `${type.split('/')[0]}/*` ? 1 : !exactOnly && media === '*/*' ? 0 : -1
    if (specificity <= best.specificity) continue
    const q = params.find(p => p.startsWith('q='))
    best = { specificity, q: q ? Number(q.slice(2)) || 0 : 1 }
  }
  return best.q
}

/** True when the client names text/markdown explicitly and prefers it at least as much as HTML. */
export function wantsMarkdown(request: Request) {
  const accept = request.headers.get('accept') || ''
  const markdown = quality(accept, 'text/markdown', true)
  return markdown > 0 && markdown >= quality(accept, 'text/html')
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

async function markdownNotFound(request: Request, assets: Fetcher) {
  const body = await (await assets.fetch(new Request(new URL('/404.md', request.url), { method: 'GET' }))).text()
  return new Response(request.method === 'HEAD' ? null : body, { status: 404, headers: markdownHeaders(404) })
}

export async function serveAsset(request: Request, assets: Fetcher) {
  if (!['GET', 'HEAD'].includes(request.method)) return assets.fetch(request)
  const { pathname } = new URL(request.url)
  const markdown = wantsMarkdown(request)
  const isFile = /\.[a-z0-9]+$/i.test(pathname)

  // Pages live at folder URLs; the Markdown copy sits next to the HTML as index.md.
  if (pathname.endsWith('/') && markdown) {
    const copy = await assets.fetch(new Request(new URL(`${pathname}index.md`, request.url), { method: 'GET' }))
    if (copy.ok) return new Response(request.method === 'HEAD' ? null : copy.body, { status: 200, headers: markdownHeaders(200) })
    // A missing copy can still be a redirect (/about/ → /a-propos/, legacy URLs).
    const page = await assets.fetch(new Request(request.url, { method: 'GET', redirect: 'manual' }))
    return page.status >= 300 && page.status < 400 ? withVary(page) : markdownNotFound(request, assets)
  }

  // Everything else keeps the asset response (files, trailing-slash and _redirects redirects, HTML pages).
  const response = await assets.fetch(request)
  if (response.status === 404 && (markdown || pathname.endsWith('.md'))) return markdownNotFound(request, assets)
  return isFile ? response : withVary(response)
}
