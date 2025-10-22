// backend/src/app.ts
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Bindings } from './utils/types'
import { ensureSchema } from './utils/schema'

// Route mounters
import { mountPublicRoutes } from './routes/public'
import { mountNoticeRoutes } from './routes/notices'
import { mountUserRoutes } from './routes/user'
import { mountMiningRoutes } from './routes/mining'
import { mountAdminRoutes } from './routes/admin'

const app = new Hono<{ Bindings: Bindings }>()

// Dynamic CORS using env.ALLOWED_ORIGINS
app.use('/*', async (c, next) => {
  const allowed = (c.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  return cors({
    origin: (origin) => {
      if (!origin) return allowed[0] || '*'
      return allowed.includes(origin) ? origin : allowed[0] || '*'
    },
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  })(c, next)
})

// Global error handlers
app.onError((err, c) => {
  console.error('Unhandled error:', err)
  return c.json({ error: 'Server error' }, 500)
})
app.notFound((c) => {
  const path = new URL(c.req.url).pathname
  return c.json({ ok: false, error: 'NOT_FOUND', path }, 404)
})

// Ensure schema middleware (runs once per request worker lifetime)
app.use('*', async (c, next) => {
  await ensureSchema(c.env.DB)
  await next()
})

// Mount routes
mountPublicRoutes(app)
mountNoticeRoutes(app)
mountUserRoutes(app)
mountMiningRoutes(app)
mountAdminRoutes(app)

export default app
