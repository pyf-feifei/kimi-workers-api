import { getAccessToken } from './token.js';

export async function handleRequest(request, env) {
  const url = new URL(request.url)

  if (url.pathname !== '/v1/chat/completions') {
    return notFoundResponse()
  }

  const refreshToken = getRefreshToken(request)
  if (!refreshToken) {
    return unauthorizedResponse()
  }

  try {
    const { accessToken } = await getAccessToken(refreshToken, env)
    return proxyToKimiAPI(request, accessToken, env.KIMI_BASE_URL)
  } catch (error) {
    console.error('获取访问令牌失败:', error)
    return new Response(
      JSON.stringify({ error: '获取访问令牌失败' }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
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
    headers: { 'Content-Type': 'application/json' }
  })
}

function unauthorizedResponse() {
  return new Response(
    JSON.stringify({ error: 'Missing Authorization header' }),
    { 
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    }
  )
}

// 新增代理转发功能，支持流式响应
export async function proxyToKimiAPI(request, accessToken, baseUrl) {
  const headers = new Headers(request.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);
  headers.set('Referer', 'https://kimi.moonshot.cn/');
  
  // 检查是否为流式请求
  let isStreamRequest = false;
  try {
    const clonedRequest = request.clone();
    const requestBody = await clonedRequest.json();
    isStreamRequest = requestBody.stream === true;
  } catch (error) {
    console.error('解析请求体失败:', error);
  }

  // 发送请求到Kimi API
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: request.method,
    headers: headers,
    body: request.body
  });

  // 如果响应不成功，直接返回响应
  if (!response.ok) {
    return response;
  }

  // 如果是流式请求，设置正确的响应头
  if (isStreamRequest) {
    const responseHeaders = new Headers(response.headers);
    responseHeaders.set('Content-Type', 'text/event-stream');
    responseHeaders.set('Cache-Control', 'no-cache');
    responseHeaders.set('Connection', 'keep-alive');
    
    // 创建并返回流式响应
    return new Response(response.body, {
      headers: responseHeaders,
      status: response.status,
      statusText: response.statusText
    });
  }
  
  // 非流式请求直接返回
  return response;
}
