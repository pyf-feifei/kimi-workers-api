import { APIException, EXCEPTIONS } from './exceptions.js'
import { generateCookie, unixTimestamp, sample, tokenSplit } from './utils.js'

// 模型名称
const MODEL_NAME = 'moonshot-v1'
// 设备ID
const DEVICE_ID = Math.random() * 999999999999999999 + 7000000000000000000
// SessionID
const SESSION_ID = Math.random() * 99999999999999999 + 1700000000000000000
// 最大重试次数
const MAX_RETRY_COUNT = 3
// 伪装headers
const FAKE_HEADERS = {
  Accept: '*/*',
  'Accept-Encoding': 'gzip, deflate, br, zstd',
  'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
  Cookie: generateCookie(),
  'R-Timezone': 'Asia/Shanghai',
  'Sec-Ch-Ua':
    '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Priority: 'u=1, i',
  'X-Msh-Device-Id': `${DEVICE_ID}`,
  'X-Msh-Platform': 'web',
  'X-Msh-Session-Id': `${SESSION_ID}`,
}

// 检查API结果
function checkResult(result, refreshToken) {
  // 添加422错误处理
  if (result.status === 422) {
    console.error('API Validation Error:', result.data)
    throw new APIException(
      EXCEPTIONS.API_REQUEST_PARAMS_INVALID,
      `参数验证失败: ${JSON.stringify(result.data)}`
    )
  }

  if (result.status !== 200) {
    console.error('API Response:', {
      status: result.status,
      statusText: result.statusText,
      data: result.data,
    })
    throw new APIException(
      EXCEPTIONS.API_REQUEST_FAILED,
      `请求失败: ${result.status} ${result.statusText || '请求参数错误'}`
    )
  }

  // 身份验证失败
  if (
    result.data &&
    (result.data.code === 40100 || result.data.code === 40101)
  ) {
    console.error(`API token expired: ${refreshToken}`)
    throw new APIException(EXCEPTIONS.API_TOKEN_EXPIRES, 'Token已过期')
  }

  return result.data || result
}

// 请求access_token
async function requestToken(refreshToken, env) {
  const tokenResult = await fetch(`${env.BASE_URL}/api/auth/token/refresh`, {
    headers: {
      Authorization: refreshToken,
      ...FAKE_HEADERS,
    },
  })

  const tokenData = await tokenResult.json()

  // JWT token 直接返回
  if (refreshToken.startsWith('eyJ')) {
    return {
      userId: tokenData?.abstract_user_id || 'default_user',
      accessToken: refreshToken,
      refreshToken,
      refreshTime: unixTimestamp() + 3600,
    }
  }

  // 常规 token 处理
  const { access_token, refresh_token } = checkResult(
    { status: tokenResult.status, data: tokenData },
    refreshToken
  )

  const { data: userData } = await fetch(`${env.BASE_URL}/api/user`, {
    headers: {
      Authorization: access_token,
      ...FAKE_HEADERS,
    },
  }).then((res) => res.json())

  if (!userData?.id) {
    throw new APIException(EXCEPTIONS.API_REQUEST_FAILED, '获取用户信息失败')
  }

  return {
    userId: userData.id,
    accessToken: access_token,
    refreshToken: refresh_token,
    refreshTime: unixTimestamp() + 300,
  }
}

// 创建会话
async function createConversation(model, name, refreshToken, authData, env) {
  const { accessToken, userId } = authData

  const response = await fetch(`${env.BASE_URL}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'X-Traffic-Id': userId,
      ...FAKE_HEADERS,
    },
    body: JSON.stringify({
      enter_method: 'new_chat',
      is_example: false,
      kimiplus_id: /^[0-9a-z]{20}$/.test(model) ? model : 'moonshot-v1',
      name,
    }),
  })

  const data = await response.json()
  const result = checkResult({ status: response.status, data }, refreshToken)
  return result.id
}

// 移除会话
async function removeConversation(convId, refreshToken, authData, env) {
  const { accessToken, userId } = authData

  const response = await fetch(`${env.BASE_URL}/api/chat/${convId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'X-Traffic-Id': userId,
      ...FAKE_HEADERS,
    },
  })

  const data = await response.json()
  return checkResult({ status: response.status, data }, refreshToken)
}

