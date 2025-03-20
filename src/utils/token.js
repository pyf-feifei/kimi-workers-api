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
  
  try {
    // 请求新token - 修改为GET方法
    const response = await fetch(
      'https://kimi.moonshot.cn/api/auth/token/refresh',
      {
        method: 'GET', // 从POST改为GET方法
        headers: {
          Authorization: `Bearer ${refreshToken}`,
          Referer: 'https://kimi.moonshot.cn/',
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`刷新令牌失败: ${response.status}`, errorText);
      throw new Error(`Failed to refresh token: ${response.status} ${errorText}`);
    }

    const tokenData = await response.json();
    
    // 缓存令牌，有效期24小时
    cache.set(cacheKey, tokenData, 24 * 60 * 60 * 1000);
    
    return tokenData;
  } catch (error) {
    console.error('刷新令牌时发生错误:', error);
    throw error;
  }
}
