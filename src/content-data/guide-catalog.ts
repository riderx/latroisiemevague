import catalogue from './guides/catalog.json' with { type: 'json' }
export type GuideEntry = (typeof catalogue)[number]
export const guideCatalog = catalogue.filter(entry => !entry.hub)
export const guidePaths = new Set(guideCatalog.map(entry => entry.path))
export const allGuideSources = catalogue
export const guideHeading = (entry: GuideEntry) => `${entry.category === 'microdosing' ? 'Microdosage : ' : ''}${entry.name}`
export const guideTitle = (entry: GuideEntry) => `${entry.name} : ${entry.category === 'microdosing' ? 'microdosage, recherche et risques' : 'effets, risques et recherche'} | La Troisième Vague`
export const guideDescription = (entry: GuideEntry) => entry.category === 'microdosing'
  ? `Microdosage et ${entry.name} : histoire, effets rapportés, recherche, limites et risques. Guide adapté de Third Wave, avec ses références.`
  : `${entry.name} : histoire, pharmacologie, effets, recherche et risques. Consultez le guide en français adapté de Third Wave et ses références.`
