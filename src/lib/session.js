import { Config } from './config'
import { CryptoService } from './crypto'

export class SessionManager {
  static SESSION_PREFIX = 'sess_'
  static TTL = 3600 // 1小时有效期

  /**
   * 创建新会话
   * @param env 环境变量
   * @param messages 消息历史
   * @param usage 令牌使用情况
   */
  static async create(env, messages, usage) {
    const sessionId = this.SESSION_PREFIX + crypto.randomUUID()
    const sessionData = {
      id: sessionId,
      messages: await this.encryptMessages(env, messages),
      created: Date.now(),
      expires: Date.now() + this.TTL * 1000,
      token_usage: usage || {
        model: '',
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      },
    }

    await env.SESSION_STORE.put(sessionId, JSON.stringify(sessionData), {
      expirationTtl: this.TTL,
    })

    return sessionData
  }

  /**
   * 获取会话数据
   * @param env 环境变量
   * @param sessionId 会话ID
   */
  static async get(env, sessionId) {
    try {
      const data = await env.SESSION_STORE.get(sessionId)
      if (!data) return null

      const session = JSON.parse(data)
      session.messages = await this.decryptMessages(env, session.messages)
      return session
    } catch (err) {
      console.error('Session parse error:', err)
      return null
    }
  }

  /**
   * 更新会话消息
   * @param env 环境变量
   * @param sessionId 会话ID
   * @param messages 新消息列表
   */
  static async update(env, sessionId, messages) {
    const existing = await this.get(env, sessionId)
    if (!existing) return false

    try {
      await env.SESSION_STORE.put(
        sessionId,
        JSON.stringify({
          ...existing,
          messages: await this.encryptMessages(env, messages),
          expires: Date.now() + this.TTL * 1000,
        }),
        { expirationTtl: this.TTL }
      )
      return true
    } catch (err) {
      console.error('Session update failed:', err)
      return false
    }
  }

  /**
   * 清理过期会话
   * @param env 环境变量
   */
  static async cleanup(env) {
    try {
      const { keys } = await env.SESSION_STORE.list()
      const now = Date.now()
      let count = 0

      for (const key of keys) {
        const session = await this.get(env, key.name)
        if (session && session.expires < now) {
          await env.SESSION_STORE.delete(key.name)
          count++
        }
      }
      return count
    } catch (err) {
      console.error('Session cleanup error:', err)
      return 0
    }
  }

  // 加密消息内容
  static async encryptMessages(env, messages) {
    return Promise.all(
      messages.map(async (msg) => ({
        ...msg,
        content: await CryptoService.encryptToken(msg.content, env),
      }))
    )
  }

  // 解密消息内容
  static async decryptMessages(env, messages) {
    return Promise.all(
      messages.map(async (msg) => ({
        ...msg,
        content: await CryptoService.decryptToken(msg.content, env),
      }))
    )
  }
}
