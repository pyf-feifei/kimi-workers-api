import { Context } from 'hono'
import { CryptoService } from '../lib/crypto'
import { TokenManager } from '../handlers/token'

export async function authMiddleware(c, next) {
  try {
    // 从Header提取认证信息
    const authHeader = c.req.header('Authorization') || ''
    const [scheme, token] = authHeader.split(' ')

    // 验证认证方案
    if (scheme !== 'Bearer' || !token) {
      return errorResponse(c, 401, 'invalid_auth_scheme')
    }

    // 验证令牌格式
    if (!/^ki-[A-Za-z0-9]{32}$/.test(token)) {
      return errorResponse(c, 401, 'invalid_token_format')
    }

    // 解密并验证令牌
    const validToken = await TokenManager.validate(c, token)
    if (!validToken) {
      return errorResponse(c, 403, 'invalid_token')
    }

    // 更新令牌最后使用时间
    await TokenManager.updateUsage(c.env, token)

    await next()
  } catch (err) {
    console.error(`Auth middleware error: ${err.message}`)
    return errorResponse(c, 500, 'internal_error', err.message)
  }
}

// 统一错误响应
function errorResponse(c, code, type, detail) {
  const error = {
    code,
    message: getErrorMessage(type),
    type,
    ...(detail && { detail }),
  }
  return c.json(error, code)
}

// 错误信息映射
function getErrorMessage(type) {
  const messages = {
    invalid_auth_scheme: 'Authorization头格式应为Bearer <token>',
    invalid_token_format: '令牌格式应为ki-前缀+32位字符',
    invalid_token: '无效或过期的访问令牌',
    rate_limit: '请求过于频繁',
    internal_error: '服务器内部错误',
  }
  return messages[type] || '未知错误'
}

// 实现令牌使用更新
TokenManager.updateUsage = async (env, token) => {
  const config = await TokenManager.getTokenConfig(env, token)
  if (config) {
    config.last_used = Date.now()
    config.usage_count += 1
    await env.TOKEN_CACHE.put(token, JSON.stringify(config))
  }
}
