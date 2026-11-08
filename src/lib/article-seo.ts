import { load } from 'cheerio'
type SchemaNode = { '@type': string; '@id'?: string; [key: string]: unknown }

export function articleHead(head: string, body: string) {
  const $ = load(head, null, false)
  const published = $('meta[property="article:published_time"]').attr('content')
  if (!published) return head
  const script = $('script[type="application/ld+json"]').first()
  const schema = JSON.parse(script.html() || '{}')
  const graph = schema['@graph'] as SchemaNode[] | undefined
  const webpage = graph?.find(item => item['@type'] === 'WebPage')
  if (!graph || !webpage || graph.some(item => ['Article', 'BlogPosting'].includes(item['@type']))) return head
  const content = load(body)
  const canonical = $('link[rel=canonical]').attr('href')!
  const title = content('main h1').first().text().trim()
  const modified = $('meta[property="article:modified_time"]').attr('content') || published
  const description = $('meta[name=description]').attr('content')
  const image = $('meta[property="og:image"]').attr('content')
  graph.push({
    '@type': 'BlogPosting', '@id': canonical + '#article', url: canonical, headline: title,
    description, inLanguage: 'fr-FR', datePublished: published, dateModified: modified,
    author: webpage.author, mainEntityOfPage: { '@id': webpage['@id'] }, image,
    publisher: { '@type': 'Organization', name: 'La Troisième Vague', url: 'https://latroisiemevague.com/', logo: { '@type': 'ImageObject', url: 'https://latroisiemevague.com/assets/uploads/2020/05/logo-1.png' } },
    wordCount: content('.jupiterx-post-content').text().trim().split(/\s+/).length,
  })
  webpage.mainEntity = { '@id': canonical + '#article' }
  script.text(JSON.stringify(schema).replace(/</g, '\\u003c'))
  for (const [name, value] of [['twitter:title', $('title').text()], ['twitter:description', description], ['twitter:image', image]]) {
    if (value && !$(`meta[name="${name}"]`).length) $('meta').first().before($('<meta>').attr({ name: name!, content: value }))
  }
  return $.html()
}
