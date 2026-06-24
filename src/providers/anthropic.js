import { Provider, fetchJson } from "./base.js";

const ANTHROPIC_VERSION = "2023-06-01";

// Speaks Anthropic's native Messages API wire format, for users who want to
// point this agent at real Claude models with their own Anthropic API key.
export class AnthropicProvider extends Provider {
  toWireMessages(messages) {
    const wire = [];
    for (const m of messages) {
      if (m.role === "tool") {
        wire.push({
          role: "user",
          content: [{ type: "tool_result", tool_use_id: m.toolCallId, content: m.content ?? "" }],
        });
        continue;
      }
      if (m.role === "assistant" && m.toolCalls?.length) {
        const content = [];
        if (m.content) content.push({ type: "text", text: m.content });
        for (const tc of m.toolCalls) {
          content.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.arguments ?? {} });
        }
        wire.push({ role: "assistant", content });
        continue;
      }
      wire.push({ role: m.role, content: m.content ?? "" });
    }
    return wire;
  }

  toWireTools(tools) {
    if (!tools?.length) return undefined;
    return tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters }));
  }

  async chat({ model, system, messages, tools, temperature, maxOutputTokens, apiKey, baseURL, signal }) {
    const body = {
      model,
      system: system || undefined,
      messages: this.toWireMessages(messages),
      max_tokens: maxOutputTokens,
      temperature,
    };
    const wireTools = this.toWireTools(tools);
    if (wireTools) body.tools = wireTools;

    const headers = {
      "Content-Type": "application/json",
      "anthropic-version": ANTHROPIC_VERSION,
      "x-api-key": apiKey,
    };

    const json = await fetchJson(
      `${baseURL.replace(/\/$/, "")}/messages`,
      { method: "POST", headers, body: JSON.stringify(body), signal },
      { label: "anthropic messages" }
    );

    const textParts = [];
    const toolCalls = [];
    for (const block of json.content ?? []) {
      if (block.type === "text") textParts.push(block.text);
      if (block.type === "tool_use") toolCalls.push({ id: block.id, name: block.name, arguments: block.input ?? {} });
    }

    const stopReason = json.stop_reason === "tool_use" ? "tool_use" : json.stop_reason === "max_tokens" ? "length" : "stop";

    return {
      message: {
        role: "assistant",
        content: textParts.length ? textParts.join("\n") : null,
        toolCalls: toolCalls.length ? toolCalls : undefined,
      },
      usage: {
        inputTokens: json.usage?.input_tokens ?? 0,
        outputTokens: json.usage?.output_tokens ?? 0,
      },
      stopReason,
    };
  }
}
