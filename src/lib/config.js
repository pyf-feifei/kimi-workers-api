// 安全获取加密密钥
export class Config {
  static getSecret(env) {
    const secret = env.CRYPTO_SECRET
    if (!secret || secret.length < 32) {
      throw new Error('CRYPTO_SECRET必须为至少32位字符')
    }
    return new TextEncoder().encode(secret.padEnd(32, '0').slice(0, 32))
  }

  // 获取基础API地址
  static getBaseUrl(env) {
    return env.KIMI_BASE_URL || 'https://api.moonshot.cn'
  }

  // 获取环境配置
  static getRuntimeConfig(env) {
    return {
      isProduction: env.API_MODE === 'production',
      maxRPM: Number(env.MAX_RPM) || 1000,
    }
  }

  // 数据库连接参数
  static getDatabaseConfig() {
    return {
      prepare: (db) => {
        db.prepare(`CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          data TEXT,
          expires INTEGER
        )`)
      },
    }
  }

  // 请求头验证配置
  static getHeaderRules() {
    return {
      requiredHeaders: ['Content-Type', 'Authorization'],
      contentTypes: ['application/json', 'text/event-stream'],
    }
  }
}
