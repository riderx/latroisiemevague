import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { guideCatalog } from '../../src/content-data/guide-catalog'

const ORIGIN = 'https://latroisiemevague.com'
const sitemapRoutes = [...readFileSync('dist/sitemap.xml', 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1].slice(ORIGIN.length))
const routes = [...sitemapRoutes, '/recherche/', '/404.html']
const guidePaths = new Set(guideCatalog.map(guide => guide.path))
const ARTICLE = '/comment-les-psychedeliques-liberent-les-mecanismes-de-controle-de-votre-cerveau/'

// The analytics script is third-party; serve an empty one so tests stay offline and deterministic.
test.beforeEach(async ({ page }) => {
  await page.route('https://datafa.st/**', route => route.fulfill({ contentType: 'text/javascript', body: '' }))
})

const pageWidth = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth)

test('every route renders without page errors or failed responses', async ({ page }) => {
  expect(routes.length).toBeGreaterThan(50)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(`${page.url()}: ${error.message}`))
  page.on('response', response => { if (response.status() >= 400 && !response.url().endsWith('/404.html')) errors.push(`${response.status()} ${response.url()}`) })
  for (const route of routes) {
    await page.goto(route)
    await expect(page.locator('main h1'), route).toHaveCount(1)
    await expect(page.locator('.site-header'), route).toBeVisible()
    await expect(page.locator('.site-footer'), route).toBeVisible()
    if (guidePaths.has(route)) {
      const img = page.locator('.guide-illustration img')
      await expect(img, route).toHaveJSProperty('complete', true)
      expect(await img.evaluate(el => (el as HTMLImageElement).naturalWidth), route).toBeGreaterThan(0)
    }
  }
  expect(errors).toEqual([])
})

test('substances mega menu opens on hover and swaps the feature image', async ({ page }) => {
  await page.goto('/blog/')
  const dd = page.locator('.site-header .dd').filter({ has: page.locator('> a[href="/substances/"]') })
  const mega = dd.locator('.mega')
  await expect(mega).toBeHidden()
  await dd.locator('> a').hover()
  await expect(mega).toBeVisible()
  const img = mega.locator('.fimg img'), label = mega.locator('.ftxt b')
  const initial = await img.evaluate(el => (el as HTMLImageElement).src)
  const link = mega.locator('a[href="/substances/lsd/"][data-img]')
  await link.hover()
  await expect(img).toHaveAttribute('src', (await link.getAttribute('data-img'))!)
  await expect(label).toHaveText((await link.getAttribute('data-t'))!)
  expect(await img.evaluate(el => (el as HTMLImageElement).src)).not.toBe(initial)
  await page.mouse.move(5, 900)
  await expect(mega).toBeHidden()
  await expect(img).toHaveJSProperty('src', initial)
})

test('articles mega menu lists recent articles', async ({ page }) => {
  await page.goto('/')
  const dd = page.locator('.site-header .dd').filter({ has: page.locator('> a[href="/blog/"]') })
  await dd.locator('> a').hover()
  await expect(dd.locator('.mega')).toBeVisible()
  await expect(dd.locator('.mega a.lesson')).toHaveCount(6)
})

test('mobile menu opens, closes with Escape, and pages fit 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const burger = page.locator('.burger'), mnav = page.locator('#mnav')
  await expect(burger).toBeVisible()
  await expect(mnav).toBeHidden()
  await burger.click()
  await expect(page.locator('body')).toHaveClass(/menu-open/)
  await expect(burger).toHaveAttribute('aria-expanded', 'true')
  await expect(mnav).toBeVisible()
  await mnav.locator('summary').click()
  await expect(mnav.locator('a[href="/substances/lsd/"]')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('body')).not.toHaveClass(/menu-open/)
  await expect(burger).toHaveAttribute('aria-expanded', 'false')
  await expect(mnav).toBeHidden()
  await burger.click()
  await mnav.locator('a[href="/contact/"]').click()
  await expect(page).toHaveURL(/\/contact\/$/)
  for (const route of ['/', '/substances/', '/substances/lsd/', '/blog/', '/contact/', '/aide/']) {
    await page.goto(route)
    expect(await pageWidth(page), route).toBeLessThanOrEqual(390)
  }
})

