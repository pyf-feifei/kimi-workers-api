import { handleCors } from './utils/cors.js'
import { handleRequest } from './utils/router.js'

export default {
  async fetch(request, env, ctx) {
    try {
      return await handleRequest(request, env)
    } catch (error) {
      console.error('处理请求时发生错误:', error)
      return new Response(
        JSON.stringify({ error: '服务内部错误', detail: error.message }),
        { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }
  }
}
