// Usage: node scripts/guide-rewrite-check.mjs <file.json>...
// Checks a guide against commit bc0e1c6, where the restored practical sections were inserted in English.
// Fails if a block's structure drifted (tags, ids, links) or if a block still reads as English.
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { load } from 'cheerio'
const BASE = 'bc0e1c6'
const shape = html => { const $ = load(html, null, false); return { tags: $('*').toArray().map(e => e.tagName + '#' + ($(e).attr('id') || '')).join(','), hrefs: $('a[href]').toArray().map(e => $(e).attr('href')).join('|') } }
const english = new Set('the and of to is are with that this for you your can be it as on or from have was were which their they will not by an at but'.split(' '))
const isEnglish = text => { const words = text.toLowerCase().match(/[a-zà-ÿ']+/g) || []; return words.length >= 6 && words.filter(w => english.has(w)).length / words.length > 0.12 }
let fail = false
for (const file of process.argv.slice(2)) {
  const path = file.includes('/') ? file : `src/content-data/guides/${file}`
  const cur = JSON.parse(readFileSync(path, 'utf8'))
  const base = JSON.parse(execSync(`git show ${BASE}:${path}`).toString())
  const problems = [], left = []
  if (cur.blocks.length !== base.blocks.length) problems.push(`blocks ${cur.blocks.length} != ${base.blocks.length}`)
  for (const k of Object.keys(base)) if (k !== 'blocks' && k !== 'practicalBlocks' && JSON.stringify(cur[k]) !== JSON.stringify(base[k])) problems.push(`field ${k} changed`)
  cur.blocks.forEach((b, i) => {
    const s = shape(b), o = shape(base.blocks[i] ?? '')
    if (s.tags !== o.tags) problems.push(`block ${i}: tags/ids differ`)
    if (s.hrefs !== o.hrefs) problems.push(`block ${i}: links differ`)
    const $ = load(b, null, false)
    if ($.root().contents().toArray().some(n => n.type === 'text' && n.data.trim())) problems.push(`block ${i}: text outside its element`)
    if (!/^\s*\[?\d+\]/.test($.text()) && isEnglish($.text())) left.push(i)
  })
  if (left.length) fail = true
  if (problems.length) { fail = true; console.log(`FAIL ${path}\n  ` + problems.slice(0, 20).join('\n  ')) }
  console.log(`${problems.length || left.length ? 'FAIL' : 'OK  '} ${path.split('/').pop()}: ${left.length} blocks still in English${left.length ? ' → ' + left.join(',') : ''}`)
}
process.exit(fail ? 1 : 0)
