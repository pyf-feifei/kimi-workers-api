import * as cache from './cache.js';

export async function getAccessToken(refreshToken, env) {
  // 使用内存缓存
  const cacheKey = `token:${refreshToken}`;
  const cachedToken = cache.get(cacheKey);
  
  if (cachedToken) {
    console.log('使用缓存的访问令牌');
    return cachedToken;
  }

  console.log('请求新的访问令牌');
  // 请求新token
  const response = await fetch(
    'https://kimi.moonshot.cn/api/auth/token/refresh',
    {
      method: 'POST', // 需要明确指定POST方法
      headers: {
        Authorization: `Bearer ${refreshToken}`,
        Referer: 'https://kimi.moonshot.cn/',
        'Content-Type': 'application/json' // 必须添加内容类型
      },
    }
  )

  if (!response.ok) throw new Error('Failed to refresh token');

  const tokenData = await response.json();
  
  // 缓存令牌，有效期24小时
  cache.set(cacheKey, tokenData, 24 * 60 * 60 * 1000);
  
  return tokenData;
}
