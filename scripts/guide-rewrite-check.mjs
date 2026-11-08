// Usage: node scripts/guide-rewrite-check.mjs <file.json>...
// Compares each guide block against the original machine translation (commit 430b885)
// and against HEAD for structure. Fails on structure drift; lists prose blocks that are
// still (almost) the original wording so they can be rewritten.
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { load } from 'cheerio'
const BASE = '430b885'
const norm = t => t.replace(/[’']/g, "'").replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
const shape = html => { const $ = load(html, null, false); return { tags: $('*').toArray().map(e => e.tagName + '#' + ($(e).attr('id') || '')).join(','), hrefs: $('a[href]').toArray().map(e => $(e).attr('href')).join('|') } }
let fail = false
for (const file of process.argv.slice(2)) {
  const path = file.includes('/') ? file : `src/content-data/guides/${file}`
  const cur = JSON.parse(readFileSync(path, 'utf8'))
  const head = JSON.parse(execSync(`git show HEAD:${path}`).toString())
  const base = JSON.parse(execSync(`git show ${BASE}:${path}`).toString())
  const problems = [], stale = []
  if (cur.blocks.length !== base.blocks.length) problems.push(`blocks ${cur.blocks.length} != ${base.blocks.length}`)
  for (const k of Object.keys(base)) if (k !== 'blocks' && JSON.stringify(cur[k]) !== JSON.stringify(base[k])) problems.push(`field ${k} changed`)
  cur.blocks.forEach((b, i) => {
    const s = shape(b), o = shape(base.blocks[i] ?? '')
    if (s.tags !== o.tags) problems.push(`block ${i}: tags/ids differ`)
    if (s.hrefs !== o.hrefs) problems.push(`block ${i}: links differ`)
    const text = norm(load(b).text()), orig = norm(load(base.blocks[i] ?? '').text())
    const words = orig.split(' ').filter(w => w.length > 2)
    if (words.length < 12) return
    const now = new Set(text.split(' '))
    const changed = words.filter(w => !now.has(w)).length / words.length
    if (changed < 0.2) stale.push(i)
  })
  if (problems.length) { fail = true; console.log(`FAIL ${path}\n  ` + problems.slice(0, 20).join('\n  ')) }
  console.log(`${problems.length ? 'FAIL' : 'OK  '} ${path.split('/').pop()}: ${stale.length} prose blocks still close to the 2026 machine translation${stale.length ? ' → ' + stale.join(',') : ''}`)
}
process.exit(fail ? 1 : 0)
