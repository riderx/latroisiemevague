document.querySelectorAll<HTMLElement>('[data-reading-toc]').forEach(toc => {
  const article = document.getElementById(toc.dataset.contentId || '')
  const details = toc.querySelector('details')!
  const summary = toc.querySelector('summary')!
  const nav = toc.querySelector<HTMLElement>('nav')!
  const progress = toc.querySelector('progress')!
  const percentage = toc.querySelector<HTMLElement>('[data-reading-percentage]')!
  const current = toc.querySelector<HTMLElement>('[data-reading-current]')!
  const entries = Array.from(toc.querySelectorAll<HTMLAnchorElement>('nav a')).flatMap(link => {
    const target = document.getElementById(decodeURIComponent(link.hash.slice(1)))
    return target ? [{ link, target, top: 0 }] : []
  })
  if (!article || !entries.length) return
  entries.forEach(({ target }) => { target.tabIndex = -1 })
  const mobile = window.matchMedia('(max-width: 760px)')
  let frame = 0, active = -1, articleTop = 0, articleBottom = 0, offset = 32
  const clamp = (value: number) => Math.min(1, Math.max(0, value))

  const keepActiveVisible = () => {
    if (!details.open || active < 0) return
    const row = entries[active].link.getBoundingClientRect()
    const panel = nav.getBoundingClientRect()
    if (row.top < panel.top) nav.scrollTop -= panel.top - row.top + 8
    else if (row.bottom > panel.bottom) nav.scrollTop += row.bottom - panel.bottom + 8
  }
  const update = () => {
    frame = 0
    const cursor = window.scrollY + offset + 2
    let next = 0
    entries.forEach((entry, index) => { if (entry.top <= cursor) next = index })
    if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2) next = entries.length - 1
    if (next !== active) {
      active = next
      entries.forEach(({ link }, index) => {
        if (index === active) link.setAttribute('aria-current', 'location')
        else link.removeAttribute('aria-current')
        link.classList.toggle('is-read', index < active)
      })
      current.textContent = entries[active].link.lastElementChild?.textContent || ''
      keepActiveVisible()
    }
    const end = entries[active + 1]?.top ?? articleBottom
    entries[active].link.style.setProperty('--section-progress', `${clamp((cursor - entries[active].top) / Math.max(1, end - entries[active].top)) * 100}%`)
    const start = articleTop - offset
    const value = Math.round(clamp((window.scrollY - start) / Math.max(1, articleBottom - window.innerHeight - start)) * 100)
    progress.value = value
    percentage.textContent = `${value} %`
  }
  const schedule = () => { if (!frame) frame = requestAnimationFrame(update) }
  const measure = () => {
    offset = mobile.matches ? summary.getBoundingClientRect().height + 32 : 32
    document.documentElement.style.setProperty('--reader-offset', `${offset}px`)
    entries.forEach(entry => { entry.top = entry.target.getBoundingClientRect().top + window.scrollY })
    const bounds = article.getBoundingClientRect()
    articleTop = bounds.top + window.scrollY
    articleBottom = bounds.bottom + window.scrollY
    schedule()
  }
  const setLayout = () => { details.open = !mobile.matches; measure() }
  toc.dataset.enhanced = 'true'
  setLayout()
  mobile.addEventListener('change', setLayout)
  window.addEventListener('scroll', schedule, { passive: true })
  window.addEventListener('resize', measure, { passive: true })
  window.addEventListener('hashchange', schedule)
  window.addEventListener('pageshow', measure)
  window.addEventListener('load', measure, { once: true })
  new ResizeObserver(measure).observe(article)
  details.addEventListener('toggle', () => { if (details.open) keepActiveVisible() })
  nav.addEventListener('click', event => {
    if (mobile.matches && event.target instanceof Element && event.target.closest('a')) details.open = false
  })
  document.addEventListener('click', event => {
    if (mobile.matches && event.target instanceof Node && !toc.contains(event.target)) details.open = false
  })
  toc.addEventListener('keydown', event => {
    if (event.key === 'Escape' && details.open) { details.open = false; summary.focus() }
  })
})
