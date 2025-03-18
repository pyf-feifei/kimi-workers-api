import { handleCors } from './utils/cors.js'
import { handleRequest } from './utils/router.js'

export default {
  async fetch(request, env, ctx) {
    try {
      // 处理预检请求
      if (request.method === 'OPTIONS') {
        return handleCors(request, env.CORS_ORIGINS)
      }

      return await handleRequest(request, env)
    } catch (error) {
      return new Response(
        JSON.stringify({
          error: error.message || 'Internal Server Error',
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }
  },
}
