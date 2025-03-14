import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { handleChat } from './handlers/chat'
import { authMiddleware } from './middleware/auth'
import { rateLimiter } from './middleware/rateLimit'
import { initDB } from './lib/database'

// 初始化数据库表
await initDB()

const app = new Hono()

// 全局中间件链
app.use(
  '*',
  cors({
    origin: ['*'],
    allowMethods: ['POST', 'GET'],
    maxAge: 600,
  }),
  authMiddleware,
  rateLimiter
)

// 核心路由配置
app.post('/v1/chat/completions', handleChat)
app.get('/v1/models', (c) =>
  c.json({
    models: ['moonshot-v1'],
  })
)

// 健康检查端点
app.get('/health', (c) =>
  c.json({
    status: 'OK',
    timestamp: Date.now(),
  })
)

// 错误处理
app.onError((err, c) => {
  console.error(`[${new Date().toISOString()}]`, err)
  return c.json(
    {
      code: 500,
      message: err.message || 'Internal Server Error',
    },
    500
  )
})

export default app
