import { readFile, writeFile, mkdir, access } from 'node:fs/promises'
import { load } from 'cheerio'
import { createHash } from 'node:crypto'
const origin='https://thethirdwave.co'
const cache='.wordpress-import/thirdwave'
const destination='src/content-data/guides'
const names={'2c-b':'2C-B','4-aco-dmt':'4-AcO-DMT','5-meo-dmt':'5-MeO-DMT','amanita-muscaria':'Amanite tue-mouches','ayahuasca':'Ayahuasca',cacao:'Cacao',cannabis:'Cannabis',marijuana:'Cannabis',datura:'Datura',dmt:'DMT',ibogaine:'Ibogaïne',kambo:'Kambô',kanna:'Kanna',ketamine:'Kétamine',kratom:'Kratom',lsd:'LSD',mdma:'MDMA',mescaline:'Mescaline',peyote:'Peyotl',shrooms:'Champignons à psilocybine',mushrooms:'Champignons à psilocybine',salvia:'Salvia divinorum','san-pedro':'San Pedro',tobacco:'Tabac','1p-lsd':'1P-LSD','psilocybin-truffles':'Truffes à psilocybine'}
const slugMap={shrooms:'champignons-psilocybin',mushrooms:'champignons-psilocybin',marijuana:'cannabis',tobacco:'tabac','psilocybin-truffles':'truffes-psilocybine'}
const entries=[]
const delay=ms=>new Promise(r=>setTimeout(r,ms))
await mkdir(destination,{recursive:true})
async function fetchCached(url,key){const file=`${cache}/${key}.html`;try{return await readFile(file,'utf8')}catch{}await delay(800);const r=await fetch(url);if(!r.ok)throw new Error(`${r.status} ${url}`);const html=await r.text();await writeFile(file,html);return html}
const inventories={}
for(const category of ['psychedelics','microdosing']){
 const $=load(await readFile(`${cache}/${category}.html`,'utf8'))
 inventories[category]=[...new Set($('article a[href]').map((_,e)=>$(e).attr('href')).get().filter(h=>new RegExp(`thethirdwave.co/${category}/[^/#?]+/?$`).test(h)))];
 entries.push({category,sourceUrl:`${origin}/${category}/`,slug:'index',name:category==='psychedelics'?'Psychédéliques':'Microdosing',path:category==='psychedelics'?'/substances/':'/microdosing/',hub:true})
 for(const sourceUrl of inventories[category]){const slug=new URL(sourceUrl).pathname.split('/').filter(Boolean).at(-1);entries.push({category,sourceUrl,slug,name:names[slug],path:`/${category==='psychedelics'?'substances':'microdosing'}/${slugMap[slug]||slug}/`,hub:false})}
}
const blockSelector='h2,h3,h4,h5,h6,p,ul,ol,blockquote,table,figure,img'
const omittedHeadings=/how (?:to|do (?:I|you)|can (?:I|you)|should (?:I|you)) (?:take|use|microdose|dose|grow|identify|make|extract|prepare|smoke|vaporize|inject|buy|order|purchase|get started)|where (?:can|do|to).*(?:buy|find|source|purchase)|\bdosage\b|\bdosing\b|^(?:growing|cultivating|buying|purchasing|sourcing|preparing|extracting)|cultivation|extraction|protocol|administration|consumption|smoking|vaporizing|injection/i
for(const [index,entry] of entries.entries()){
 console.log(`[${index+1}/${entries.length}] ${entry.sourceUrl}`)
 entry.id=`${entry.category}-${entry.slug}`
 const html=await fetchCached(entry.sourceUrl,entry.hub?entry.category:entry.id)
 const $=load(html)
 $('script,style,svg,form,iframe,button,noscript,.toc,.ttw-section__heading__number,.tve-leads-conversion-object,[class*=thrive],[class*=tve-],.ssba-wrap').remove()
 const article=$('article').first()
 const main=entry.hub?article:article.find('.ttw-section')
 if(!main.length)throw new Error(`Missing article ${entry.sourceUrl}`)
 // Several source sections begin with bare text and inline links rather than a paragraph.
 // Wrap those runs so the block importer retains the opening definitions and other prose.
 for(const container of main.find('div,section').addBack().toArray().sort((a,b)=>$(b).parents().length-$(a).parents().length)){
   let run=[];const output=[]
   const flush=()=>{
     if(!run.length)return
     const fragment=run.map(node=>$.html(node)).join('')
     if(load(fragment).text().trim()){
       output.push(`<p>${fragment}</p>`)
     }
     run=[]
   }
   for(const child of $(container).contents().toArray()){
     if(child.type==='text'||(child.type==='tag'&&!/^(?:div|section|article|aside|h[1-6]|p|ul|ol|table|figure|blockquote|hr|img)$/.test(child.tagName)))run.push(child)
     else {flush();output.push($.html(child))}
   }
   flush()
   $(container).html(output.join(''))
 }
 const seen=new Set();const blocks=[];const omissions=[];let skipLevel=0
 main.find(blockSelector).each((_,element)=>{
   const node=$(element),tag=element.tagName
   if(node.parents(blockSelector).length)return
   const text=node.text().replace(/\s+/g,' ').trim()
   if(!text&&tag!=='img'&&tag!=='figure')return
   if(/^h[2-6]$/.test(tag)){
     const level=Number(tag[1]);if(skipLevel&&level<=skipLevel)skipLevel=0
     if(omittedHeadings.test(text)){skipLevel=level;omissions.push({heading:text,reason:'Practical instructions or commercial promotion; replaced with a non-procedural editorial note.'});return}
   }
   if(skipLevel)return
   if(/(?:shop|buy|order|purchase|get|join|enroll|book|sign up|download|subscribe).{0,65}(?:course|kit|discount|coaching|retreat|newsletter|community|product|consultation)|third wave.{0,40}(?:course|coaching|certif)|microdosing collective/i.test(text))return
   // Do not republish operational drug-production, sourcing, or administration instructions.
   if(/(?:^|[.!?]\s+)(?:start with|take|consume|mix|grind|dissolve|soak|brew|inject|smoke|vaporize|weigh|cut)\s.{0,90}(?:\b\d+(?:\.\d+)?\s?(?:mg|g|μg|ug|mcg|grams|micrograms)|blotter|powder|dose|vine|syringe|capsule)|volumetric method.{0,100}submerg|(?:every|each) (?:third|other|second) day|one day on|two days off|where to (?:buy|find|source)|how to (?:grow|make|extract)/i.test(text)){
     omissions.push({heading:text.slice(0,100),reason:'Operational drug instructions'});return
   }
   if(seen.has(text)&&text)return
   if(text)seen.add(text)
   const clone=node.clone()
   clone.find('*').addBack().each((_,el)=>{for(const attr of Object.keys(el.attribs||{}))if(!['href','src','alt','title','id','colspan','rowspan'].includes(attr))$(el).removeAttr(attr)})
   clone.find('a').addBack('a').each((_,el)=>{const a=$(el);try{const url=new URL(a.attr('href'),entry.sourceUrl);a.attr('href',url.href)}catch{a.removeAttr('href')}})
   blocks.push({html:$.html(clone),text,tag})
 })
 const sourceWords=blocks.map(b=>b.text).join(' ').split(/\s+/).length
 for (const block of blocks) {
   const fragment=load(block.html,null,false)
   for (const img of fragment('img').toArray()) {
     const src=fragment(img).attr('src'); if(!src)continue
     const url=new URL(src,entry.sourceUrl)
     const extension=url.pathname.match(/\.(png|jpe?g|svg|webp|gif)$/i)?.[0]||'.jpg'
     const local='/assets/guides/'+createHash('sha256').update(url.href).digest('hex').slice(0,16)+extension
     await mkdir('public/assets/guides',{recursive:true})
     try { await access('public'+local) } catch {
       const response=await fetch(url); if(!response.ok){fragment(img).remove();continue}
       await writeFile('public'+local,Buffer.from(await response.arrayBuffer()))
     }
     fragment(img).attr('src',local).attr('loading','lazy').attr('decoding','async')
   }
   block.html=fragment.html()
 }
 entry.blocks=blocks;entry.sourceBlockCount=blocks.length;entry.sourceWords=sourceWords;entry.omissions=omissions
 entry.description=$('meta[name=description]').attr('content')||''
 entry.originalTitle=$('title').text()
 entry.retrievedAt=new Date().toISOString()
 entry.contentHash=createHash('sha256').update(JSON.stringify(blocks)).digest('hex')
 await writeFile(`${cache}/${entry.id}.json`,JSON.stringify(entry,null,2))
}
await writeFile(`${cache}/inventory.json`,JSON.stringify(entries.map(({blocks,...entry})=>entry),null,2))
console.log(`Inventoried ${entries.length} pages; ${entries.reduce((n,e)=>n+e.sourceWords,0)} source words`)
