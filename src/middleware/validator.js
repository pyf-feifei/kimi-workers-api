import { Context } from 'hono'
import { z } from 'zod'
import { Config } from '../lib/config'

// Zod验证模式定义
const ChatRequestSchema = z
  .object({
    messages: z
      .array(
        z.object({
          role: z.enum(['user', 'assistant', 'system']),
          content: z.string().min(1),
          file_ids: z.array(z.string()).optional(),
        })
      )
      .min(1),
    model: z.string().min(1),
    stream: z.boolean().optional(),
    max_tokens: z.number().int().positive().optional(),
    temperature: z.number().min(0).max(2).optional(),
  })
  .strict() // 添加strict()确保没有多余字段

const FileUploadSchema = z
  .object({
    file: z.instanceof(File),
    purpose: z.enum(['analysis', 'storage']),
  })
  .strict()

// 定义错误消息常量
const ERROR_MESSAGES = {
  invalid_content_type: '仅支持 application/json 或 multipart/form-data',
  validation_failed: '请求参数验证失败',
  invalid_file_size: '文件大小超过限制',
  invalid_file_type: '不支持的文件类型',
}

// 定义文件大小限制常量
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

export async function validator(c, next) {
  try {
    const headerRules = Config.getHeaderRules()
    const contentType = c.req.header('Content-Type')

    if (!headerRules.contentTypes.includes(contentType)) {
      return errorResponse(c, 415, 'invalid_content_type')
    }

    const path = c.req.path
    const validators = {
      '/v1/chat/completions': validateChatRequest,
      '/v1/files': validateFileRequest,
    }

    const validator = Object.entries(validators).find(
      ([route]) =>
        path === route || (route === '/v1/files' && path.startsWith(route))
    )

    if (validator) {
      await validator[1](c)
    }

    await next()
  } catch (err) {
    console.error(`Validation error:`, err)
    return errorResponse(c, 400, 'validation_failed', err.message)
  }
}

async function validateChatRequest(c) {
  const body = await c.req.json()
  const result = ChatRequestSchema.safeParse(body)

  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ')

    throw new Error(`无效请求参数: ${errors}`)
  }

  c.req.validBody = result.data
}

async function validateFileRequest(c) {
  const formData = await c.req.formData()
  const file = formData.get('file')
  const purpose = formData.get('purpose')

  if (!(file instanceof File)) {
    throw new Error('文件格式无效')
  }

  const result = FileUploadSchema.safeParse({ file, purpose })

  if (!result.success) {
    throw new Error(`文件上传格式错误: ${result.error.issues[0].message}`)
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new Error('文件大小超过10MB限制')
  }

  c.req.validBody = result.data
}

function errorResponse(c, code, type, detail) {
  const error = {
    code,
    message: ERROR_MESSAGES[type] || '验证错误',
    type,
    ...(detail && { detail }),
  }
  return c.json(error, code)
}
