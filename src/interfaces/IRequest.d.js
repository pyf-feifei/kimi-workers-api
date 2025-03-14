// 聊天消息结构
class ChatMessage {
  constructor(role, content, file_ids) {
    this.role = role // 'user' | 'assistant' | 'system'
    this.content = content
    this.file_ids = file_ids // 支持文件附件
  }
}

// 请求主体结构
class ChatRequest {
  constructor(
    messages,
    model,
    tools,
    stream,
    max_tokens,
    temperature,
    session_id
  ) {
    this.messages = messages
    this.model = model
    this.tools = tools
    this.stream = stream // 是否启用流式响应
    this.max_tokens = max_tokens
    this.temperature = temperature
    this.session_id = session_id // 会话追踪ID
  }
}

// 流式响应块
class StreamResponseChunk {
  constructor(id, created, model, choices) {
    this.id = id
    this.object = 'chat.completion.chunk'
    this.created = created
    this.model = model
    this.choices = choices // [{delta: {content, role, tool_calls}, index, finish_reason}]
  }
}

// API错误格式
class APIError {
  constructor(code, message, type, param) {
    this.code = code
    this.message = message
    this.type = type // 'invalid_request' | 'internal_error' | 'rate_limit'
    this.param = param // 错误关联参数
  }
}

// 会话存储结构
class Session {
  constructor(id, messages, created, expires, token_usage) {
    this.id = id
    this.messages = messages
    this.created = created
    this.expires = expires
    this.token_usage = token_usage // 关联令牌使用情况
  }
}

// 工具定义
class Tool {
  constructor(type, parameters) {
    this.type = type // 'web_search' | 'file_analysis' | 'function'
    this.parameters = parameters
  }
}

// 工具调用结构
class ToolCall {
  constructor(id, name, arguments) {
    this.id = id
    this.type = 'function'
    this.function = {
      name: name,
      arguments: arguments,
    }
  }
}

// 文件元数据
class FileMetadata {
  constructor(id, name, size, uploaded_at, expires_at) {
    this.id = id
    this.name = name
    this.size = size
    this.uploaded_at = uploaded_at
    this.expires_at = expires_at
  }
}

// 令牌配置
class TokenConfig {
  constructor(token, weight, last_used, usage_count) {
    this.token = token
    this.weight = weight
    this.last_used = last_used
    this.usage_count = usage_count
  }
}

// 文件上传请求
class FileUploadRequest {
  constructor(file, purpose) {
    this.file = file
    this.purpose = purpose // 'analysis' | 'storage'
  }
}

module.exports = {
  ChatMessage,
  ChatRequest,
  StreamResponseChunk,
  APIError,
  Session,
  Tool,
  ToolCall,
  FileMetadata,
  TokenConfig,
  FileUploadRequest,
}
