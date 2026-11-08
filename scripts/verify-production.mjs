import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { load } from 'cheerio'

const routes = ['/', '/substances/', '/microdosing/', '/substances/lsd/', '/microdosing/lsd/', '/blog/', '/contact/', '/confidentialite/', '/search.json', '/sitemap.xml', '/llms.txt']
for (const path of routes) {
  const expected = await readFile(`dist${path}${path.endsWith('/') ? 'index.html' : ''}`, 'utf8')
  let verified = false
  let failure = 'Response did not match the built release'
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const response = await fetch(`https://latroisiemevague.com${path}`, { signal: AbortSignal.timeout(15000), cache: 'no-store' })
      const body = await response.text()
      if (response.status === 200 && body === expected) { verified = true; break }
      failure = `HTTP ${response.status}; response did not match the built release`
    } catch (error) {
      failure = error.message
    }
    if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 3000))
  }
  assert(verified, `Production verification failed for ${path}: ${failure}`)
  console.log(`Verified ${path}`)
}
const response = await fetch('https://www.latroisiemevague.com/substances/lsd/', { signal: AbortSignal.timeout(15000) })
assert.equal(response.status, 200)
const $ = load(await response.text())
assert.equal($('link[rel=canonical]').attr('href'), 'https://latroisiemevague.com/substances/lsd/')
console.log('Verified www access and canonical URL. No form submissions sent.')

// Agent access: Markdown negotiation, Markdown 404, and trust-page redirects.
const fetchAs = (path, accept) => fetch(`https://latroisiemevague.com${path}`, { headers: { accept }, signal: AbortSignal.timeout(15000), cache: 'no-store' })
for (const path of ['/', '/substances/lsd/']) {
  const markdown = await fetchAs(path, 'text/markdown')
  assert.equal(markdown.status, 200, `${path}: Markdown status`)
  assert.match(markdown.headers.get('content-type') ?? '', /^text\/markdown/, `${path}: Markdown content type`)
  assert.match(markdown.headers.get('vary') ?? '', /accept/i, `${path}: Markdown Vary`)
  assert.equal(await markdown.text(), await readFile(`dist${path}index.md`, 'utf8'), `${path}: Markdown body differs from the build`)
  const html = await fetchAs(path, 'text/html')
  assert.match(html.headers.get('content-type') ?? '', /^text\/html/, `${path}: HTML content type`)
  assert.match(html.headers.get('vary') ?? '', /accept/i, `${path}: HTML Vary`)
}
const missing = await fetchAs(`/__agent-404-probe-${Date.now()}/`, 'text/markdown')
assert.equal(missing.status, 404)
assert.match(missing.headers.get('content-type') ?? '', /^text\/markdown/)
assert.match(await missing.text(), /llms\.txt/)
for (const [from, to] of [['/about/', '/a-propos/'], ['/privacy/', '/confidentialite/']]) {
  const response = await fetch(`https://latroisiemevague.com${from}`, { signal: AbortSignal.timeout(15000) })
  assert.equal(new URL(response.url).pathname, to, `${from} should redirect to ${to}`)
}
console.log('Verified Markdown negotiation, the Markdown 404 and the trust-page redirects.')
