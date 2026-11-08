import { serveAsset } from './markdown.ts'
const recipients = ['martindonadieu@gmail.com', 'orion.aubert@gmail.com']
const success = 'Merci ! Votre demande a bien été enregistrée.'
const json = (message: string, status = 200) => Response.json({ message }, { status, headers: { 'Cache-Control': 'no-store' } })
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

type Notification = { submission_id: string; recipient: string; attempts: number; kind: string; email: string; name: string; subject: string; message: string }
export async function deliver(env: Env) {
  const now = Math.floor(Date.now() / 1000)
  const { results } = await env.DB.prepare(`SELECT n.*, s.kind, s.email, s.name, s.subject, s.message
    FROM notifications n JOIN submissions s ON s.id = n.submission_id
    WHERE n.status != 'sent' AND n.next_attempt <= ? ORDER BY n.next_attempt LIMIT 20`).bind(now).all<Notification>()
  for (const row of results) {
    const lease = await env.DB.prepare(`UPDATE notifications SET status = 'sending', next_attempt = ?, attempts = attempts + 1
      WHERE submission_id = ? AND recipient = ? AND status != 'sent' AND next_attempt <= ?`)
      .bind(now + 300, row.submission_id, row.recipient, now).run()
    if (!lease.meta.changes) continue
    const subject = row.kind === 'contact' ? `Contact — ${row.subject}` : 'Nouvelle inscription à la newsletter'
    const text = `${row.kind === 'contact' ? 'Nouveau message' : 'Nouvelle inscription'} sur La Troisième Vague\n\nNom : ${row.name}\nEmail : ${row.email}\n\n${row.message}\n\nRéférence : ${row.submission_id}`
    try {
      await env.EMAIL.send({ from: { email: env.EMAIL_FROM, name: 'La Troisième Vague' }, to: row.recipient, replyTo: row.email,
        subject, text, html: `<div style="white-space:pre-wrap">${escape(text)}</div>` })
      await env.DB.prepare("UPDATE notifications SET status = 'sent', sent_at = ? WHERE submission_id = ? AND recipient = ?")
        .bind(now, row.submission_id, row.recipient).run()
    } catch {
      await env.DB.prepare("UPDATE notifications SET status = 'pending', next_attempt = ? WHERE submission_id = ? AND recipient = ?")
        .bind(now + Math.min(86400, 60 * 2 ** Math.min(row.attempts, 10)), row.submission_id, row.recipient).run()
      console.error('Notification delivery failed', { submission: row.submission_id, attempts: row.attempts + 1 })
    }
  }
}
export default {
  async fetch(request, env, ctx) {
    if (new URL(request.url).pathname !== '/api/forms') return serveAsset(request, env.ASSETS)
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } })
    const origin = request.headers.get('origin')
    if (origin && origin !== new URL(request.url).origin) return json('Origine non autorisée.', 403)
    const type = request.headers.get('content-type') || ''
    if (!/^(multipart\/form-data|application\/x-www-form-urlencoded)/i.test(type)) return json('Format non accepté.', 415)
    if (Number(request.headers.get('content-length') || 0) > 32768) return json('Message trop long.', 413)
    try {
      // Bound the stream even when Content-Length is absent or incorrect.
      const reader = request.body?.getReader()
      const chunks: Uint8Array[] = []; let size = 0
      if (reader) for (;;) {
        const { value, done } = await reader.read(); if (done) break
        size += value.byteLength
        if (size > 32768) { await reader.cancel(); return json('Message trop long.', 413) }
        chunks.push(value)
      }
      const bytes = new Uint8Array(size); let offset = 0
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
      let data: FormData
      try { data = await new Response(bytes, { headers: { 'Content-Type': type } }).formData() }
      catch { return json('Formulaire invalide.', 400) }
      const field = (name: string) => typeof data.get(name) === 'string' ? String(data.get(name)).trim() : ''
      if (field('website')) return json(success)
      const kind = field('kind'), email = (field('your-email') || field('email')).toLowerCase()
      const name = field('your-name'), subject = field('your-subject'), message = field('your-message')
      if (!['contact', 'newsletter'].includes(kind) || email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) return json('Veuillez saisir une adresse email valide.', 400)
      if (kind === 'contact' && (!name || !subject || !message || name.length > 200 || subject.length > 200 || message.length > 10000 || /[\r\n]/.test(name + subject))) return json('Veuillez vérifier le nom, le sujet et le message.', 400)
      const suppliedId = field('request_id')
      if (suppliedId && !/^[\da-f-]{36}$/i.test(suppliedId)) return json('Identifiant invalide.', 400)
      const id = suppliedId || crypto.randomUUID()
      if (suppliedId) {
        const existing = await env.DB.prepare('SELECT kind, email, name, subject, message FROM submissions WHERE id = ?')
          .bind(suppliedId).first<{ kind: string; email: string; name: string; subject: string; message: string }>()
        if (existing && (existing.kind !== kind || existing.email !== email || existing.name !== name || existing.subject !== subject || existing.message !== message)) return json('Veuillez recharger le formulaire et réessayer.', 409)
      }
      const ip = request.headers.get('CF-Connecting-IP') || 'local'
      const window = Math.floor(Date.now() / 600000)
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${ip}:${window}`))
      const key = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
      const limit = await env.DB.prepare(`INSERT INTO rate_limits (key, count, expires_at) VALUES (?, 1, ?)
        ON CONFLICT(key) DO UPDATE SET count = count + 1 RETURNING count`).bind(key, (window + 1) * 600).first<{ count: number }>()
      if ((limit?.count || 0) > 5) return json('Trop de demandes. Veuillez réessayer dans dix minutes.', 429)
      await env.DB.batch([
        env.DB.prepare('INSERT OR IGNORE INTO submissions (id, kind, email, name, subject, message) VALUES (?, ?, ?, ?, ?, ?)').bind(id, kind, email, name, subject, message),
        ...recipients.map(recipient => env.DB.prepare(`INSERT OR IGNORE INTO notifications (submission_id, recipient)
          SELECT id, ? FROM submissions WHERE id = ? AND email = ? AND kind = ?`).bind(recipient, id, email, kind)),
      ])
      ctx.waitUntil(deliver(env))
      if (!(request.headers.get('accept') || '').includes('application/json')) {
        return new Response('<!doctype html><html lang="fr"><meta charset="utf-8"><title>Merci — La Troisième Vague</title><main><h1>Merci !</h1><p>Votre demande a bien été enregistrée.</p><a href="/">Retour à l’accueil</a></main></html>', { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })
      }
      return json(success)
    } catch {
      return json('Impossible d’enregistrer votre demande. Veuillez réessayer.', 503)
    }
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(Promise.all([
      deliver(env),
      env.DB.prepare('DELETE FROM rate_limits WHERE expires_at < unixepoch()').run(),
    ]))
  },
} satisfies ExportedHandler<Env>
