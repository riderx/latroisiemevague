import { readFile, writeFile } from 'node:fs/promises'
import { load } from 'cheerio'
const corrections = JSON.parse(await readFile('src/content-data/guide-corrections.json', 'utf8'))
for (const [id, edit] of Object.entries(corrections)) {
  const file = `src/content-data/guides/${id}.json`
  const guide = JSON.parse(await readFile(file, 'utf8'))
  if (guide.contentHash !== edit.sourceHash) throw new Error(`Stale corrections: ${id}`)
  for (const replacement of edit.replacements) guide.blocks[replacement.index] = replacement.html
  guide.blocks = guide.blocks.map(block => {
    const $ = load(block, null, false)
    const polish = node => {
      if (node.type === 'text') {
        node.data = node.data
          .replace(/Where is ayahuasca legal\?/g, 'Où l’ayahuasca est-elle légale ?')
          .replace(/Cet article a été révisé médicalement par/g, 'La version anglaise de cet article a été révisée médicalement par')
          .replace(/\bla LSD\b/g, 'le LSD').replace(/\bLa LSD\b/g, 'Le LSD')
          .replace(/\bde le LSD\b/g, 'du LSD').replace(/\bà le LSD\b/g, 'au LSD')
          .replace(/\bla diéthylamide\b/g, 'le diéthylamide')
          .replace(/\bune alleviation\b/g, 'un soulagement')
          .replace(/\bcondonons\b/g, 'approuvons')
          .replace(/\bla muscimole\b/g, 'le muscimol')
          .replace(/\bfly agaric ou fly amanita mushroom\b/gi, 'amanite tue-mouches')
          .replace(/\bfly agaric\b/gi, 'amanite tue-mouches')
          .replace(/\ble amanite\b/g, 'l’amanite')
      }
      for (const child of node.children || []) polish(child)
    }
    polish($.root()[0])
    return $.html()
  })
  guide.editorialCorrectionsApplied = true
  await writeFile(file, JSON.stringify(guide, null, 2) + '\n')
}
console.log('Applied the reviewed editorial corrections to all 32 published guide files.')
