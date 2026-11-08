import manifest from './pages/manifest.json' with { type: 'json' }
import catalogueData from './guides/catalog.json' with { type: 'json' }

export type ListingCategory = 'psychedelics' | 'microdosing'
type CatalogueEntry = { name: string; slug: string; description: string; image?: string }
const publishedPaths = new Set([...manifest.pages.map(page => page.path), ...catalogueData.filter(guide => !guide.hub).map(guide => guide.path)])
const catalogue: Record<ListingCategory, CatalogueEntry[]> = {
  psychedelics: [
    { name: 'LSD', slug: 'lsd', description: 'Histoire, effets et recherche autour du diéthylamide de l’acide lysergique.', image: '/assets/uploads/2020/08/microdosing-lsd.svg' },
    { name: 'Champignons à psilocybine', slug: 'champignons-psilocybin', description: 'Les champignons, leur histoire et la recherche sur la psilocybine.', image: '/assets/uploads/2020/08/psilocybin-mushrooms.svg' },
    { name: 'DMT', slug: 'dmt', description: 'Comprendre la diméthyltryptamine et les expériences qui lui sont associées.', image: '/assets/uploads/2020/09/dmt.svg' },
    { name: 'Ayahuasca', slug: 'ayahuasca', description: 'Traditions amazoniennes, contexte culturel et recherche contemporaine.', image: '/assets/uploads/2020/09/ayahuasca.svg' },
    { name: '2C-B', slug: '2c-b', description: 'Phénéthylamine de synthèse' },
    { name: '4-AcO-DMT', slug: '4-aco-dmt', description: 'Tryptamine de synthèse' },
    { name: '5-MeO-DMT', slug: '5-meo-dmt', description: 'Tryptamine' },
    { name: 'Amanite tue-mouches', slug: 'amanita-muscaria', description: 'Champignon contenant du muscimol' },
    { name: 'Cacao', slug: 'cacao', description: 'Plante et traditions culturelles' },
    { name: 'Cannabis', slug: 'cannabis', description: 'Plante et cannabinoïdes' },
    { name: 'Datura', slug: 'datura', description: 'Plante toxique aux effets délirants' },
    { name: 'Ibogaïne', slug: 'ibogaine', description: 'Alcaloïde de l’iboga' },
    { name: 'Kambô', slug: 'kambo', description: 'Sécrétion animale et pratiques traditionnelles' },
    { name: 'Kanna', slug: 'kanna', description: 'Plante d’Afrique australe' },
    { name: 'Kétamine', slug: 'ketamine', description: 'Substance dissociative' },
    { name: 'Kratom', slug: 'kratom', description: 'Plante d’Asie du Sud-Est' },
    { name: 'MDMA', slug: 'mdma', description: 'Substance entactogène' },
    { name: 'Mescaline', slug: 'mescaline', description: 'Alcaloïde présent dans certains cactus' },
    { name: 'Peyotl', slug: 'peyote', description: 'Cactus à mescaline' },
    { name: 'Salvia divinorum', slug: 'salvia', description: 'Plante contenant de la salvinorine A' },
    { name: 'San Pedro', slug: 'san-pedro', description: 'Cactus à mescaline' },
    { name: 'Tabac', slug: 'tabac', description: 'Plante, nicotine et traditions' },
  ],
  microdosing: [
    { name: 'LSD', slug: 'lsd', description: 'Les repères et les questions de recherche sur le microdosage du LSD.', image: '/assets/uploads/2020/08/microdosing-lsd.svg' },
    { name: 'Champignons à psilocybine', slug: 'champignons-psilocybin', description: 'Comprendre le microdosage de la psilocybine et ses incertitudes.', image: '/assets/uploads/2020/08/psilocybin-mushrooms.svg' },
    { name: 'DMT', slug: 'dmt', description: 'Un sujet encore peu documenté par la recherche clinique.', image: '/assets/uploads/2020/09/dmt.svg' },
    { name: '1P-LSD', slug: '1p-lsd', description: 'Les particularités de cet analogue du LSD.', image: '/assets/uploads/2020/08/1p-lsd.svg' },
    { name: '4-AcO-DMT', slug: '4-aco-dmt', description: 'Tryptamine de synthèse' },
    { name: 'Ayahuasca', slug: 'ayahuasca', description: 'Préparation traditionnelle amazonienne' },
    { name: 'Cannabis', slug: 'cannabis', description: 'Cannabinoïdes' },
    { name: 'Ibogaïne', slug: 'ibogaine', description: 'Alcaloïde de l’iboga' },
    { name: 'Mescaline', slug: 'mescaline', description: 'Alcaloïde de certains cactus' },
    { name: 'Truffes à psilocybine', slug: 'truffes-psilocybine', description: 'Sclérotes contenant de la psilocybine' },
  ],
}

export const listingGuides = (category: ListingCategory) => catalogue[category].map(entry => {
  const path = `/${category === 'psychedelics' ? 'substances' : 'microdosing'}/${entry.slug}/`
  return { ...entry, path, available: publishedPaths.has(path) }
})

