export {}
const buttons = document.querySelectorAll<HTMLElement>('.raven-nav-menu-toggle-button, .raven-nav-menu-close-button')
buttons.forEach(button => {
  button.setAttribute('role', 'button')
  button.tabIndex = 0
  button.setAttribute('aria-label', button.matches('.raven-nav-menu-close-button') ? 'Fermer le menu' : 'Ouvrir le menu')
  button.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); button.click() }
  })
})
const opener = document.querySelector<HTMLElement>('.raven-nav-menu-toggle-button')
const menu = document.querySelector<HTMLElement>('.raven-nav-menu-mobile')
function toggleMenu(open: boolean) {
  menu?.classList.toggle('is-open', open)
  document.body.classList.toggle('menu-open', open)
  opener?.setAttribute('aria-expanded', String(open))
  if (open) menu?.querySelector<HTMLElement>('[role=button], a')?.focus()
  else opener?.focus()
}
opener?.setAttribute('aria-expanded', 'false')
opener?.addEventListener('click', () => toggleMenu(!menu?.classList.contains('is-open')))
menu?.querySelector('.raven-nav-menu-close-button')?.addEventListener('click', () => toggleMenu(false))
document.addEventListener('keydown', event => {
  if (!menu?.classList.contains('is-open')) return
  if (event.key === 'Escape') toggleMenu(false)
  if (event.key === 'Tab') {
    const focusable = [...menu.querySelectorAll<HTMLElement>('a, [role=button]')].filter(el => el.getClientRects().length)
    const first = focusable[0], last = focusable.at(-1)
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }
})
document.querySelectorAll<HTMLButtonElement>('[data-toggle=collapse]').forEach(button => {
  button.addEventListener('click', () => {
    const panel = document.querySelector(button.dataset.target || '')
    button.setAttribute('aria-expanded', String(panel?.classList.toggle('show')))
  })
})
// Native disclosures replace Elementor / JetTabs accordions without loading WordPress JS.
document.querySelectorAll<HTMLElement>('.elementor-tab-title, .jet-toggle__control').forEach(title => {
  title.tabIndex = 0
  title.setAttribute('role', 'button')
  const panel = title.nextElementSibling as HTMLElement | null
  if (!panel) return
  const update = (open: boolean) => {
    title.setAttribute('aria-expanded', String(open))
    title.classList.toggle('elementor-active', open)
    panel.style.display = open ? 'block' : 'none'
  }
  update(title.classList.contains('elementor-active'))
  title.addEventListener('click', () => update(title.getAttribute('aria-expanded') !== 'true'))
  title.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); title.click() } })
})
document.querySelectorAll<HTMLFormElement>('form[data-form-kind]').forEach(form => {
  const id = document.createElement('input')
  id.type = 'hidden'; id.name = 'request_id'; id.value = crypto.randomUUID(); form.append(id)
  form.addEventListener('submit', async event => {
    event.preventDefault()
    if (!form.reportValidity()) return
    const submit = form.querySelector<HTMLButtonElement | HTMLInputElement>('[type=submit]')!
    const status = form.querySelector<HTMLElement>('.form-status')!
    submit.disabled = true; status.textContent = 'Envoi en cours…'; status.dataset.error = 'false'
    try {
      const response = await fetch('/api/forms', { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } })
      const result = await response.json()
      if (!response.ok) throw new Error(result.message || 'L’envoi a échoué. Veuillez réessayer.')
      status.textContent = result.message
      form.reset(); id.value = crypto.randomUUID()
    } catch (error) {
      status.dataset.error = 'true'
      status.textContent = error instanceof Error ? error.message : 'Erreur réseau. Veuillez réessayer.'
    } finally { submit.disabled = false }
  })
})
const params = new URLSearchParams(location.search)
if (location.pathname === '/' && params.has('s')) location.replace(`/recherche/?s=${encodeURIComponent(params.get('s') || '')}`)
document.querySelector<HTMLAnchorElement>('.raven-load-more-button')?.addEventListener('click', async event => {
  const button = event.currentTarget as HTMLAnchorElement
  event.preventDefault()
  if (button.getAttribute('aria-busy') === 'true') return
  button.setAttribute('aria-busy', 'true')
  try {
    const response = await fetch(button.href)
    if (!response.ok) throw new Error('Pagination failed')
    const next = new DOMParser().parseFromString(await response.text(), 'text/html')
    const grid = document.querySelector('.raven-posts')!
    next.querySelectorAll('.raven-post-item').forEach(card => grid.append(card))
    const more = next.querySelector<HTMLAnchorElement>('.raven-load-more-button')
    if (more) button.href = more.href
    else button.parentElement?.remove()
  } catch { location.assign(button.href) }
  finally { button.removeAttribute('aria-busy') }
})
