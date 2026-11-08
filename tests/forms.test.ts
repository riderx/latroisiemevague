import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import worker, { deliver } from '../worker/forms.ts'

function setup(failRecipient = '') {
  const db = new DatabaseSync(':memory:')
  db.exec(readFileSync('migrations/0001_forms.sql', 'utf8'))
  const sent: any[] = []
  const prepare = (sql: string) => {
    let args: any[] = []
    const stmt = {
      bind(...values: any[]) { args = values; return stmt },
      async run() { const result = db.prepare(sql).run(...args); return { meta: { changes: Number(result.changes) } } },
      async first() { return db.prepare(sql).get(...args) || null },
      async all() { return { results: db.prepare(sql).all(...args) } },
    }
    return stmt
  }
  const env = { DB: { prepare, async batch(statements: any[]) { db.exec('BEGIN'); try { const results = []; for (const s of statements) results.push(await s.run()); db.exec('COMMIT'); return results } catch (e) { db.exec('ROLLBACK'); throw e } } },
    EMAIL_FROM: 'contact@latroisiemevague.com', EMAIL: { async send(message: any) { if (message.to === failRecipient) throw new Error('temporary delivery failure'); sent.push(message); return { messageId: 'mock' } } } } as unknown as Env
  let pending: Promise<unknown>[] = []
  const ctx = { waitUntil(p: Promise<unknown>) { pending.push(p) } } as ExecutionContext
  async function submit(values: Record<string, string> = {}, headers = {}) {
    pending = []
    const form = new FormData()
    for (const [key, value] of Object.entries({ kind: 'contact', 'your-name': 'Test', 'your-email': 'person@example.org', 'your-subject': 'Question', 'your-message': 'Bonjour', ...values })) form.set(key, value)
    const response = await worker.fetch(new Request('https://latroisiemevague.com/api/forms', { method: 'POST', body: form, headers: { accept: 'application/json', origin: 'https://latroisiemevague.com', ...headers } }), env, ctx)
    await Promise.all(pending)
    return response
  }
  return { db, env, sent, submit }
}
test('saves a contact message and notifies both fixed recipients', async () => {
  const { db, sent, submit } = setup()
  assert.equal((await submit()).status, 200)
  assert.equal(db.prepare('SELECT count(*) AS n FROM submissions').get()!.n, 1)
  assert.deepEqual(sent.map(m => m.to), ['martindonadieu@gmail.com', 'orion.aubert@gmail.com'])
  assert.equal(sent[0].replyTo, 'person@example.org')
})
test('newsletter signups and replayed requests do not duplicate notifications', async () => {
  const { db, sent, submit } = setup()
  const id = crypto.randomUUID()
  await submit({ kind: 'newsletter', email: 'subscriber@example.org', 'your-email': '', request_id: id })
  await submit({ kind: 'newsletter', email: 'subscriber@example.org', 'your-email': '', request_id: id })
  await submit({ kind: 'newsletter', email: 'SUBSCRIBER@example.org', 'your-email': '' })
  assert.equal(db.prepare('SELECT count(*) AS n FROM submissions').get()!.n, 1)
  assert.equal(sent.length, 2)
})
test('failed email remains durable and retry does not resend to the successful recipient', async () => {
  const { db, env, sent, submit } = setup('orion.aubert@gmail.com')
  assert.equal((await submit()).status, 200)
  assert.equal(sent.length, 1)
  assert.equal(db.prepare("SELECT count(*) AS n FROM notifications WHERE status = 'pending'").get()!.n, 1)
  env.EMAIL.send = async (message: any) => { sent.push(message); return { messageId: 'retry' } }
  db.exec("UPDATE notifications SET next_attempt = 0 WHERE status = 'pending'")
  await deliver(env)
  assert.deepEqual(sent.map(m => m.to), ['martindonadieu@gmail.com', 'orion.aubert@gmail.com'])
})
test('invalid input, cross-origin requests and honeypots never store or email', async () => {
  const { db, sent, submit } = setup()
  assert.equal((await submit({ 'your-email': 'invalid' })).status, 400)
  assert.equal((await submit({ 'your-subject': 'line\r\ninjection' })).status, 400)
  assert.equal((await submit({}, { origin: 'https://unrelated.example' })).status, 403)
  assert.equal((await submit({ website: 'spam.example' })).status, 200)
  assert.equal(db.prepare('SELECT count(*) AS n FROM submissions').get()!.n, 0)
  assert.equal(sent.length, 0)
})
test('limits submissions per IP window', async () => {
  const { submit } = setup()
  for (let i = 0; i < 5; i++) assert.equal((await submit()).status, 200)
  assert.equal((await submit()).status, 429)
})
test('database failures never claim the submission was saved', async () => {
  const { db, submit } = setup()
  db.close()
  assert.equal((await submit()).status, 503)
})

test('a reused request ID cannot silently discard a different message', async () => {
  const { submit, sent } = setup()
  const request_id = crypto.randomUUID()
  assert.equal((await submit({ request_id })).status, 200)
  assert.equal((await submit({ request_id, 'your-message': 'Different message' })).status, 409)
  assert.equal(sent.length, 2)
})
