import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { load } from 'cheerio'

const routes = ['/', '/substances/', '/microdosing/', '/substances/lsd/', '/microdosing/lsd/', '/blog/', '/contact/', '/search.json', '/sitemap.xml']
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
