import { handleRequest } from './router.js'

// Workers入口点
export default {
  async fetch(request, env, ctx) {
    try {
      return await handleRequest(request, env)
    } catch (err) {
      console.error('全局错误处理:', err)
      return new Response(
        JSON.stringify({
          error: {
            message: 'An unexpected error occurred',
            type: 'internal_server_error',
          },
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }
  },
}
