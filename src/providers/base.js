/**
 * Generic internal message shape used throughout the agent loop, independent
 * of whatever wire format a given provider speaks.
 *
 * { role: "system" | "user" | "assistant" | "tool",
 *   content: string | null,
 *   toolCalls?: [{ id, name, arguments }],   // present on assistant turns that call tools
 *   toolCallId?: string,                     // present on "tool" role result messages
 *   name?: string }                          // tool name, present on "tool" role result messages
 *
 * Provider.chat() takes { model, system, messages, tools, temperature, maxOutputTokens, apiKey, baseURL }
 * and returns { message, usage: { inputTokens, outputTokens }, stopReason }
 * where stopReason is "tool_use" | "stop" | "length" | "error".
 */
export class Provider {
  constructor(config) {
    this.config = config;
  }

  // eslint-disable-next-line no-unused-vars
  async chat(_request) {
    throw new Error(`${this.constructor.name} must implement chat()`);
  }
}

export class ProviderError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.name = "ProviderError";
    this.status = status;
    this.body = body;
  }
}

export async function fetchJson(url, options, { label = "request" } = {}) {
  let res;
  try {
    res = await fetch(url, options);
  } catch (err) {
    throw new ProviderError(`Network error during ${label} to ${url}: ${err.message}`);
  }
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const msg = json?.error?.message || json?.message || text || res.statusText;
    throw new ProviderError(`${label} failed (${res.status}): ${msg}`, { status: res.status, body: json });
  }
  return json;
}