// 对话补全
async function createCompletion(model, messages, refreshToken, convId, env) {
  try {
    // 获取token
    const authData = await requestToken(refreshToken, env)

    // 创建会话ID，如果没有提供
    let conversationId = convId
    if (!conversationId) {
      conversationId = await createConversation(
        model,
        'API对话',
        refreshToken,
        authData,
        env
      )
    }

    // 构建提示词
    let prompt = ''
    for (const message of messages) {
      const role = message.role === 'assistant' ? 'assistant' : 'user'
      let content = message.content

      // 处理复杂内容类型
      if (Array.isArray(content)) {
        let textParts = []
        for (const part of content) {
          if (part.type === 'text') {
            textParts.push(part.text)
          }
          // 注意: Workers环境下文件处理会有所不同，此处简化处理
          else if (part.type === 'file') {
            textParts.push(`[已上传文件: ${part.file_url.url}]`)
          }
        }
        content = textParts.join('\n')
      }

      prompt += `${role === 'user' ? 'user' : 'assistant'}: ${content}\n`
    }

    // 修改请求体格式
    const response = await fetch(
      `${env.BASE_URL}/api/chat/${conversationId}/completion`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authData.accessToken,
          'X-Traffic-Id': authData.userId,
          ...FAKE_HEADERS,
        },
        body: JSON.stringify({
          kimiplus_id: /^[0-9a-z]{20}$/.test(model) ? model : 'moonshot-v1',
          messages: [
            {
              role: 'user',
              content: prompt.trim(),
            },
          ],
          refs: [],
          refs_file: [],
          use_search: model.includes('vision'),
          extend: { sidebar: true },
        }),
      }
    )

    // 检查响应状态
    if (!response.ok) {
      const errorText = await response.text()
      throw new APIException(
        EXCEPTIONS.API_REQUEST_FAILED,
        `请求失败: ${response.status} ${errorText}`
      )
    }

    // 解析响应
    const data = await response.json()

    // 处理响应数据
    return {
      id: conversationId,
      model: model,
      object: 'chat.completion',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: data.text || '',
          },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 1,
        completion_tokens: 1,
        total_tokens: 2,
      },
      created: unixTimestamp(),
    }
  } catch (error) {
    console.error('创建对话补全时出错:', error)
    throw error
  }
}

