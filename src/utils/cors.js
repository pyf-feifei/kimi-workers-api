export function handleCors(request, allowedOrigins) {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': allowedOrigins,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  })
}
