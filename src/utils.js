// 生成随机数字符串
export function generateRandomNumber(length) {
  return Math.random()
    .toString()
    .substring(2, 2 + length)
}

// 生成随机的Cookie，用于伪装请求
export function generateCookie() {
  return `kimi_session_id=${generateRandomNumber(
    10
  )}; deviceId=${generateRandomNumber(20)}`
}

// 获取当前Unix时间戳（秒）
export function unixTimestamp() {
  return Math.floor(Date.now() / 1000)
}

// Token切分
export function tokenSplit(authorization) {
  return authorization.replace('Bearer ', '').split(',')
}

// 随机选择一个元素
export function sample(array) {
  return array[Math.floor(Math.random() * array.length)]
}

// 创建读取流转发
export async function streamResponse(response, transformer) {
  const reader = response.body.getReader()
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()

  return new Response(
    new ReadableStream({
      async start(controller) {
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) {
              controller.close()
              break
            }

            const chunk = decoder.decode(value, { stream: true })
            const transformedChunk = transformer ? transformer(chunk) : chunk
            controller.enqueue(encoder.encode(transformedChunk))
          }
        } catch (err) {
          controller.error(err)
        }
      },
    }),
    {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    }
  )
}