// 创建流式对话补全
async function createCompletionStream(
  model,
  messages,
  refreshToken,
  convId,
  env
) {
  try {
    // 获取token
    const authData = await requestToken(refreshToken, env)

    // 创建会话ID，如果没有提供
    let conversationId = convId
    if (!conversationId) {
      conversationId = await createConversation(
        model,
        'API对话',
        refreshToken,
        authData,
        env
      )
    }

    // 构建提示词
    let prompt = ''
    for (const message of messages) {
      const role = message.role === 'assistant' ? 'assistant' : 'user'
      let content = message.content

      // 处理复杂内容类型
      if (Array.isArray(content)) {
        let textParts = []
        for (const part of content) {
          if (part.type === 'text') {
            textParts.push(part.text)
          } else if (part.type === 'file') {
            textParts.push(`[已上传文件: ${part.file_url.url}]`)
          }
        }
        content = textParts.join('\n')
      }

      prompt += `${role === 'user' ? 'user' : 'assistant'}: ${content}\n`
    }

    // 修改请求体格式
    const response = await fetch(
      `${env.BASE_URL}/api/chat/${conversationId}/completion/stream`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authData.accessToken,
          'X-Traffic-Id': authData.userId,
          ...FAKE_HEADERS,
        },
        body: JSON.stringify({
          kimiplus_id: /^[0-9a-z]{20}$/.test(model) ? model : 'moonshot-v1',
          messages: [
            {
              role: 'user',
              content: prompt.trim(),
            },
          ],
          refs: [],
          refs_file: [],
          use_search: model.includes('vision'),
          extend: { sidebar: true },
        }),
      }
    )

    // 检查响应状态
    if (!response.ok) {
      const errorText = await response.text()
      throw new APIException(
        EXCEPTIONS.API_REQUEST_FAILED,
        `请求失败: ${response.status} ${errorText}`
      )
    }

    // 准备流式传输转换函数
    const created = unixTimestamp()
    const silentSearch = false // 移除silent模式
    let webSearchCount = 0
    let searchFlag = false
    let segmentId = ''

    // 转换原始SSE流为OpenAI兼容格式
    const transformStream = new TransformStream({
      start(controller) {
        // 发送初始消息
        const initialMessage = JSON.stringify({
          id: conversationId,
          model,
          object: 'chat.completion.chunk',
          choices: [
            {
              index: 0,
              delta: { role: 'assistant', content: '' },
              finish_reason: null,
            },
          ],
          segment_id: '',
          created,
        })
        controller.enqueue(`data: ${initialMessage}\n\n`)
      },

      transform(chunk, controller) {
        // 处理每个数据块
        const lines = chunk.split('\n')
        for (const line of lines) {
          if (!line.startsWith('data:')) continue

          try {
            const eventData = line.substring(5).trim()
            if (!eventData) continue

            const data = JSON.parse(eventData)

            // 处理不同类型的事件
            if (data.event === 'cmpl' && data.text) {
              // 处理文本内容
              const exceptCharIndex = data.text.indexOf('�')
              const text = data.text.substring(
                0,
                exceptCharIndex === -1 ? data.text.length : exceptCharIndex
              )

              const message = JSON.stringify({
                id: conversationId,
                model,
                object: 'chat.completion.chunk',
                choices: [
                  {
                    index: 0,
                    delta: { content: (searchFlag ? '\n' : '') + text },
                    finish_reason: null,
                  },
                ],
                segment_id: segmentId,
                created,
              })

              if (searchFlag) searchFlag = false
              controller.enqueue(`data: ${message}\n\n`)
            } else if (data.event === 'req') {
              segmentId = data.id
            } else if (data.event === 'all_done' || data.event === 'error') {
              // 处理完成或错误
              const message = JSON.stringify({
                id: conversationId,
                model,
                object: 'chat.completion.chunk',
                choices: [
                  {
                    index: 0,
                    delta:
                      data.event === 'error'
                        ? {
                            content:
                              '\n[内容由于不合规被停止生成，我们换个话题吧]',
                          }
                        : {},
                    finish_reason: 'stop',
                  },
                ],
                usage: {
                  prompt_tokens: 1,
                  completion_tokens: 1,
                  total_tokens: 2,
                },
                segment_id: segmentId,
                created,
              })

              controller.enqueue(`data: ${message}\n\n`)
              controller.enqueue('data: [DONE]\n\n')
            } else if (
              !silentSearch &&
              data.event === 'search_plus' &&
              data.msg &&
              data.msg.type === 'get_res'
            ) {
              // 处理搜索结果
              if (!searchFlag) searchFlag = true
              webSearchCount += 1

              const message = JSON.stringify({
                id: conversationId,
                model,
                object: 'chat.completion.chunk',
                choices: [
                  {
                    index: 0,
                    delta: {
                      content: `【检索 ${webSearchCount}】 [${data.msg.title}](${data.msg.url})\n`,
                    },
                    finish_reason: null,
                  },
                ],
                segment_id: segmentId,
                created,
              })

              controller.enqueue(`data: ${message}\n\n`)
            }
          } catch (err) {
            console.error('转换流数据时出错:', err)
          }
        }
      },
    })

    // 将原始响应流式传输通过转换器
    return response.body.pipeThrough(transformStream)
  } catch (error) {
    console.error('创建流式对话补全时出错:', error)
    throw error
  }
}

// 检查token是否存活
async function checkTokenLive(refreshToken, env) {
  try {
    const response = await fetch(`${env.BASE_URL}/api/auth/token/refresh`, {
      headers: {
        Authorization: `Bearer ${refreshToken}`,
        Referer: `${env.BASE_URL}/`,
        ...FAKE_HEADERS,
      },
    })

    if (response.status !== 200) {
      return false
    }

    const data = await response.json()
    return !!(data.access_token && data.refresh_token)
  } catch (err) {
    console.error('检查Token存活状态时出错:', err)
    return false
  }
}

export {
  createCompletion,
  createCompletionStream,
  checkTokenLive,
  sample,
  tokenSplit, // 重新导出工具函数
}
