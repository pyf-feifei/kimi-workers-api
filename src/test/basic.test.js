import { describe, it, expect, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { chatHandler } from '../handlers/chat'
import { authMiddleware } from '../middleware/auth'
import { SessionManager } from '../lib/session'

// 删除此处的全局声明，避免重复
// const app = new Hono()

describe('核心功能测试', () => {
  let app

  beforeEach(() => {
    app = new Hono()
    // 注入模拟环境变量
    app.use('*', (c) => {
      c.env = {
        CRYPTO_SECRET: 'test_secret_12345678901234567890',
        KIMI_BASE_URL: 'https://mock.api',
        SESSION_STORE: new MockKV(), // 使用MockKV实例
        TOKEN_CACHE: new MockKV(),
        D1_STORE: {},
      }
      return c.next()
    })
  })

  describe('鉴权中间件', () => {
    it('应拒绝无效Authorization头', async () => {
      app.get('/auth', authMiddleware, (c) => c.text('ok'))
      const res = await app.request('/auth')
      expect(res.status).toBe(401)
    })
  })

  describe('聊天处理器', () => {
    it('应返回流式响应', async () => {
      app.post('/chat', chatHandler)
      const res = await app.request('/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'test' }],
          model: 'moonshot-v1',
        }),
      })

      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')).toContain('text/event-stream')
    })
  })

  describe('会话管理', () => {
    it('应正确加密会话数据', async () => {
      const messages = [{ role: 'user', content: 'secret' }]
      const session = await SessionManager.create({}, messages)

      expect(session.messages[0].content).not.toContain('secret')
      expect(session.id).toMatch(/^sess_/)
    })
  })
})

// KV命名空间模拟
class MockKV {
  constructor() {
    this.store = new Map()
  }

  async get(key) {
    return this.store.get(key) ?? null
  }

  async put(key, value) {
    this.store.set(key, value)
  }

  async delete(key) {
    this.store.delete(key)
  }

  async list() {
    return { keys: Array.from(this.store.keys()).map((k) => ({ name: k })) }
  }
}