export const listingSections: Record<ListingCategory, { id: string; title: string; html: string }[]> = {
  psychedelics: [
    { id: 'comprendre', title: 'Qu’est-ce qu’un psychédélique ?', html: '<p>Les psychédéliques sont des substances psychoactives qui peuvent modifier la perception, les pensées, les émotions et la façon de vivre une expérience. Le LSD, la psilocybine, la mescaline et la DMT sont souvent regroupés sous le terme de psychédéliques « classiques » : leur action implique notamment le récepteur sérotoninergique 5-HT2A.</p><p>Les guides de Third Wave abordent aussi des substances aux mécanismes différents, comme la kétamine ou la MDMA, ainsi que des plantes et pratiques traditionnelles. Leur présence dans ce catalogue ne signifie pas qu’elles appartiennent toutes à la même famille pharmacologique, ni qu’elles présentent les mêmes effets ou les mêmes risques.</p>' },
    { id: 'origines', title: 'Plantes, champignons et molécules', html: '<p>Certains psychédéliques sont présents dans la nature : la psilocybine dans des champignons, la mescaline dans certains cactus, ou la DMT dans plusieurs plantes. D’autres molécules ont été développées ou étudiées en laboratoire.</p><p>L’origine d’une substance ne renseigne pas sur sa sécurité. Pour comprendre une substance, il faut aussi considérer sa pharmacologie, le contexte culturel qui l’entoure et les données disponibles.</p>' },
    { id: 'usages', title: 'Des traditions à la recherche contemporaine', html: '<p>Les usages religieux et spirituels de certaines plantes s’inscrivent dans des histoires culturelles anciennes. Ils coexistent aujourd’hui avec des usages récréatifs, des démarches personnelles et des recherches médicales.</p><p>Les essais cliniques étudient des substances précises, auprès de participants sélectionnés et dans des conditions encadrées. Leurs résultats ne se transposent pas automatiquement à une autre substance, à une pratique autonome ou au microdosage. Le <a href="https://www.nccih.nih.gov/health/psilocybin-for-mental-health-and-addiction-what-you-need-to-know">NCCIH fait le point sur la psilocybine</a>, les résultats disponibles et leurs limites.</p>' },
    { id: 'effets', title: 'Effets et expériences : une grande variabilité', html: '<p>Les effets rapportés peuvent être sensoriels, émotionnels ou cognitifs : modification de la perception du temps, des couleurs, des sensations, ou du rapport à soi. Une expérience peut aussi être marquée par de la peur, de la confusion ou une détresse intense.</p><p>La substance n’explique pas tout. L’état psychologique, les attentes, l’environnement et l’état de santé peuvent influencer l’expérience. Nos guides permettent d’examiner ces questions substance par substance.</p>' },
    { id: 'risques', title: 'Quels risques faut-il comprendre ?', html: '<p>Les risques varient fortement d’une substance à l’autre. Les interactions avec des médicaments, les antécédents médicaux et psychiatriques, ainsi que la composition réelle d’un produit méritent une attention particulière. Une faible quantité ou une origine naturelle ne garantit pas l’absence de risque.</p><p>À titre d’exemple, le NCCIH rapporte pour la psilocybine des effets indésirables possibles, notamment anxiété, nausées et augmentation de la pression artérielle. Ces informations servent à comprendre la recherche ; elles ne remplacent pas un avis médical individuel.</p>' },
    { id: 'legalite', title: 'La légalité dépend du contexte', html: '<p>Le statut juridique dépend de la substance, du pays et de l’usage concerné. Recherche médicale, prescription, possession et pratiques traditionnelles peuvent relever de cadres distincts. Une autorisation dans un contexte précis ne vaut pas autorisation générale.</p><p>Les guides donnent des repères. Pour une question juridique concrète, consultez les textes officiels applicables dans votre pays et leur date de mise à jour.</p>' },
  ],
  microdosing: [
    { id: 'comprendre', title: 'Qu’est-ce que le microdosage ?', html: '<p>Le microdosage désigne l’usage de faibles quantités d’une substance psychédélique, généralement dans l’intention d’éviter une expérience hallucinatoire marquée. Les témoignages évoquent notamment l’humeur, la concentration, la créativité ou le bien-être.</p><p>Ces intentions et ces témoignages ne constituent pas, à eux seuls, une preuve d’efficacité. Le terme « subperceptible », souvent employé à propos du microdosage, désigne un effet non ressenti, mais elle ne garantit ni l’absence d’effet mesurable, ni l’absence de risque.</p>' },
    { id: 'histoire', title: 'Comment le microdosage s’est-il popularisé ?', html: '<p>La pratique contemporaine a notamment été popularisée par le psychologue James Fadiman et son livre <em>The Psychedelic Explorer’s Guide</em>, publié en 2011. Des témoignages, des communautés en ligne et les travaux du mycologue Paul Stamets ont ensuite contribué à sa diffusion.</p><p>Les références à des usages anciens de faibles quantités de plantes ou de champignons demandent davantage de prudence : les pratiques culturelles historiques ne correspondent pas nécessairement aux protocoles contemporains.</p>' },
    { id: 'recherche', title: 'Que dit la recherche ?', html: '<p>Il faut distinguer les récits personnels, les études d’observation et les essais contrôlés contre placebo. Les attentes des participants, la difficulté à maintenir l’aveugle et les différences entre les produits compliquent l’interprétation des résultats.</p><p>Le <a href="https://www.nccih.nih.gov/health/psilocybin-for-mental-health-and-addiction-what-you-need-to-know">NCCIH indique que la sécurité et l’efficacité du microdosage de psilocybine ne sont pas établies</a>. Les résultats obtenus dans des thérapies assistées par des psychédéliques ne démontrent pas automatiquement l’efficacité du microdosage.</p><p>Les bénéfices rapportés restent donc des questions de recherche. Pour évaluer une étude, regardez la substance étudiée, la population, la présence d’un groupe placebo, les effets indésirables et la durée du suivi.</p>' },
    { id: 'effets', title: 'Bénéfices rapportés et effets indésirables', html: '<p>Des personnes décrivent des changements d’humeur, d’énergie ou d’attention. D’autres ne constatent pas d’amélioration, ou rapportent des effets désagréables. Ces expériences individuelles ne permettent pas de prédire ce qui se produira pour une autre personne.</p><p>Le NCCIH mentionne notamment, pour le microdosage de psilocybine, de l’insomnie, une augmentation de l’anxiété, des troubles digestifs et des difficultés de concentration. Les effets d’un usage répété à long terme restent insuffisamment connus.</p>' },
    { id: 'legalite', title: 'Microdosage et cadre légal', html: '<p>Le terme « microdosage » ne crée pas de statut juridique particulier. Les règles applicables dépendent de la substance, du pays et du contexte. Un produit présenté comme naturel, un analogue de laboratoire ou une pratique décrite sur Internet n’est pas nécessairement autorisé.</p><p>Les références de ces guides sont destinées à l’information. Elles ne constituent ni une prescription, ni un protocole de traitement, ni une recommandation de modifier un traitement en cours.</p>' },
  ],
}

