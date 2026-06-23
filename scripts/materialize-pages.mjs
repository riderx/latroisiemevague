import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourceFile = process.argv[2] ? path.resolve(process.argv[2]) : path.join(rootDir, '.wordpress-import/site.json')
const contentRoot = path.join(rootDir, 'page-content/pages')
const pagesRoot = path.join(rootDir, 'src/pages')
const removeSource = process.argv.includes('--remove-source')

function toPosix(value) {
  return value.split(path.sep).join('/')
}

function importPath(fromDir, target) {
  const relative = toPosix(path.relative(fromDir, target))
  return relative.startsWith('.') ? relative : `./${relative}`
}

function pageId(pagePath) {
  if (pagePath === '/') return 'home'

  return pagePath
    .replace(/^\/|\/$/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
}

function routeFile(pagePath) {
  if (pagePath === '/') return path.join(pagesRoot, 'index.astro')

  return path.join(pagesRoot, pagePath.replace(/^\/|\/$/g, ''), 'index.astro')
}

async function writeRoute(page, meta) {
  const file = routeFile(page.path)
  const fromDir = path.dirname(file)
  const layoutPath = importPath(fromDir, path.join(rootDir, 'src/layouts/WordPressPage.astro'))
  const source = `---\nimport WordPressPage from '${layoutPath}'\n\nconst routePage = ${JSON.stringify(meta, null, 2)}\n---\n\n<WordPressPage page={routePage} />\n`

  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, source)
}

async function main() {
  const site = JSON.parse(await readFile(sourceFile, 'utf8'))
  const manifest = {
    generatedAt: site.generatedAt,
    origin: site.origin,
    pages: [],
  }

  await rm(contentRoot, { recursive: true, force: true })
  await mkdir(contentRoot, { recursive: true })

  for (const page of site.pages) {
    const id = pageId(page.path)
    const pageContentDir = path.join(contentRoot, id)
    await mkdir(pageContentDir, { recursive: true })

    const meta = {
      id,
      path: page.path,
      title: page.title,
      description: page.description,
      bodyClass: page.bodyClass,
    }

    await writeFile(path.join(pageContentDir, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`)
    await writeFile(path.join(pageContentDir, 'head.html'), `${page.headHtml}\n`)
    await writeFile(path.join(pageContentDir, 'body.html'), `${page.bodyHtml}\n`)
    await writeRoute(page, meta)
    manifest.pages.push({ id, path: page.path, title: page.title })
  }

  await writeFile(path.join(contentRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)

  if (removeSource) {
    await rm(sourceFile, { force: true })
  }

  console.log(`Materialized ${manifest.pages.length} Astro routes into src/pages and page-content/pages`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
