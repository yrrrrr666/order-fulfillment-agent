export class ProviderError extends Error {
  constructor(message, code = 'PROVIDER_ERROR') { super(message); this.code = code; }
}

export async function callDeepSeek(config, messages, tools, signal) {
  if (!config.apiKey) throw new ProviderError('请先配置 DeepSeek API Key。', 'MISSING_KEY');
  let response;
  try {
    response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: config.model, messages, tools, tool_choice: 'auto', thinking: { type: 'disabled' }, max_tokens: 1800, temperature: 0.2, stream: false }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(65000)])
    });
  } catch (error) {
    if (signal.aborted) throw new ProviderError('本轮请求已停止，已有业务状态保留。', 'ABORTED');
    throw new ProviderError(error.name === 'TimeoutError' ? '模型请求超时，请重试本轮或人工接管。' : '无法连接 DeepSeek，请检查网络与代理配置。', 'NETWORK_ERROR');
  }
  if (!response.ok) {
    const errors = { 400: '请求被模型服务拒绝，请检查模型名称是否支持工具调用。', 401: 'API Key 无效，请重新配置。', 402: 'DeepSeek 账户余额不足。', 403: '该密钥没有访问权限。', 429: '请求过于频繁，请稍后重试。' };
    throw new ProviderError(errors[response.status] || `模型服务暂时不可用（HTTP ${response.status}）。`, `HTTP_${response.status}`);
  }
  let body;
  try { body = await response.json(); } catch { throw new ProviderError('模型服务返回了无效响应。'); }
  const message = body.choices?.[0]?.message;
  if (!message || message.role !== 'assistant') throw new ProviderError('模型没有返回有效消息，请重试。');
  if (body.choices[0].finish_reason === 'length') throw new ProviderError('模型输出被截断，本轮未执行任何工具，请重试。', 'TRUNCATED');
  return { message, usage: body.usage || {}, model: body.model || config.model };
}
