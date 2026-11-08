# Third Wave French edition

On 2026-11-08, the site owner confirmed that Third Wave authorized copying and translating its guides into French, in exchange for receiving the French work. The owner will share the completed work directly; this project sends nothing to Third Wave.

## Published scope

The library comprises the **22 substance guides and 10 microdosing guides** linked from the English hubs. Existing French guide URLs are retained. The two French listing pages are editorial adaptations at `/substances/` and `/microdosing/`; the 32 detailed articles follow the source section structure and retain bibliography links. The 15 existing blog posts and their archives remain separate.

This is an authorized French translation and adaptation, not an exact facsimile or an independent medical review. Commercial widgets, subscription modals, and operational instructions for drug production, sourcing or administration are excluded. The article footer states these limits and discloses AI-assisted translation. Research, history, pharmacology, cultural context, risks and references are retained where applicable.

## Content and provenance

- `src/content-data/guides/catalog.json`: stable source URLs and French routes.
- `src/content-data/guides/<id>.json`: translated blocks, source hash, original title, retrieval date, translation date/model/version, block count and omission audit.
- `src/content-data/guide-source-audit.json`: source block/link counts and required section IDs for every guide.
- `src/content-data/guide-corrections.json`: explicit, source-hash-bound editorial replacements; these are visibly labelled in the rendered articles.
- `src/content-data/guide-updates.ts`: separately identified evidence notes with primary sources.
- `src/lib/guides.ts`: section labels, local cross-links, restored footnote anchors and safe HTML rendering.

The source snapshots and translation caches remain in ignored `.wordpress-import/thirdwave/`. Introductory bare text in the WordPress source is wrapped into paragraphs before extraction, so definitions are retained. Numeric reference links and their destinations are preserved; legacy Word-style footnote names are restored as HTML IDs. Bibliographic titles remain in their original language.

## Article layout and search metadata

Each guide opens with its own illustration (one per substance, shared by the substance and microdosing guides), the update date, reading time and a link to the English source. A sticky contents panel highlights the active section and shows reading progress; on mobile it becomes a compact disclosure. Anchor links work without JavaScript and reduced-motion preferences are respected.

Guides have distinct titles and H1s for substance and microdosing pages, French descriptions, canonical URLs, social metadata, source-linked Article schema and dated sitemap entries. Existing French publication dates are retained where the original WordPress metadata provides them. Articles receive BlogPosting schema with their original publication dates. Search indexing and ranking remain decisions made by search engines.

## Editorial updates

Source text contains older predictions and categorical claims. The French edition explicitly corrects, among other examples:

- Blanket claims that microdosing has been proven effective beyond placebo, or cannot cause difficult experiences.
- Old forecasts of a US MDMA approval in 2022, replaced with the dated FDA letter of August 2024.
- Confusion between ketamine and the approved esketamine product Spravato, and denial of physical dependence.
- Historical lists of jurisdictions presented as guarantees of no criminal penalty.
- Statements claiming no clinical microdosing research exists.

Evidence notes reference the 2025 randomized low-dose LSD ADHD trial, the psilocybin microdosing trials published online in 2025/in print in 2026, the 2024 observational ibogaine study, and relevant NCCIH, FDA, EMA and WHO publications. They distinguish study populations and limitations; they are not a systematic review or a current legal opinion for every jurisdiction.

## Re-import and verification

```sh
# Requires source hub snapshots in the ignored cache and Cloudflare AI credentials in the environment.
bun run import:guides
bun run check
bun run test
bun run build
bun run verify:site
bun run test:browser
```

The translator uses Cloudflare Workers AI. It caches validated batches, checks HTML structure and link counts, resumes incomplete work, and stops scheduling requests if authentication expires. Credentials are supplied by the environment and never committed. After refreshing source data, review the generated editorial corrections and translated content before deploying; the automated checks do not certify medical accuracy.

`verify:site` checks every built page (metadata, canonical URLs, structured data, internal links, anchors, redirects and local assets), then runs the guide audit. The guide audit requires every translation and every section, exact source block/link counts, French headings, source attribution, Article metadata, all 32 search/sitemap entries and complete listing-page links. Browser checks cover every route plus navigation, guide reading progress, search, forms and responsive layouts.
