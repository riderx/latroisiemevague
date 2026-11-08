import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
const manifest = JSON.parse(readFileSync('src/content-data/pages/manifest.json', 'utf8'))

test('all migrated pages render with local assets and no browser errors', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`) })
  for (const route of manifest.pages) {
    await page.goto(route.path)
    await expect(page).toHaveTitle(route.title)
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
