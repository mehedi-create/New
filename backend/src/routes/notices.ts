// backend/src/routes/notices.ts
import { Hono } from 'hono'
import { ethers } from 'ethers'
import type { Bindings } from '../utils/types'
import { buildAdminActionMessage, verifySignedMessage, requireOwner } from '../utils/auth'

function isoNow() { return new Date().toISOString() }
function addSeconds(sec: number) {
  const d = new Date(); d.setSeconds(d.getSeconds() + sec); return d.toISOString()
}

export function mountNoticeRoutes(app: Hono<{ Bindings: Bindings }>) {
  // Public: list active notices
  app.get('/api/notices', async (c) => {
    try {
      const url = new URL(c.req.url)
      const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || '10'), 1), 200)
      const active = Number(url.searchParams.get('active') || '1') === 1
      const nowIso = isoNow()

      const where = active ? 'WHERE is_active = 1 AND (expires_at IS NULL OR expires_at > ?)' : ''
      const sql = `SELECT id, kind, image_url, link_url, content_html, priority, created_at, expires_at
                   FROM notices ${where} ORDER BY priority DESC, id DESC LIMIT ?`

      const res = active
        ? await c.env.DB.prepare(sql).bind(nowIso, limit).all()
        : await c.env.DB.prepare(sql).bind(limit).all()

      return c.json({ notices: res.results || [] })
    } catch (e: any) {
      console.error('GET /api/notices', e?.message || e)
      return c.json({ notices: [] })
    }
  })

  // Admin: list all notices
  app.get('/api/admin/notices', async (c) => {
    try {
      const url = new URL(c.req.url)
      const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || '100'), 1), 500)
      const sql = `SELECT id, kind, is_active, priority, image_url, link_url, content_html, created_at, expires_at
                   FROM notices ORDER BY priority DESC, id DESC LIMIT ?`
      const res = await c.env.DB.prepare(sql).bind(limit).all()
      return c.json({ ok: true, notices: res.results || [] })
    } catch (e: any) {
      console.error('GET /api/admin/notices', e?.message || e)
      return c.json({ ok: false, notices: [] }, 500)
    }
  })

  // Admin: create notice
  app.post('/api/notices', async (c) => {
    try {
      const body = await c.req.json<{
        address: string; timestamp: number; signature: string;
        kind: 'image' | 'script';
        image_url?: string; link_url?: string; content_html?: string;
        is_active?: boolean; priority?: number;
        expires_in_sec?: number; expires_at?: string;
      }>()
      const { address, timestamp, signature, kind } = body || ({} as any)
      if (!ethers.isAddress(address)) return c.json({ error: 'Invalid admin address' }, 400)
      if (!timestamp || !signature) return c.json({ error: 'Missing auth' }, 400)
      if (!kind || (kind !== 'image' && kind !== 'script')) return c.json({ error: 'Invalid kind' }, 400)

      const msg = buildAdminActionMessage('create_notice', address, Number(timestamp))
      await verifySignedMessage(address, msg, signature)
      await requireOwner(c.env, address)

      const isActive = body.is_active === undefined ? 1 : (body.is_active ? 1 : 0)
      const prio = Number.isFinite(body.priority) ? Math.trunc(Number(body.priority)) : 0

      let exp: string | null = null
      if (Number(body.expires_in_sec) > 0) exp = addSeconds(Math.trunc(Number(body.expires_in_sec)))
      else if (body.expires_at && /^\d{4}-\d{2}-\d{2}T/.test(body.expires_at)) exp = body.expires_at

      const sql = `INSERT INTO notices (kind, is_active, priority, image_url, link_url, content_html, created_at, expires_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      await c.env.DB.prepare(sql)
        .bind(
          kind,
          isActive,
          prio,
          (body.image_url || '').trim(),
          (body.link_url || '').trim(),
          (body.content_html || ''),
          isoNow(),
          exp
        ).run()

      return c.json({ ok: true })
    } catch (e: any) {
      console.error('POST /api/notices', e?.message || e)
      return c.json({ error: 'Server error' }, 500)
    }
  })

  // Admin: update notice
  app.patch('/api/notices/:id', async (c) => {
    try {
      const { id } = c.req.param()
      const body = await c.req.json<{
        address: string; timestamp: number; signature: string;
        kind?: 'image' | 'script';
        image_url?: string; link_url?: string; content_html?: string;
        is_active?: boolean; priority?: number;
        expires_in_sec?: number; expires_at?: string;
      }>()
      const { address, timestamp, signature } = body || ({} as any)
      if (!ethers.isAddress(address)) return c.json({ error: 'Invalid admin address' }, 400)
      if (!timestamp || !signature) return c.json({ error: 'Missing auth' }, 400)

      const msg = buildAdminActionMessage('update_notice', address, Number(timestamp))
      await verifySignedMessage(address, msg, signature)
      await requireOwner(c.env, address)

      const fields: string[] = []
      const values: any[] = []

      if (body.kind && (body.kind === 'image' || body.kind === 'script')) { fields.push('kind = ?'); values.push(body.kind) }
      if (typeof body.is_active === 'boolean') { fields.push('is_active = ?'); values.push(body.is_active ? 1 : 0) }
      if (Number.isFinite(body.priority)) { fields.push('priority = ?'); values.push(Math.trunc(Number(body.priority))) }
      if (body.image_url !== undefined) { fields.push('image_url = ?'); values.push((body.image_url || '').trim()) }
      if (body.link_url !== undefined) { fields.push('link_url = ?'); values.push((body.link_url || '').trim()) }
      if (body.content_html !== undefined) { fields.push('content_html = ?'); values.push(body.content_html || '') }

      if (Number(body.expires_in_sec) > 0) { fields.push('expires_at = ?'); values.push(addSeconds(Math.trunc(Number(body.expires_in_sec)))) }
      else if (body.expires_at !== undefined) {
        const exp = body.expires_at && /^\d{4}-\d{2}-\d{2}T/.test(body.expires_at) ? body.expires_at : null
        fields.push('expires_at = ?'); values.push(exp)
      }

      fields.push('updated_at = ?'); values.push(isoNow())

      if (!fields.length) return c.json({ ok: true, noop: true })
      const sql = `UPDATE notices SET ${fields.join(', ')} WHERE id = ?`
      values.push(Number(id))
      await c.env.DB.prepare(sql).bind(...values).run()

      return c.json({ ok: true })
    } catch (e: any) {
      console.error('PATCH /api/notices/:id', e?.message || e)
      return c.json({ error: 'Server error' }, 500)
    }
  })

  // Admin: delete notice
  app.delete('/api/notices/:id', async (c) => {
    try {
      const { id } = c.req.param()
      const body = await c.req.json<{ address: string; timestamp: number; signature: string }>()
      const { address, timestamp, signature } = body || ({} as any)
      if (!ethers.isAddress(address)) return c.json({ error: 'Invalid admin address' }, 400)
      if (!timestamp || !signature) return c.json({ error: 'Missing auth' }, 400)

      const msg = buildAdminActionMessage('delete_notice', address, Number(timestamp))
      await verifySignedMessage(address, msg, signature)
      await requireOwner(c.env, address)

      await c.env.DB.prepare('DELETE FROM notices WHERE id = ?').bind(Number(id)).run()
      return c.json({ ok: true })
    } catch (e: any) {
      console.error('DELETE /api/notices/:id', e?.message || e)
      return c.json({ error: 'Server error' }, 500)
    }
  })
}
