import { Config } from './config'
import { nanoid } from 'nanoid'

export class CryptoService {
  /**
   * AES-GCM加密算法
   * @param token 原始令牌
   * @param env 环境变量
   * @returns 格式: iv.encryptedData
   */
  static async encryptToken(token, env) {
    try {
      const key = await crypto.subtle.importKey(
        'raw',
        Config.getSecret(env),
        { name: 'AES-GCM' },
        false,
        ['encrypt']
      )

      const iv = crypto.getRandomValues(new Uint8Array(12))
      const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        new TextEncoder().encode(token)
      )

      return `${Array.from(iv).join('.')}.${Array.from(
        new Uint8Array(encrypted)
      ).join('.')}`
    } catch (err) {
      throw new Error(`加密失败: ${err.message}`)
    }
  }

  /**
   * AES-GCM解密算法
   * @param encryptedText 加密文本 (iv.encryptedData)
   * @param env 环境变量
   */
  static async decryptToken(encryptedText, env) {
    try {
      const [ivPart, dataPart] = encryptedText.split('.', 2)
      const iv = Uint8Array.from(ivPart.split('.').map(Number))
      const encrypted = Uint8Array.from(dataPart.split('.').map(Number))

      const key = await crypto.subtle.importKey(
        'raw',
        Config.getSecret(env),
        { name: 'AES-GCM' },
        false,
        ['decrypt']
      )

      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        encrypted
      )

      return new TextDecoder().decode(decrypted)
    } catch (err) {
      throw new Error(`解密失败: ${err.message}`)
    }
  }

  /**
   * 生成随机安全令牌
   * @param prefix 令牌前缀 (默认: ki-)
   * @param length 令牌长度 (默认: 32)
   */
  static generateSecureToken(prefix = 'ki-', length = 32) {
    return prefix + nanoid(length)
  }

  /**
   * 生成SHA-256哈希
   * @param data 原始数据
   */
  static async hashSHA256(data) {
    const buffer = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(data)
    )
    return Array.from(new Uint8Array(buffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  }
}
