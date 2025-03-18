export async function getAccessToken(refreshToken, env) {
  // 检查缓存
  const cachedToken = await env.TOKEN_CACHE.get(refreshToken)
  if (cachedToken) return JSON.parse(cachedToken)

  // 请求新token
  const response = await fetch(
    'https://kimi.moonshot.cn/api/auth/token/refresh',
    {
      headers: {
        Authorization: `Bearer ${refreshToken}`,
        Referer: 'https://kimi.moonshot.cn/',
      },
    }
  )

  if (!response.ok) throw new Error('Failed to refresh token')

  const tokenData = await response.json()
  await cacheToken(env, refreshToken, tokenData)
  return tokenData
}

// 修改缓存方法保留 TTL 设置
async function cacheToken(env, refreshToken, tokenData) {
  await env.TOKEN_CACHE.put(
    refreshToken,
    JSON.stringify(tokenData),
    { expirationTtl: 86400 } // 新版缺失此设置需保留
  )
}
