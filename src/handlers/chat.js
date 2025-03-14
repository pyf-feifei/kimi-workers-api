// 修复模块导入
import { Hono } from 'hono'
import { SessionManager } from '../lib/session.js'
import { CryptoService } from '../lib/crypto.js'
import { Config } from '../lib/config.js'

// 修复流式响应生成器
async function* generateStream(c, payload, controller) {
  if (!(c instanceof Hono.Context)) {
    throw new Error('Invalid context object')
  }
  try {
    const { messages, model } = payload
    const startTime = Date.now()

    // 创建或更新会话
    const sessionId = payload.session_id || crypto.randomUUID()
    if (await SessionManager.get(c.env, sessionId)) {
      await SessionManager.update(c.env, sessionId, messages)
    } else {
      await SessionManager.create(c.env, messages)
    }

    // 模拟流式响应
    for (const [index, message] of messages.entries()) {
      yield {
        id: `chatcmpl-${CryptoService.generateSecureToken('', 8)}`,
        object: 'chat.completion.chunk',
        created: Math.floor(startTime / 1000),
        model,
        choices: [
          {
            delta: { content: `${message.content} [processed]` },
            index,
            finish_reason: index === messages.length - 1 ? 'stop' : null,
          },
        ],
      }
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  } finally {
    controller.close()
  }
}

// 核心聊天处理函数
export async function chatHandler(c) {
  try {
    const payload = await c.req.json()
    const { readable, writable } = new TransformStream()
    const writer = writable.getWriter()

    // 启动流式生成器
    const stream = generateStream(c, payload, writer)
    c.executionCtx.waitUntil(
      (async () => {
        for await (const chunk of stream) {
          writer.write(`data: ${JSON.stringify(chunk)}\n\n`)
        }
      })()
    )

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (err) {
    console.error(`Chat handler error: ${err.message}`)
    return c.json(
      { error: err.message || '处理请求时发生错误' },
      { status: 500 }
    )
  }
}
