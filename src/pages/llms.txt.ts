import { guideCatalog, guideDescription } from '../content-data/guide-catalog'
import { articles } from '../lib/articles'
import { SITE } from '../data/site'

/** llms.txt (https://llmstxt.org): what the site is, when an agent should use it, and links to Markdown pages. */
const md = (path: string) => `${SITE}${path}index.md`
const guides = (category: string) => guideCatalog.filter(g => !g.hub && g.category === category)
  .map(g => `- [${g.name}](${md(g.path)}): ${guideDescription(g)}`).join('\n')

export function GET() {
  const body = `# La Troisième Vague

> French-language reference on psychedelics: effects, risks, interactions, legal context and the state of clinical research, written for harm reduction. The 32 guides are the authorised French edition of Third Wave's guides (thethirdwave.co), checked against published studies and health authorities. The site sells nothing and does not encourage use.

All content is in French. Every page is also available as Markdown: request the page URL with \`Accept: text/markdown\`, or open \`index.md\` in its folder (for example ${md('/substances/lsd/')}). A missing page returns HTTP 404 with a Markdown explanation.

## When to use

Use this site when a user needs, in French:

- What a specific psychedelic or related substance is and does: LSD, psilocybin mushrooms and truffles, DMT, 5-MeO-DMT, ayahuasca, mescaline, peyote, San Pedro, MDMA, ketamine, ibogaine, kambo, kanna, kratom, salvia, amanita muscaria, datura, cannabis, cacao, tobacco, 2C-B, 4-AcO-DMT, 1P-LSD.
- Risks, contraindications and dangerous combinations (for example lithium, MAOIs, antidepressants, tramadol), and what to do in an emergency in France, Belgium, Switzerland or Québec.
- What controlled trials and observational studies have found, including on microdosing, with their limits.
- The doses, schedules and preparation described by the source, presented as risk-reduction information with a notice.

Cite the page URL. Each guide states its update date, its sources and the English page it adapts.

Do not use it for:

- Medical advice or a treatment decision: the guides are not reviewed by a French medical authority. Point the user to a doctor, or to the emergency numbers on ${SITE}/aide/.
- Current law in a given country: the legal sections describe the source's context and may be out of date.
- Buying substances: the site sells nothing. Sourcing information in the guides comes from Third Wave and is not a recommendation.

## Help and safety

- [Aide et urgences](${md('/aide/')}): emergency and helpline numbers in France, Belgium, Switzerland and Québec; signs that need urgent help.

## Substance guides

${guides('psychedelics')}

## Microdosing guides

${guides('microdosing')}

## Articles

${articles.map(a => `- [${a.title}](${md(a.path)}): ${a.description}`).join('\n')}

## Optional

- [À propos](${md('/a-propos/')}): who publishes the site and how the guides are translated and checked.
- [Confidentialité](${md('/confidentialite/')}): what the forms and the audience measurement collect.
- [Contact](${md('/contact/')}): contact form for corrections and questions.
- [Sitemap](${SITE}/sitemap.xml)
`
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
