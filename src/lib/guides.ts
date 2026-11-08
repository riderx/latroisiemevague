import { load } from 'cheerio'
import { allGuideSources, guideCatalog, guideDescription, type GuideEntry } from '../content-data/guide-catalog'
import { evidenceFor, applyEditorialUpdates } from '../content-data/guide-updates'
import franceStatus from '../content-data/france-status.json' with { type: 'json' }
export type Guide = GuideEntry & {
  blocks: string[]; retrievedAt: string; translatedAt: string; sourceWords: number; sourceBlockCount: number;
  contentHash: string; originalTitle: string; translationModel: string; translationVersion: string;
  omissions: { heading: string; reason: string }[]; practicalBlocks?: number[]
}
const files = import.meta.glob(['../content-data/guides/*.json', '!../content-data/guides/catalog.json'], { eager: true, import: 'default' }) as Record<string, Guide>
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
const riskNotice = '<p class="guide-editorial-update"><strong>Réduction des risques.</strong> Le passage qui suit reprend les informations pratiques de la source anglaise : doses, préparation ou approvisionnement. Il informe, il n’incite pas à consommer. Selon le produit, l’usage peut être interdit en France. La teneur d’un produit varie, et les mélanges augmentent les risques. En cas de malaise, appelez le 15 ou le 112. <a href="/aide/">Numéros d’aide et d’écoute</a></p>'
/**
 * Puts the risk notice at the start of each run of practical blocks (after its heading when the run opens with one).
 * In the FAQ every question becomes its own disclosure, so each practical question gets its own notice.
 */
function withRiskNotices(guide: Guide, blocks: string[]) {
  const practical = new Set(guide.practicalBlocks ?? [])
  let inFaq = false
  return blocks.flatMap((block, i) => {
    const heading = block.trim().match(/^<h([2-6])/)
    if (heading?.[1] === '2') inFaq = /id="faq"/.test(block)
    const startsRun = practical.has(i) && (!practical.has(i - 1) || (inFaq && heading !== null))
    return !startsRun ? [block] : heading ? [block, riskNotice] : [riskNotice, block]
  })
}
/** Legal status in France, checked against French sources (src/content-data/france-status.json), shown at the top of « Légalité ». */
function franceBox(guide: Guide) {
  const entry = (franceStatus as Record<string, { html: string; checked: string }>)[guide.path.replace(/\/$/, '').split('/').pop()!]
  if (!entry) return null
  const checked = new Date(entry.checked).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  return `<div class="guide-editorial-update guide-france-status"><strong>Statut en France.</strong>${entry.html}<p class="checked">Vérifié le ${checked}.</p></div>`
}
function prepare(guide: Guide) {
  const $ = load(withRiskNotices(guide, applyEditorialUpdates(guide.id, guide.blocks, guide.contentHash)).join('\n'), null, false)
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
    if (label === 'Légalité') $(element).after(franceBox(guide) ?? '')
    if (label === 'Légalité') $(element).after('<p class="guide-editorial-update"><strong>Contexte juridique.</strong> Cette section traduit le contexte présenté par la source anglaise. Elle ne constitue pas une vérification actualisée des lois de chaque pays. Dépénalisation, autorisation médicale et légalité générale sont des notions distinctes.</p>')
  })
  if (!$('.guide-france-status').length) { const box = franceBox(guide); const faq = $('h2#faq').first(); if (box) faq.length ? faq.before(box) : $.root().append(box) }
  // Some sources jump from h2 to h4: lower such a heading to one level below the previous heading.
  let previous = 2
  $('h2,h3,h4,h5,h6').each((_, element) => {
    const level = Number(element.tagName[1])
    if (level > previous + 1) element.tagName = `h${previous + 1}`
    previous = Number(element.tagName[1])
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
