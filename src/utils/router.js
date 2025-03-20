import { getAccessToken } from './token.js'
import * as cache from './cache.js'

export async function handleRequest(request, env) {
  const url = new URL(request.url)

  // 处理 OPTIONS 请求，支持 CORS
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
      },
    })
  }

  // 修改：放宽路径匹配条件，支持更多路径格式
  if (!url.pathname.includes('/v1/chat/completions')) {
    return notFoundResponse()
  }

  // 确保支持 POST 方法
  if (request.method !== 'POST') {
    return new Response(
      JSON.stringify({
        error_type: 'method.not.allowed',
        message: 'Method Not Allowed',
        detail: 'Only POST method is supported',
      }),
      {
        status: 405,
        headers: {
          'Content-Type': 'application/json',
          Allow: 'POST, OPTIONS',
          'Access-Control-Allow-Origin': '*',
        },
      }
    )
  }

  const refreshToken = getRefreshToken(request)
  if (!refreshToken) {
    return unauthorizedResponse()
  }

  try {
    // 直接使用 refreshToken 获取 accessToken
    const accessToken = await getKimiAccessToken(refreshToken)

    if (!accessToken) {
      return new Response(
        JSON.stringify({
          error: '获取访问令牌失败',
          detail: 'Invalid refresh token',
        }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      )
    }

    // 使用新的直接请求方法
    return directKimiRequest(request, accessToken)
  } catch (error) {
    console.error('处理请求失败:', error)
    return new Response(
      JSON.stringify({ error: '服务内部错误', detail: error.message }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    )
  }
}

function getRefreshToken(request) {
  const authHeader = request.headers.get('Authorization') || ''
  return authHeader.replace('Bearer ', '')
}

// 响应处理函数
function notFoundResponse() {
  return new Response(JSON.stringify({ error: 'Endpoint not found' }), {
    status: 404,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  })
}

function unauthorizedResponse() {
  return new Response(
    JSON.stringify({ error: 'Missing Authorization header' }),
    {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    }
  )
}

// 直接从 Kimi 获取 accessToken
async function getKimiAccessToken(refreshToken) {
  // 使用缓存
  const cacheKey = `token:${refreshToken}`
  const cachedToken = cache.get(cacheKey)

  if (cachedToken) {
    console.log('使用缓存的访问令牌')
    return cachedToken.accessToken
  }

  console.log('请求新的访问令牌，token长度:', refreshToken.length)

  try {
    // 尝试直接使用提供的令牌作为访问令牌
    console.log('尝试直接使用传入的令牌作为访问令牌')

    // 先尝试验证令牌是否有效 - 使用 Kimi 的模型列表 API 测试
    const testResponse = await fetch(
      'https://kimi.moonshot.cn/api/chat/models',
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${refreshToken}`,
          Referer: 'https://kimi.moonshot.cn/',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          Accept: 'application/json',
        },
      }
    )

    // 如果令牌有效，直接使用
    if (testResponse.ok) {
      console.log('传入的令牌有效，直接使用')
      // 缓存令牌，有效期30分钟
      cache.set(cacheKey, { accessToken: refreshToken }, 30 * 60 * 1000)
      return refreshToken
    }

    console.log('传入的令牌不能直接使用，尝试其他方法')

    // 尝试使用 Kimi 的新认证方式
    // 1. 尝试使用 cookie 认证
    const cookieResponse = await fetch(
      'https://kimi.moonshot.cn/api/auth/token',
      {
        method: 'GET',
        headers: {
          Cookie: `refresh_token=${refreshToken}`,
          Referer: 'https://kimi.moonshot.cn/',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          Accept: 'application/json',
        },
      }
    )

    if (cookieResponse.ok) {
      const cookieTokenData = await cookieResponse.json()
      console.log('通过 cookie 获取到令牌')
      cache.set(cacheKey, cookieTokenData, 60 * 60 * 1000)
      return cookieTokenData.accessToken
    }

    // 2. 尝试使用标准的 refresh token 方式
    const response = await fetch(
      'https://kimi.moonshot.cn/api/auth/token/refresh',
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${refreshToken}`,
          Referer: 'https://kimi.moonshot.cn/',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          Accept: 'application/json',
        },
      }
    )

    // 记录响应状态和头信息，帮助调试
    console.log('刷新令牌响应状态:', response.status, response.statusText)

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`刷新令牌失败: ${response.status}`, errorText)

      // 3. 尝试解析 JWT 令牌，提取有用信息
      try {
        // 解析 JWT 令牌的 payload 部分
        const parts = refreshToken.split('.')
        if (parts.length === 3) {
          const payload = JSON.parse(atob(parts[1]))
          console.log('JWT 令牌信息:', JSON.stringify(payload))

          // 如果令牌包含 sub 字段，尝试使用它
          if (payload.sub) {
            console.log('尝试使用 sub 字段作为用户 ID')

            // 尝试使用用户 ID 获取令牌
            const userResponse = await fetch(
              `https://kimi.moonshot.cn/api/auth/token/user/${payload.sub}`,
              {
                method: 'GET',
                headers: {
                  Referer: 'https://kimi.moonshot.cn/',
                  'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                  Accept: 'application/json',
                },
              }
            )

            if (userResponse.ok) {
              const userData = await userResponse.json()
              if (userData.accessToken) {
                cache.set(cacheKey, userData, 60 * 60 * 1000)
                return userData.accessToken
              }
            }
          }
        }
      } catch (jwtError) {
        console.error('解析 JWT 令牌失败:', jwtError)
      }

      return null
    }

    const tokenData = await response.json()
    console.log('获取到新的令牌数据:', Object.keys(tokenData).join(', '))

    // 缓存令牌，有效期1小时
    cache.set(cacheKey, tokenData, 60 * 60 * 1000)

    return tokenData.accessToken
  } catch (error) {
    console.error('刷新令牌时发生错误:', error)
    return null
  }
}

