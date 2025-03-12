// 异常定义
export const EXCEPTIONS = {
  API_TEST: [-9999, 'API异常错误'],
  API_REQUEST_PARAMS_INVALID: [-2000, '请求参数非法'],
  API_REQUEST_FAILED: [-2001, '请求失败'],
  API_TOKEN_EXPIRES: [-2002, 'Token已失效'],
  API_FILE_URL_INVALID: [-2003, '远程文件URL非法'],
  API_FILE_EXECEEDS_SIZE: [-2004, '远程文件超出大小'],
  API_CHAT_STREAM_PUSHING: [-2005, '已有对话流正在输出'],
  API_RESEARCH_EXCEEDS_LIMIT: [-2006, '探索版使用量已达到上限'],
}

// API异常类
export class APIException extends Error {
  constructor(exception, errmsg) {
    const [errcode, defaultMsg] = exception
    super(errmsg || defaultMsg)
    this.errcode = errcode
    this.errmsg = errmsg || defaultMsg
  }
}

// 处理异常返回
export function handleException(exception) {
  const { errcode, errmsg } = exception
  return new Response(
    JSON.stringify({
      error: {
        code: errcode,
        message: errmsg,
      },
    }),
    {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    }
  )
}
