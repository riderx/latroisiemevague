import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { listingPages } from '../../src/content-data/listings'
import { guideCatalog, guideTitle } from '../../src/content-data/guide-catalog'
const manifest = JSON.parse(readFileSync('src/content-data/pages/manifest.json', 'utf8'))

test('all migrated pages render with local assets and no browser errors', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`) })
  const routes = [...manifest.pages, ...guideCatalog.filter(guide => !manifest.pages.some((page: { path: string }) => page.path === guide.path))]
  for (const route of routes) {
    await page.goto(route.path)
    const guide = guideCatalog.find(guide => guide.path === route.path)
    await expect(page).toHaveTitle(guide ? guideTitle(guide) : listingPages[route.path as keyof typeof listingPages]?.title ?? route.title)
    await expect(page.locator('main')).toBeVisible()
  }
  expect(errors).toEqual([])
})
test('blog loads every article and retains real pagination links', async ({ page }) => {
  await page.goto('/blog/')
  await expect(page.locator('.raven-post-item')).toHaveCount(4)
  await page.locator('.raven-load-more-button').click()
  await expect(page.locator('.raven-post-item')).toHaveCount(8)
  await page.locator('.raven-load-more-button').click()
  await expect(page.locator('.raven-post-item')).toHaveCount(12)
  await page.locator('.raven-load-more-button').click()
  await expect(page.locator('.raven-post-item')).toHaveCount(15)
  await expect(page.locator('.raven-load-more-button')).toHaveCount(0)
  await page.goto('/blog/page/4/')
  await expect(page.locator('.raven-post-item')).toHaveCount(3)
})
test('mobile navigation and content fit the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.locator('.raven-nav-menu-toggle-button').click()
  await expect(page.locator('.raven-nav-menu-mobile')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('.raven-nav-menu-toggle-button')).toHaveAttribute('aria-expanded', 'false')
  await page.screenshot({ path: 'output/home-mobile.png', fullPage: true })
  for (const route of ['/contact/', '/microdosing/lsd/', '/substances/', '/blog/']) {
    await page.goto(route)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391)
  }
  await page.locator('.jupiterx-navbar-toggler').click()
  await expect(page.locator('#jupiterxSiteNavbar')).toBeVisible()
})
test('search finds article content and renders query as text', async ({ page }) => {
  await page.goto('/recherche/?s=cerveau')
  await expect(page.locator('.search-results article').first()).toBeVisible()
  await expect(page.locator('.search-results')).toContainText('mécanismes de contrôle')
})
test('contact form reports success and preserves input on failure', async ({ page }) => {
  await page.goto('/contact/')
  await page.locator('[name=your-name]').fill('Test')
  await page.locator('[name=your-email]').fill('person@example.org')
  await page.locator('[name=your-subject]').fill('Question')
  await page.locator('[name=your-message]').fill('Bonjour')
  await page.route('**/api/forms', route => route.fulfill({ status: 503, json: { message: 'Veuillez réessayer.' } }))
  await page.locator('input[type=submit]').click()
  await expect(page.locator('.form-status')).toHaveText('Veuillez réessayer.')
  await expect(page.locator('[name=your-message]')).toHaveValue('Bonjour')
  await page.route('**/api/forms', route => route.fulfill({ json: { message: 'Merci !' } }))
  await page.locator('input[type=submit]').click()
  await expect(page.locator('.form-status')).toHaveText('Merci !')
  await expect(page.locator('[name=your-message]')).toHaveValue('')
})
test('homepage and guide screenshots', async ({ page }) => {
  await page.goto('/')
  expect(await page.locator('main').evaluate(el => [...el.querySelectorAll('*')].map(node => getComputedStyle(node).backgroundImage).join(' '))).not.toContain('hero-walking')
  await page.screenshot({ path: 'output/home-desktop.png', fullPage: true })
  await page.goto('/microdosing/lsd/')
  await page.screenshot({ path: 'output/guide-desktop.png', fullPage: true })
})

test('French listing hubs expose published guides and fit desktop and mobile screens', async ({ page }) => {
  for (const [path, slugs] of [
    ['/substances/', ['lsd', 'champignons-psilocybin', 'dmt', 'ayahuasca']],
    ['/microdosing/', ['lsd', 'champignons-psilocybin', 'dmt', '1p-lsd']],
  ] as const) {
    await page.goto(path)
    await expect(page.locator('main h1')).toHaveCount(1)
    await expect(page.locator('dialog, [role="dialog"]')).toHaveCount(0)
    await expect(page.locator('.listing-card')).toHaveCount(path === '/substances/' ? 22 : 10)
    await expect(page.locator('.listing-status')).toHaveCount(0)
    await expect(page.locator('.listing-upcoming-grid a')).toHaveCount(0)
    for (const slug of slugs) await expect(page.locator(`main a[href="${path}${slug}/"]`).first()).toBeVisible()
    await page.screenshot({ path: `output/${path.slice(1, -1)}-listing-desktop.png`, fullPage: true })
    await page.setViewportSize({ width: 390, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391)
    for (const slug of slugs) await expect(page.locator(`main a[href="${path}${slug}/"]`).first()).toBeVisible()
    await page.screenshot({ path: `output/${path.slice(1, -1)}-listing-mobile.png`, fullPage: true })
    await page.screenshot({ path: `output/${path.slice(1, -1)}-listing-mobile-viewport.png` })
    const menu = page.locator('.listing-megamenu')
    await menu.locator('summary').click()
    await expect(menu.locator('.listing-megamenu-panel')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391)
    await page.keyboard.press('Escape')
    await expect(menu).not.toHaveAttribute('open')
    await expect(menu.locator('summary')).toBeFocused()
    await page.setViewportSize({ width: 320, height: 740 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321)
    await page.setViewportSize({ width: 1440, height: 1000 })
  }
  await page.goto('/microdosing/#protocoles')
  await expect(page.locator('#protocoles')).toContainText('Approche Fadiman')
  await expect(page.locator('#protocoles')).toContainText('Approche Stamets')
  await page.goto('/recherche/?s=Fadiman')
  await expect(page.locator('.search-results a[href="/microdosing/"]')).toBeVisible()
})

test('new guide references, related pages, search and mobile menu work', async ({ page }) => {
  await page.goto('/substances/4-aco-dmt/')
  await expect(page.locator('.guide-translated-content')).toContainText('Présentation')
  await page.locator('.guide-toc a[href="#footnotes"]').click()
  await expect(page).toHaveURL(/#footnotes$/)
  await expect(page.locator('#footnotes')).toHaveText('Références')
  await expect(page.locator('.guide-toc summary')).toBeInViewport()
  await expect(page.locator('.guide-related-grid a')).toHaveCount(4)
  for (const path of ['/substances/champignons-psilocybin/', '/substances/ibogaine/', '/microdosing/truffes-psilocybine/']) {
    await page.goto(path)
    await page.setViewportSize({ width: 320, height: 740 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321)
  }
  const menu = page.locator('.listing-megamenu')
  await menu.locator('summary').click()
  await menu.locator('a[href="/substances/tabac/"]').click()
  await expect(page).toHaveURL('/substances/tabac/')
  await page.goto('/recherche/?s=ibogaïne')
  await expect(page.locator('.search-results a[href="/substances/ibogaine/"]')).toBeVisible()
  await page.goto('/substances/lsd/')
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.screenshot({ path: 'output/new-guide-desktop-viewport.png' })
  await page.screenshot({ path: 'output/new-guide-desktop.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: 'output/new-guide-mobile.png' })
})
