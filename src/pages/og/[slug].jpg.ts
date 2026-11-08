import { readFileSync } from 'node:fs'
import type { APIRoute } from 'astro'
import opentype from 'opentype.js'
import sharp from 'sharp'
import { guideCatalog } from '../../content-data/guide-catalog'
import { articles } from '../../lib/articles'
import { illustrationFor, keyOf, ogImage, shortName } from '../../data/site'

/** Share image (1200×630) for each guide and article: title on paper, illustration in a leaf-shaped tinted panel. */
const W = 1200, H = 630, PAPER = '#faf7f2', INK = '#1f2547', PETROL = '#1f5a66'
const TINTS = ['#fbe8df', '#e4f0e2', '#ebe8fb', '#fcf0d4']
const tint = (key: string) => TINTS[Array.from(key).reduce((a, c) => a + c.charCodeAt(0), 0) % 4]
const font = (file: string) => { const b = readFileSync(`src/assets/og/${file}`); return opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)) }
const serif = font('erode-400.ttf'), italic = font('erode-400i.ttf')

type Card = { title: string; subtitle: string; ill: string; key: string; article?: boolean }
const strip = (path: string) => ogImage(path).slice('/og/'.length, -'.jpg'.length)
const cards: [string, Card][] = [
  ...guideCatalog.filter(g => !g.hub).map(g => [strip(g.path), {
    title: g.category === 'microdosing' ? g.name : shortName(keyOf(g), g.name),
    subtitle: g.category === 'microdosing' ? 'microdosage et recherche' : 'effets, risques, recherche',
    ill: illustrationFor(keyOf(g)), key: keyOf(g),
  }] as [string, Card]),
  ...articles.map(a => [strip(a.path), { title: a.title, subtitle: a.category, ill: a.cover, key: a.id, article: true }] as [string, Card]),
]

export const getStaticPaths = () => cards.map(([slug, card]) => ({ params: { slug }, props: card }))

/** SVG path data for `text` (opentype.js 2.0 `toPathData` emits NaN for some curves). */
const pathData = (f: opentype.Font, text: string, x: number, y: number, size: number) => f.getPath(text, x, y, size).commands.map(c =>
  c.type === 'Z' ? 'Z' : c.type === 'C' ? `C${c.x1} ${c.y1} ${c.x2} ${c.y2} ${c.x} ${c.y}` : c.type === 'Q' ? `Q${c.x1} ${c.y1} ${c.x} ${c.y}` : `${c.type}${c.x} ${c.y}`).join('')

/** Greedy wrap at the largest size (step 4px) that fits `maxLines` lines of `maxWidth` within `maxHeight`. */
function fit(text: string, maxSize: number, maxWidth: number, maxLines: number, maxHeight: number) {
  // Erode has no narrow no-break space (U+202F): use a plain no-break space. A French ":", "?", "!" or ";" after a plain space stays on its word's line.
  const words = text.replace(/[\u202f\u2009]/g, '\u00a0').split(/ +/)
    .reduce<string[]>((ws, w) => (/^[:;?!»]$/.test(w) && ws.length ? [...ws.slice(0, -1), `${ws.at(-1)} ${w}`] : [...ws, w]), [])
  for (let size = maxSize; ; size -= 4) {
    const width = (s: string) => serif.getAdvanceWidth(s, size)
    const lines = words.reduce<string[]>((ls, word) => {
      const joined = ls.length ? `${ls.at(-1)} ${word}` : word
      if (ls.length && width(joined) <= maxWidth) ls[ls.length - 1] = joined
      else ls.push(word)
      return ls
    }, [])
    if (size <= 40 || (lines.length <= maxLines && lines.length * size * 1.05 <= maxHeight && lines.every(l => width(l) <= maxWidth))) return { size, lines }
  }
}

/** Rounded rectangle with large radius on two opposite corners and a small one on the others (the site's leaf shape). */
const leaf = (x: number, y: number, w: number, h: number, big: number, small: number) =>
  `M${x + big},${y}H${x + w - small}A${small},${small} 0 0 1 ${x + w},${y + small}V${y + h - big}A${big},${big} 0 0 1 ${x + w - big},${y + h}` +
  `H${x + small}A${small},${small} 0 0 1 ${x},${y + h - small}V${y + big}A${big},${big} 0 0 1 ${x + big},${y}Z`

export const GET: APIRoute = async ({ props }) => {
  const { title, subtitle, ill, key, article } = props as Card
  const art = await sharp(`src/assets/ill/${ill}.webp`).resize(430, 430, { fit: 'inside' }).png().toBuffer({ resolveWithObject: true })
  const { size, lines } = article ? fit(title, 62, 500, 5, 400) : fit(title, 120, 500, 2, 300)
  // The subtitle shrinks if needed so it never reaches the panel (which starts at x = 660).
  const sub = Math.min(46, Math.floor(46 * 500 / italic.getAdvanceWidth(subtitle, 46)))
  const lh = Math.round(size * 1.05), gap = 30
  let y = Math.round((H - (lines.length * lh + gap + sub)) / 2 - 10)
  const titlePaths = lines.map(l => { y += lh; return pathData(serif, l, 72, y - Math.round(size * 0.25), size) }).join('')
  const subPath = pathData(italic, subtitle, 76, y + gap + sub - 6, sub)
  const ax = W - 290 - art.info.width / 2, ay = (H - art.info.height) / 2
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}">
<rect width="${W}" height="${H}" fill="${PAPER}"/><path d="${leaf(W - 540, 40, 500, H - 80, 110, 28)}" fill="${tint(key)}"/>
<image x="${ax}" y="${ay}" width="${art.info.width}" height="${art.info.height}" xlink:href="data:image/png;base64,${art.data.toString('base64')}"/>
<path d="${titlePaths}" fill="${INK}"/><path d="${subPath}" fill="${PETROL}"/></svg>`
  const jpg = await sharp(Buffer.from(svg)).jpeg({ quality: 86, mozjpeg: true }).toBuffer()
  return new Response(new Uint8Array(jpg), { headers: { 'Content-Type': 'image/jpeg' } })
}
