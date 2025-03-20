import { getAccessToken } from './token.js';

export async function handleRequest(request, env) {
  const url = new URL(request.url);
  
  // 处理 OPTIONS 请求，支持 CORS
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  // 修改：放宽路径匹配条件，支持更多路径格式
  if (!url.pathname.includes('/v1/chat/completions')) {
    return notFoundResponse();
  }

  // 确保支持 POST 方法
  if (request.method !== 'POST') {
    return new Response(
      JSON.stringify({ 
        error_type: "method.not.allowed", 
        message: "Method Not Allowed", 
        detail: "Only POST method is supported" 
      }),
      { 
        status: 405,
        headers: { 
          'Content-Type': 'application/json',
          'Allow': 'POST, OPTIONS',
          'Access-Control-Allow-Origin': '*' // 添加CORS头
        }
      }
    );
  }

  const refreshToken = getRefreshToken(request);
  if (!refreshToken) {
    return unauthorizedResponse();
  }

  try {
    const { accessToken } = await getAccessToken(refreshToken, env);
    return proxyToKimiAPI(request, accessToken, env.KIMI_BASE_URL || 'https://kimi.moonshot.cn');
  } catch (error) {
    console.error('获取访问令牌失败:', error);
    return new Response(
      JSON.stringify({ error: '获取访问令牌失败', detail: error.message }),
      { 
        status: 500,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*' // 添加CORS头
        }
      }
    );
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
// 修改代理转发功能，增强对 Cloudflare Workers 的兼容性
export async function proxyToKimiAPI(request, accessToken, baseUrl) {
  // 创建新的请求头，确保不会传递不兼容的头部
  const headers = new Headers();
  
  // 只复制必要的请求头
  for (const [key, value] of request.headers.entries()) {
    if (key.toLowerCase() !== 'host' && 
        key.toLowerCase() !== 'connection' && 
        key.toLowerCase() !== 'content-length') {
      headers.set(key, value);
    }
  }
  
  headers.set('Authorization', `Bearer ${accessToken}`);
  headers.set('Referer', 'https://kimi.moonshot.cn/');
  headers.set('Content-Type', 'application/json');
  
  // 检查是否为流式请求
  let isStreamRequest = false;
  let requestBody = null;
  
  try {
    const clonedRequest = request.clone();
    requestBody = await clonedRequest.json();
    isStreamRequest = requestBody.stream === true;
  } catch (error) {
    console.error('解析请求体失败:', error);
    return new Response(
      JSON.stringify({ error: '解析请求体失败', detail: error.message }),
      { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
  
  // 修正URL拼接，避免重复的/api
  const apiUrl = baseUrl.endsWith('/api') 
    ? `${baseUrl}/chat/completions` 
    : `${baseUrl}/api/chat/completions`;
  
  console.log('请求Kimi API:', apiUrl);
  
  // 使用原始请求体重新构建请求
  const response = await fetch(apiUrl, {
    method: 'POST', // 明确指定POST方法
    headers: headers,
    body: JSON.stringify(requestBody)
  });

  // 如果响应不成功，记录详细错误
  if (!response.ok) {
    console.error('Kimi API 响应异常:', {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      url: apiUrl
    });
    
    const errorText = await response.text();
    console.error('响应内容:', errorText);
    
    return new Response(
      JSON.stringify({ 
        error: "调用Kimi API失败", 
        status: response.status,
        detail: errorText 
      }),
      { 
        status: response.status,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*' // 添加CORS头
        }
      }
    );
  }

  // 如果是流式请求，设置正确的响应头
  if (isStreamRequest) {
    const responseHeaders = new Headers(response.headers);
    responseHeaders.set('Content-Type', 'text/event-stream');
    responseHeaders.set('Cache-Control', 'no-cache');
    responseHeaders.set('Connection', 'keep-alive');
    responseHeaders.set('Access-Control-Allow-Origin', '*'); // 添加CORS头
    
    // 创建并返回流式响应
    return new Response(response.body, {
      headers: responseHeaders,
      status: response.status,
      statusText: response.statusText
    });
  }
  
  // 非流式请求直接返回
  const responseHeaders = new Headers(response.headers);
  responseHeaders.set('Access-Control-Allow-Origin', '*'); // 添加CORS头
  
  return new Response(response.body, {
    headers: responseHeaders,
    status: response.status,
    statusText: response.statusText
  });
}
