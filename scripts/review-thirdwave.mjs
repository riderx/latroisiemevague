import { readFile, writeFile } from 'node:fs/promises'
import { load } from 'cheerio'
const cache = '.wordpress-import/thirdwave'
const inventory = JSON.parse(await readFile(`${cache}/inventory.json`, 'utf8')).filter(entry => !entry.hub)
const corrections = {}, audit = []
const psilo = 'https://www.nccih.nih.gov/health/psilocybin-for-mental-health-and-addiction-what-you-need-to-know'
const lsdStudy = 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11923771/'
const fdaMdma = 'https://download.open.fda.gov/crl/CRL_NDA215455_20240808.pdf'
const safety = `La faible quantité ne suffit pas à établir la sécurité, et il n’est pas possible de garantir l’absence d’effet perceptible ou d’expérience difficile. La tolérance, les interactions et les effets à long terme doivent être distingués. Le <a href="${psilo}">NCCIH rappelle les incertitudes et les effets indésirables possibles du microdosage de psilocybine</a> ; cela ne valide pas les autres substances.`
for (const entry of inventory) {
  const source = JSON.parse(await readFile(`${cache}/${entry.id}.json`, 'utf8'))
  const replacements = []
  let omittedLevel = 0
  for (const [index, block] of source.blocks.entries()) {
    const level = /^h[2-6]$/.test(block.tag) ? Number(block.tag[1]) : 0
    if (level && omittedLevel && level <= omittedLevel) omittedLevel = 0
    if (level && /what schedule should|when should|how often|what time|how much|^want to.*grow|start growing/i.test(block.text)) {
      omittedLevel = level
      replacements.push({ index, reason: 'Exclude practical schedules and promotional growing sections.', html: '<p class="guide-editorial-update">Les instructions pratiques et les offres commerciales de cette section ne sont pas reproduites dans cette édition documentaire.</p>' })
      continue
    }
    if (omittedLevel) { replacements.push({ index, reason: 'Part of an excluded practical or commercial section.', html: '' }); continue }
    if (block.tag !== 'p') continue
    const text = block.text
    let html, reason
    if (/Psychedelic Directory|To find legal iboga retreat|our in.depth guide and step.by.step|Start Growing Mushrooms Today/i.test(text)) {
      replacements.push({ index, reason: 'Exclude commercial directory or growing promotion.', html: '' }); continue
    } else if (entry.slug === 'ibogaine' && /none of these deaths could be attributed/i.test(text)) {
      html = 'La revue historique rapporte 19 décès survenus après une prise d’ibogaïne entre 1990 et 2008. La présence de maladies préexistantes ou d’autres substances ne permet pas d’exclure la toxicité propre de l’ibogaïne : des troubles du rythme cardiaque potentiellement mortels sont documentés. <a href="https://pubmed.ncbi.nlm.nih.gov/38182784/">Contexte et limites de la recherche clinique</a>.'
      reason = 'Correct the unsupported exclusion of ibogaine toxicity in reported deaths.'
    } else if (entry.slug === 'amanita-muscaria' && /prepared properly|prepare them correctly|appropriately prepared|minimum dose|Fly agaric can be taken at various doses/i.test(text)) {
      html = 'La composition des amanites varie et leur consommation peut provoquer une intoxication. Les usages traditionnels et les méthodes de préparation décrites dans certaines sources ne permettent pas de garantir leur innocuité. En décembre 2024, la FDA a conclu que l’amanite tue-mouches et certains de ses constituants ne satisfaisaient pas aux critères de sécurité pour un usage alimentaire. <a href="https://www.fda.gov/food/hfp-constituent-updates/fda-alerts-industry-and-consumers-about-use-amanita-muscaria-or-its-constituents-food">Évaluation de la FDA</a>.'
      reason = 'Replace preparation and dosage assurances with the dated food-safety assessment.'
    } else if (/safest substances you can find|no (?:known )?negative long.term side effects|no (?:known )?long.term,? negative side effects/i.test(text)) {
      html = 'Les classements comparatifs des dommages n’établissent pas la sécurité d’un usage individuel. Les effets psychologiques, les interactions, les accidents et les incertitudes à long terme doivent être considérés ; un risque comparativement moindre sur un critère ne signifie pas une absence de risque.'
      reason = 'Remove categorical individual safety claims inferred from comparative harm rankings.'
    } else if (/legally viable alternative|main legal alternative is to purchase|reputation of vendors before making a purchase|probably legal to buy and possess/i.test(text)) {
      html = 'La dénomination « substance de recherche » ou « analogue » ne garantit ni la légalité, ni la composition, ni la sécurité d’un produit. Les règles applicables doivent être vérifiées auprès des sources officielles du pays concerné.'
      reason = 'Remove outdated legal sourcing recommendations and product assurances.'
    } else if (/There are no clinical research studies on microdosing in humans/i.test(text)) {
      html = `Des essais contrôlés chez l’être humain ont depuis été publiés. Leurs résultats ne justifient pas de présenter le microdosage comme un traitement établi : <a href="${lsdStudy}">essai sur le LSD de 2025</a> et <a href="https://pubmed.ncbi.nlm.nih.gov/41110634/">essais sur la psilocybine publiés en 2025–2026</a>.`
      reason = 'Update an obsolete absence-of-human-research statement.'
    } else if (/Obviously if you.ve extracted the mescaline yourself/i.test(text)) {
      html = 'L’apparence d’un produit et les déclarations sur sa provenance ne permettent pas de garantir son identité, sa composition ou sa sécurité.'
      reason = 'Remove a purity assurance and an affiliate link.'
    } else if (entry.slug === 'ketamine' && /Last year.*FDA|recently been hailed as a breakthrough/i.test(text)) {
      html = 'La kétamine est un anesthésique dissociatif. Il faut distinguer cette substance des indications réglementaires de l’eskétamine, l’un de ses énantiomères : dans l’Union européenne, le médicament Spravato est autorisé pour certaines situations de dépression, selon des conditions précises et sous supervision médicale. <a href="https://www.ema.europa.eu/en/medicines/human/EPAR/spravato">Informations de l’EMA</a>.'
      reason = 'Clarify ketamine versus esketamine and remove an obsolete relative approval date.'
    } else if (entry.slug === '5-meo-dmt' && /milky white venom|alternative sources of 5-MeO/i.test(text)) {
      html = 'La 5-MeO-DMT est aussi présente dans les sécrétions du crapaud Incilius alvarius, également connu sous le nom de Bufo alvarius, originaire du sud-ouest des États-Unis et du nord du Mexique. Leur collecte soulève des questions de protection animale et de conservation. Cette origine naturelle ne constitue pas une garantie de sécurité.'
      reason = 'Retain the ecological context without recommending sourcing alternatives.'
    } else if (/clinical research has proven that microdosing LSD is not a placebo/i.test(text)) {
      html = `L’existence d’effets aigus ne démontre pas un bénéfice thérapeutique supérieur au placebo. En 2025, un essai randomisé chez 53 adultes présentant un TDAH n’a pas montré d’avantage du LSD à faibles quantités sur le critère principal par rapport au placebo. <a href="${lsdStudy}">Étude originale</a>.`
      reason = 'Replace an unsupported general conclusion with the indication-specific randomized result.'
    } else if (/no risk of having a|microdosing (?:appears|is proving|tends)|microdosing is a safe way|microdosing.*safe, (?:non-threatening|measurable)|mescaline is very safe|known to be non-toxic even at very high|first-ever controlled.*more effective than a placebo|Given the tremendous safety/i.test(text)) {
      html = safety; reason = 'Remove categorical claims of safety or effectiveness.'
    } else if (/no clinical research on the safety of microdosing/i.test(text)) {
      html = `Des études contrôlées existent, mais leur durée, leurs populations et les substances étudiées limitent les conclusions. La sécurité d’un usage répété à long terme ne peut pas être déduite de ces seuls essais. <a href="${lsdStudy}">Exemple d’essai contrôlé sur le LSD</a> et <a href="${psilo}">état des connaissances sur la psilocybine</a>.`
      reason = 'Update the obsolete claim that no clinical research exists.'
    } else if (/safe to ingest in conjunction with an ayahuasca/i.test(text)) {
      html = 'Il n’est pas possible d’affirmer qu’une association de cannabis et d’ayahuasca est sûre. Les interactions et les effets sont variables ; les témoignages de consommation combinée ne constituent pas une étude de sécurité.'
      reason = 'Remove an unsupported assurance about a drug combination.'
    } else if (entry.slug === 'ketamine' && /no risk of physical addiction/i.test(text)) {
      html = 'Une dépendance physique a été rapportée avec un usage prolongé de kétamine. La possibilité d’un usage médical encadré ne signifie pas une absence de risque de dépendance. <a href="https://www.accessdata.fda.gov/drugsatfda_docs/label/2019/211243lbl.pdf">Notice officielle publiée par la FDA, section 9.3</a>.'
      reason = 'Correct denial of physical dependence.'
    } else if (entry.slug === 'mdma' && /as early as 2022/i.test(text)) {
      html = `Les recherches sur la MDMA associée à une psychothérapie ont conduit à des essais de phase III. La prévision d’une commercialisation dès 2022 est dépassée : la FDA a émis une réponse négative à la demande soumise le 8 août 2024, en précisant les insuffisances à résoudre. Ce document ne préjuge pas d’une décision future. <a href="${fdaMdma}">Décision et motifs de la FDA</a>.`
      reason = 'Replace an expired approval prediction with the dated regulatory decision.'
    } else if (/There appears to be no risk of a criminal penalty/i.test(text)) {
      html = 'La source anglaise mentionne les juridictions suivantes dans sa discussion de la dépénalisation. Cette liste constitue un contexte documentaire, et non une vérification du droit actuellement applicable : elle ne doit pas être interprétée comme une autorisation de possession ou d’usage.'
      reason = 'Avoid presenting a historical jurisdiction list as current legal permission.'
    } else if (/by far the most tried and tested|volumetric method|(?:you can|you should|we recommend|start with).{0,100}\b\d+(?:\.\d+)?\s?(?:mg|μg|ug|mcg|grams|micrograms)\b|(?:dissolv|submerg).{0,80}(?:blotter|tab|water)/i.test(text)) {
      html = 'Le passage pratique de la source n’est pas reproduit dans cette édition. Les voies d’exposition, la composition des produits et les interactions modifient les risques ; ce guide ne fournit pas de mode d’administration.'
      reason = 'Replace operational administration directions with a non-procedural note.'
    } else if (/At Third Wave, we provide.*safely using microdosing/i.test(text)) {
      html = 'Les témoignages de bénéfices ne remplacent pas une évaluation clinique. Les données et leurs limites doivent être examinées pour chaque indication et chaque substance.'
      reason = 'Remove a commercial safety assurance.'
    }
    if (html) replacements.push({ index, reason, html: `<p class="guide-editorial-update"><strong>Note de l’édition française.</strong> ${html}</p>` })
  }
  corrections[entry.id] = { sourceHash: entry.contentHash, replacements }
  const $ = load(source.blocks.map(block => block.html).join('\n'))
  const replacementMap = new Map(replacements.map(item => [item.index, item.html]))
  const published = load(source.blocks.map((block, index) => replacementMap.get(index) ?? block.html).join('\n'))
  audit.push({ id: entry.id, path: entry.path, sourceUrl: entry.sourceUrl, contentHash: entry.contentHash, sourceBlockCount: source.blocks.length, sourceWords: entry.sourceWords, headingIds: published('h2[id]').map((_, el) => published(el).attr('id')).get(), sourceLinkCount: $('a[href]').length, publishedLinkCount: published('a[href]').length, editorialCorrections: replacements.length })
}
await writeFile('src/content-data/guide-corrections.json', JSON.stringify(corrections, null, 2) + '\n')
await writeFile('src/content-data/guide-source-audit.json', JSON.stringify(audit, null, 2) + '\n')
console.log(`Reviewed ${audit.length} guides; ${audit.reduce((sum, item) => sum + item.editorialCorrections, 0)} explicit editorial corrections.`)
