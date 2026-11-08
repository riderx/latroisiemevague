import { load } from 'cheerio'
import { allGuideSources, guideCatalog, guideDescription, type GuideEntry } from '../content-data/guide-catalog'
import { evidenceFor, applyEditorialUpdates } from '../content-data/guide-updates'
export type Guide = GuideEntry & {
  blocks: string[]; retrievedAt: string; translatedAt: string; sourceWords: number; sourceBlockCount: number;
  contentHash: string; originalTitle: string; translationModel: string; translationVersion: string;
  omissions: { heading: string; reason: string }[]
}
const files = import.meta.glob('../content-data/guides/*.json', { eager: true, import: 'default' }) as Record<string, Guide>
const legacyHeads = import.meta.glob('../content-data/pages/{substances,microdosing}-*.head.html', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>
export function guideDates(guide: Guide) {
  const legacyId = guide.path.slice(1, -1).replaceAll('/', '-')
  const head = legacyHeads[`../content-data/pages/${legacyId}.head.html`]
  const $ = load(head || '')
  const schema = $('script[type="application/ld+json"]').html()
  const published = schema ? JSON.parse(schema)['@graph']?.find((item: { '@type': string }) => item['@type'] === 'WebPage')?.datePublished : undefined
  return { published: published || guide.translatedAt, modified: guide.translatedAt }
}
export const guideFor = (entry: GuideEntry): Guide => {
  const guide = files[`../content-data/guides/${entry.id}.json`]
  if (!guide?.blocks?.length || guide.blocks.length !== guide.sourceBlockCount) throw new Error(`French translation incomplete: ${entry.id}`)
  return guide
}
const slug = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const normalizePath = (path: string) => path.replace(/\/+$/, '') || '/'
const sectionLabels: Record<string, string> = { overview: 'Présentation', experience: 'Expérience', effects: 'Effets', benefits: 'Bénéfices potentiels et risques', benefitsandrisks: 'Bénéfices potentiels et risques', use: 'Recherche thérapeutique', therapeuticuse: 'Recherche thérapeutique', growth: 'Développement personnel', personalgrowth: 'Développement personnel', development: 'Développement professionnel', microdosing: 'Microdosage', legality: 'Légalité', history: 'Histoire', historyandstats: 'Histoire et statistiques', myths: 'Mythes', faq: 'Questions fréquentes', footnotes: 'Références', pharmacology: 'Pharmacologie', ethicalconsiderations: 'Considérations éthiques' }
function prepare(guide: Guide) {
  const $ = load(applyEditorialUpdates(guide.id, guide.blocks, guide.contentHash).join('\n'), null, false)
  if (guide.slug === 'ibogaine') {
    $('p').each((_, el) => { const html = $(el).html(); if (html) $(el).html(html.replace(/dépendance à l['’]opium/g, 'dépendance aux opioïdes')) })
  }
  const used = new Set<string>()
  $('[id]').each((_, element) => { const id = $(element).attr('id')!; if (used.has(id)) $(element).removeAttr('id'); else used.add(id) })
  $('a[href]').each((_, element) => {
    const match = $(element).attr('href')?.match(/#(_ftn)(ref)?(\d+)$/)
    if (!match || $(element).attr('id')) return
    const id = `${match[1]}${match[2] ? '' : 'ref'}${match[3]}`
    if (/^\[?\d+\]?$/.test($(element).text().trim())) $(element).text(`[${match[3]}]`)
    if (!used.has(id)) { $(element).attr('id', id); used.add(id) }
  })
  $('h2[id]').each((_, element) => {
    const label = sectionLabels[$(element).attr('id')!.replace(/[-_]/g, '').toLowerCase()]
    if (label) $(element).text(label)
    if (label === 'Légalité') $(element).after('<p class="guide-editorial-update"><strong>Contexte juridique.</strong> Cette section traduit le contexte présenté par la source anglaise. Elle ne constitue pas une vérification actualisée des lois de chaque pays. Dépénalisation, autorisation médicale et légalité générale sont des notions distinctes.</p>')
  })
  $('h2,h3,h4').each((index, element) => {
    if ($(element).attr('id')) return
    let id = slug($(element).text()) || `section-${index + 1}`
    while (used.has(id)) id += `-${index + 1}`
    used.add(id); $(element).attr('id', id)
  })
  $('script,style,iframe,form,button').remove()
  $('*').each((_, element) => {
    if (!('attribs' in element)) return
    for (const attribute of Object.keys(element.attribs)) if (!['id','href','src','alt','title','colspan','rowspan','loading','decoding','class'].includes(attribute)) $(element).removeAttr(attribute)
  })
  return $
}
const anchorCache = new Map<string, Set<string>>()
function anchorsFor(entry: GuideEntry) {
  if (!anchorCache.has(entry.id)) {
    const $ = prepare(guideFor(entry))
    anchorCache.set(entry.id, new Set(['sommaire', 'contenu', 'point-recherche', 'source-originale', ...$('[id]').map((_, el) => $(el).attr('id')!).get()]))
  }
  return anchorCache.get(entry.id)!
}
export function guideContent(guide: Guide) {
  const $ = prepare(guide)
  $('a[href]').each((_, element) => {
    const node = $(element)
    try {
      const url = new URL(node.attr('href')!, guide.sourceUrl)
      if (!['https:', 'http:', 'mailto:'].includes(url.protocol)) { node.removeAttr('href'); return }
      const target = allGuideSources.find(entry => normalizePath(new URL(entry.sourceUrl).pathname) === normalizePath(url.pathname) && /^(?:www\.)?thethirdwave\.co$/.test(url.hostname))
      if (target) {
        const hash = url.hash && !target.hub && anchorsFor(target).has(decodeURIComponent(url.hash.slice(1))) ? url.hash : ''
        node.attr('href', target.path + hash)
      }
      node.removeAttr('target')
    } catch { node.removeAttr('href') }
  })
  const toc = $('h2').toArray().map(el => ({ id: $(el).attr('id')!, title: $(el).text().trim() })).filter(item => item.title)
  return { html: $.html(), toc, description: guideDescription(guide), words: $.text().trim().split(/\s+/).length, evidence: evidenceFor(guide) }
}
export { guideCatalog }
