export async function handleRequest(request, env) {
  const url = new URL(request.url)

  if (url.pathname !== '/v1/chat/completions') {
    return notFoundResponse()
  }

  const refreshToken = getRefreshToken(request)
  if (!refreshToken) {
    return unauthorizedResponse()
  }

  const { accessToken } = await getAccessToken(refreshToken, env)
  return proxyToKimiAPI(request, accessToken, env.KIMI_BASE_URL)
}

function getRefreshToken(request) {
  const authHeader = request.headers.get('Authorization') || ''
  return authHeader.replace('Bearer ', '')
}

// 响应处理函数
function notFoundResponse() {
  return new Response(JSON.stringify({ error: 'Endpoint not found' }), {
    status: 404,
  })
}

function unauthorizedResponse() {
  return new Response(
    JSON.stringify({ error: 'Missing Authorization header' }),
    { status: 401 }
  )
}

// 新增代理转发功能
export async function proxyToKimiAPI(request, accessToken, baseUrl) {
  const headers = new Headers(request.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);
  headers.set('Referer', 'https://kimi.moonshot.cn/');

  return fetch(`${baseUrl}/chat/completions`, {
    method: request.method,
    headers: headers,
    body: request.body
  });
}
