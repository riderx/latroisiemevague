import manifest from '../content-data/pages/manifest.json' with { type: 'json' }
import { guideCatalog, guidePaths, guideTitle, guideDescription } from '../content-data/guide-catalog'
export type Page = (typeof manifest.pages)[number] & { bodyClass?: string }
const bodies = import.meta.glob('../content-data/pages/*.html', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
export const pages: Page[] = [
  ...manifest.pages.filter(page => !guidePaths.has(page.path)),
  ...guideCatalog.map(guide => ({ id: guide.id, path: guide.path, title: guideTitle(guide), description: guideDescription(guide), bodyClass: '', sourceContentHashes: [] })),
]
export const bodyFor = (page: Page) => bodies[`../content-data/pages/${page.id}.html`]
export const headFor = (page: Page) => bodies[`../content-data/pages/${page.id}.head.html`]
