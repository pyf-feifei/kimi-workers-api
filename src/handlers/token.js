import { Context } from 'hono'
import { Config } from '../lib/config'
import { CryptoService } from '../lib/crypto'
import { LRUCache } from 'lru-cache'

// 本地缓存配置
const tokenCache = new LRUCache({
  max: 100,
  ttl: 60_000, // 1分钟更新间隔
})

export class TokenManager {
  /**
   * 生成新令牌并存入KV
   * @param c 请求上下文
   */
  static async generate(c) {
    try {
      const { env } = c
      const rawToken = CryptoService.generateSecureToken()
      const encrypted = await CryptoService.encryptToken(rawToken, env)

      const tokenConfig = {
        token: encrypted,
        weight: 1,
        last_used: Date.now(),
        usage_count: 0,
      }

      await env.TOKEN_CACHE.put(rawToken, JSON.stringify(tokenConfig))
      return c.json({ token: rawToken })
    } catch (err) {
      return c.json({ error: '令牌生成失败' }, 500)
    }
  }

  /**
   * 验证令牌有效性
   * @param c 请求上下文
   * @param token 待验证令牌
   */
  static async validate(c, token) {
    const cached = tokenCache.get(token)
    if (cached) return cached

    const config = await this.getTokenConfig(c.env, token)
    if (config) tokenCache.set(token, config)

    return config
  }

  /**
   * 获取下一个可用令牌（负载均衡）
   * @param env 环境变量
   */
  static async getNext(env) {
    const tokens = await this.getAllTokens(env)
    if (tokens.length === 0) return null

    const totalWeight = tokens.reduce((sum, t) => sum + t.weight, 0)
    let random = Math.random() * totalWeight

    return tokens.find((t) => (random -= t.weight) < 0)
  }

  /**
   * 使令牌失效
   * @param env 环境变量
   * @param token 目标令牌
   */
  static async invalidate(env, token) {
    await env.TOKEN_CACHE.delete(token)
    tokenCache.delete(token)
  }

  // 私有方法：从KV获取全部令牌配置
  static async getAllTokens(env) {
    const { keys } = await env.TOKEN_CACHE.list()
    const tokens = await Promise.all(
      keys.map(async ({ name }) => this.getTokenConfig(env, name))
    )
    return tokens.filter(Boolean)
  }

  // 私有方法：获取单个令牌配置
  static async getTokenConfig(env, token) {
    try {
      const data = await env.TOKEN_CACHE.get(token)
      return data ? JSON.parse(data) : null
    } catch (err) {
      console.error('Token config parse error:', err)
      return null
    }
  }

  // 同步本地缓存
  static async sync(env) {
    const tokens = await this.getAllTokens(env)
    tokenCache.clear()
    tokens.forEach((t) => tokenCache.set(t.token, t))
  }
}

// 令牌管理路由
export const tokenHandler = {
  // 获取当前令牌列表
  list: async (c) => {
    const tokens = await TokenManager.getAllTokens(c.env)
    return c.json(
      tokens.map((t) => ({
        token: t.token,
        usage_count: t.usage_count,
        last_used: t.last_used,
      }))
    )
  },

  // 创建新令牌
  create: async (c) => TokenManager.generate(c),

  // 删除令牌
  delete: async (c) => {
    const { token } = await c.req.json()
    await TokenManager.invalidate(c.env, token)
    return c.json({ status: 'deleted' })
  },
}