test('listing hubs link every published guide', async ({ page }) => {
  for (const [path, category, count] of [['/substances/', 'psychedelics', 22], ['/microdosing/', 'microdosing', 10]] as const) {
    await page.goto(path)
    await expect(page.locator('main a.sc.listing-card')).toHaveCount(count)
    for (const guide of guideCatalog.filter(g => g.category === category)) await expect(page.locator(`main a.listing-card[href="${guide.path}"]`)).toHaveCount(1)
  }
  await page.goto('/microdosing/')
  await expect(page.locator('main')).toContainText('Fadiman')
})

test('blog lists every article on a single page', async ({ page }) => {
  await page.goto('/blog/')
  await expect(page.locator('main a.afeat')).toHaveCount(1)
  await expect(page.locator('main a.afeat, main a.acard')).toHaveCount(13)
  await page.locator(`main a[href="${ARTICLE}"]`).click()
  await expect(page).toHaveURL(ARTICLE)
  await expect(page.locator('main h1')).toContainText('mode par défaut')
})

test('search finds a known article and renders the query as text', async ({ page }) => {
  await page.goto('/recherche/?s=cerveau')
  await expect(page.locator(`#results a[href="${ARTICLE}"]`)).toBeVisible()
  await expect(page.locator('#search-status')).toContainText('résultat')
  await page.goto('/recherche/?s=ibogaïne')
  await expect(page.locator('#results a[href="/substances/ibogaine/"]')).toBeVisible()

  const payload = '<img src=x onerror="window.__xss=1"><b id="injected">x</b>'
  await page.goto(`/recherche/?s=${encodeURIComponent(payload)}`)
  await expect(page.locator('#search-status')).toHaveText('0 résultats')
  await expect(page.locator('#q')).toHaveValue(payload)
  await expect(page.locator('#injected, main img[src="x"]')).toHaveCount(0)
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined()
})

test('contact form shows the server message and keeps input on failure', async ({ page }) => {
  await page.goto('/contact/')
  const form = page.locator('form[data-form-kind=contact]')
  await form.locator('[name=your-name]').fill('Test')
  await form.locator('[name=your-email]').fill('person@example.org')
  await form.locator('[name=your-subject]').fill('Question')
  await form.locator('[name=your-message]').fill('Bonjour')
  await page.route('**/api/forms', route => route.fulfill({ status: 503, json: { message: 'Veuillez réessayer.' } }))
  await form.locator('[type=submit]').click()
  await expect(form.locator('.form-status')).toHaveText('Veuillez réessayer.')
  await expect(form.locator('[name=your-message]')).toHaveValue('Bonjour')
  await page.unroute('**/api/forms')
  let body = ''
  await page.route('**/api/forms', route => { body = route.request().postData() ?? ''; return route.fulfill({ json: { message: 'Merci, votre message a bien été envoyé.' } }) })
  await form.locator('[type=submit]').click()
  await expect(form.locator('.form-status')).toHaveText('Merci, votre message a bien été envoyé.')
  await expect(form.locator('[name=your-message]')).toHaveValue('')
  for (const field of ['kind', 'your-name', 'your-email', 'your-subject', 'your-message', 'request_id']) expect(body).toContain(`name="${field}"`)
})

test('desktop and mobile screenshots', async ({ page }) => {
  for (const [name, route] of [['home', '/'], ['substances', '/substances/'], ['guide', '/microdosing/lsd/'], ['blog', '/blog/']]) {
    await page.goto(route)
    await page.screenshot({ path: `output/${name}-desktop.png`, fullPage: true })
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.screenshot({ path: 'output/home-mobile.png', fullPage: true })
})
