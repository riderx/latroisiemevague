import manifest from '../content-data/pages/manifest.json' with { type: 'json' }
export type Page = (typeof manifest.pages)[number] & { bodyClass?: string }
const bodies = import.meta.glob('../content-data/pages/*.html', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
export const pages: Page[] = manifest.pages
export const bodyFor = (page: Page) => bodies[`../content-data/pages/${page.id}.html`]
export const headFor = (page: Page) => bodies[`../content-data/pages/${page.id}.head.html`]