// 直接请求 Kimi API
async function directKimiRequest(originalRequest, accessToken) {
  try {
    // 解析原始请求体
    const requestData = await originalRequest.json()
    console.log('请求数据:', JSON.stringify(requestData))

    // 检查是否为流式请求
    const isStreamRequest = requestData.stream === true

    // 构建 Kimi API 请求
    const kimiRequest = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        Referer: 'https://kimi.moonshot.cn/',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        Origin: 'https://kimi.moonshot.cn',
      },
      body: JSON.stringify({
        model: requestData.model || 'moonshot-v1-8k',
        messages: requestData.messages || [],
        stream: isStreamRequest,
        temperature: requestData.temperature || 0.7,
        max_tokens: requestData.max_tokens || 2048,
      }),
    }

    console.log(
      '发送请求到 Kimi API，使用令牌:',
      accessToken.substring(0, 10) + '...'
    )

    // 发送请求到 Kimi API
    const kimiResponse = await fetch(
      'https://kimi.moonshot.cn/api/chat/completions',
      kimiRequest
    )

    console.log(
      'Kimi API 响应状态:',
      kimiResponse.status,
      kimiResponse.statusText
    )

    if (!kimiResponse.ok) {
      const errorText = await kimiResponse.text()
      console.error('Kimi API 响应异常:', {
        status: kimiResponse.status,
        statusText: kimiResponse.statusText,
        error: errorText,
      })

      // 如果是 401 错误，可能是令牌已过期
      if (kimiResponse.status === 401) {
        console.log('令牌可能已过期，清除缓存')
        // 清除缓存中的令牌
        const cacheKey = `token:${accessToken}`
        cache.remove(cacheKey)
      }

      return new Response(
        JSON.stringify({
          error: '调用Kimi API失败',
          status: kimiResponse.status,
          detail: errorText,
        }),
        {
          status: kimiResponse.status,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      )
    }

    // 处理响应
    if (isStreamRequest) {
      // 流式响应
      const responseHeaders = new Headers()
      responseHeaders.set('Content-Type', 'text/event-stream')
      responseHeaders.set('Cache-Control', 'no-cache')
      responseHeaders.set('Connection', 'keep-alive')
      responseHeaders.set('Access-Control-Allow-Origin', '*')

      return new Response(kimiResponse.body, {
        headers: responseHeaders,
        status: 200,
      })
    } else {
      // 非流式响应
      const responseData = await kimiResponse.json()

      return new Response(JSON.stringify(responseData), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      })
    }
  } catch (error) {
    console.error('处理请求时发生错误:', error)
    return new Response(
      JSON.stringify({ error: '处理请求失败', detail: error.message }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    )
  }
}
