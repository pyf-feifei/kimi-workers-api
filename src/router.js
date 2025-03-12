import { handleException, APIException, EXCEPTIONS } from './exceptions.js'
import { tokenSplit, sample } from './utils.js'
import * as chat from './chat.js'

// 处理聊天补全请求
async function handleChatCompletions(request, env) {
  try {
    // 验证请求方法
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 })
    }

    // 获取Authorization头并验证
    const authorization = request.headers.get('Authorization')
    if (!authorization) {
      throw new APIException(
        EXCEPTIONS.API_REQUEST_PARAMS_INVALID,
        '缺少Authorization头'
      )
    }

    // 解析请求体
    const body = await request.json()

    // 验证必要参数
    if (!body.messages || !Array.isArray(body.messages)) {
      throw new APIException(
        EXCEPTIONS.API_REQUEST_PARAMS_INVALID,
        '缺少messages参数或格式错误'
      )
    }

    // 验证conversation_id
    if (
      body.conversation_id !== undefined &&
      typeof body.conversation_id !== 'string'
    ) {
      throw new APIException(
        EXCEPTIONS.API_REQUEST_PARAMS_INVALID,
        'conversation_id必须为字符串'
      )
    }

    const {
      model = 'moonshot-v1',
      conversation_id: convId,
      messages,
      stream = false,
      use_search = false,
    } = body

    // 使用自己实现的sample函数随机选择token
    const token = sample(tokenSplit(authorization))

    const modelName = use_search ? 'moonshot-v1-vision' : model

    if (stream) {
      const streamResponse = await chat.createCompletionStream(
        modelName,
        messages,
        token,
        convId,
        env
      )
      return new Response(streamResponse, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      })
    }

    const result = await chat.createCompletion(
      modelName,
      messages,
      token,
      convId,
      env
    )
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('处理聊天补全请求时出错:', error)
    return handleException(error)
  }
}

// 处理模型列表请求
function handleModelsList() {
  const models = {
    data: [
      {
        id: 'moonshot-v1',
        object: 'model',
        created: 1677610602,
        owned_by: 'kimi-free-api',
      },
      {
        id: 'moonshot-v1-8k',
        object: 'model',
        created: 1677610602,
        owned_by: 'kimi-free-api',
      },
      {
        id: 'moonshot-v1-32k',
        object: 'model',
        created: 1677610602,
        owned_by: 'kimi-free-api',
      },
      {
        id: 'moonshot-v1-128k',
        object: 'model',
        created: 1677610602,
        owned_by: 'kimi-free-api',
      },
      {
        id: 'moonshot-v1-vision',
        object: 'model',
        created: 1677610602,
        owned_by: 'kimi-free-api',
      },
    ],
    object: 'list',
  }

  return new Response(JSON.stringify(models), {
    headers: { 'Content-Type': 'application/json' },
  })
}

// 处理Token检查请求
async function handleTokenCheck(request, env) {
  try {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 })
    }

    const body = await request.json()
    if (!body.token || typeof body.token !== 'string') {
      throw new APIException(
        EXCEPTIONS.API_REQUEST_PARAMS_INVALID,
        '缺少token参数或格式错误'
      )
    }

    const isLive = await chat.checkTokenLive(body.token, env)
    return new Response(JSON.stringify({ live: isLive }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('处理Token检查请求时出错:', error)
    return handleException(error)
  }
}

// 处理欢迎页面
function handleWelcome() {
  const html = `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8"/>
    <title>🚀 服务已启动</title>
  </head>
  <body>
    <p>kimi-workers-api已启动！<br>请通过LobeChat / NextChat / Dify等客户端或OpenAI SDK接入！</p>
  </body>
</html>
  `

  return new Response(html, {
    headers: { 'Content-Type': 'text/html' },
  })
}

// 处理ping请求
function handlePing() {
  return new Response(JSON.stringify({ status: 'ok' }), {
    headers: { 'Content-Type': 'application/json' },
  })
}

// 路由处理函数可以使用对象映射简化
export async function handleRequest(request, env) {
  const url = new URL(request.url)
  const path = url.pathname

  // 使用对象映射代替if-else链
  const routes = {
    '/': handleWelcome,
    '/v1/chat/completions': () => handleChatCompletions(request, env),
    '/v1/models': handleModelsList,
    '/token/check': () => handleTokenCheck(request, env),
    '/ping': handlePing,
  }

  // 查找并执行路由处理函数，或返回404
  const handler = routes[path]
  return handler ? await handler() : new Response('Not Found', { status: 404 })
}