export const protocols = [
  { name: 'Approche Fadiman', label: 'Observation et suivi', text: 'Popularisée par James Fadiman, cette approche met l’accent sur l’observation des effets ressentis et leur comparaison avec des périodes sans prise. Elle est largement citée dans les communautés de microdosage.', note: 'Une pratique communautaire n’est pas un traitement validé.' },
  { name: 'Approche Stamets', label: 'Hypothèse d’association', text: 'Paul Stamets a proposé une association de psilocybine, de crinière de lion et de niacine. Cette proposition a contribué au débat sur le microdosage et les champignons.', note: 'La supériorité et la sécurité de cette association ne sont pas établies.' },
  { name: 'Protocoles de recherche', label: 'Études cliniques', text: 'Dans un essai, le protocole définit la sélection des participants, le suivi, les critères d’évaluation et la surveillance des effets indésirables. Il répond à une question scientifique précise.', note: 'Un protocole d’étude ne se transpose pas à l’automédication.' },
]

const metadata = {
  '/substances/': {
    category: 'psychedelics' as const,
    title: 'Psychédéliques : guides des substances et molécules | La Troisième Vague',
    description: 'Consultez les guides en français sur le LSD, la psilocybine, la DMT et l’ayahuasca : histoire, effets, recherche et risques des substances psychédéliques.',
    heading: 'Les psychédéliques',
    eyebrow: 'Comprendre les substances',
    introduction: 'Des molécules aux traditions, un point de départ pour comprendre les psychédéliques, leurs effets et les questions que pose la recherche.',
    sourceUrl: 'https://thethirdwave.co/psychedelics/',
  },
  '/microdosing/': {
    category: 'microdosing' as const,
    title: 'Microdosing : guides, protocoles et recherche | La Troisième Vague',
    description: 'Comprendre le microdosage en français : guides par substance, approches Fadiman et Stamets, recherche, bénéfices rapportés et risques du microdosage.',
    heading: 'Le microdosage',
    eyebrow: 'Comprendre le microdosage',
    introduction: 'Substances, protocoles et recherche : les repères pour distinguer les témoignages, les hypothèses et les connaissances disponibles.',
    sourceUrl: 'https://thethirdwave.co/microdosing/',
  },
}

export const listingPages = Object.fromEntries(Object.entries(metadata).map(([path, page]) => [path, {
  ...page, path,
  searchText: [page.heading, page.introduction, ...listingSections[page.category].flatMap(section => [section.title, section.html.replace(/<[^>]+>/g, ' ')]), ...catalogue[page.category].flatMap(guide => [guide.name, guide.description]), ...(page.category === 'microdosing' ? protocols.flatMap(protocol => [protocol.name, protocol.text, protocol.note]) : [])].join(' ').replace(/\s+/g, ' ').trim(),
}])) as Record<keyof typeof metadata, (typeof metadata)[keyof typeof metadata] & { path: string; searchText: string }>
