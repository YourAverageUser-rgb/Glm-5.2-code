import { Provider, fetchJson } from "./base.js";

// Speaks the OpenAI /chat/completions wire format. This covers GLM (Zhipu/Z.ai),
// OpenAI itself, DeepSeek, Groq, Mistral, OpenRouter, Ollama, LM Studio, and any
// other endpoint that implements the same contract.
export class OpenAICompatibleProvider extends Provider {
  toWireMessages(system, messages) {
    const wire = [];
    if (system) wire.push({ role: "system", content: system });
    for (const m of messages) {
      if (m.role === "tool") {
        wire.push({ role: "tool", tool_call_id: m.toolCallId, content: m.content ?? "" });
        continue;
      }
      if (m.role === "assistant" && m.toolCalls?.length) {
        wire.push({
          role: "assistant",
          content: m.content ?? null,
          tool_calls: m.toolCalls.map((tc) => ({
            id: tc.id,
            type: "function",
            function: { name: tc.name, arguments: JSON.stringify(tc.arguments ?? {}) },
          })),
        });
        continue;
      }
      wire.push({ role: m.role, content: m.content ?? "" });
    }
    return wire;
  }

  toWireTools(tools) {
    if (!tools?.length) return undefined;
    return tools.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
  }

  async chat({ model, system, messages, tools, temperature, maxOutputTokens, apiKey, baseURL, signal }) {
    const body = {
      model,
      messages: this.toWireMessages(system, messages),
      temperature,
      max_tokens: maxOutputTokens,
    };
    const wireTools = this.toWireTools(tools);
    if (wireTools) {
      body.tools = wireTools;
      body.tool_choice = "auto";
    }

    const headers = { "Content-Type": "application/json" };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    const json = await fetchJson(
      `${baseURL.replace(/\/$/, "")}/chat/completions`,
      { method: "POST", headers, body: JSON.stringify(body), signal },
      { label: "chat completion" }
    );

    const choice = json.choices?.[0];
    const msg = choice?.message ?? {};
    const toolCalls = (msg.tool_calls ?? []).map((tc) => {
      let args = {};
      try {
        args = tc.function?.arguments ? JSON.parse(tc.function.arguments) : {};
      } catch {
        args = { _raw: tc.function?.arguments };
      }
      return { id: tc.id, name: tc.function?.name, arguments: args };
    });

    const stopReason =
      choice?.finish_reason === "tool_calls" ? "tool_use" : choice?.finish_reason === "length" ? "length" : "stop";

    return {
      message: {
        role: "assistant",
        content: msg.content ?? null,
        toolCalls: toolCalls.length ? toolCalls : undefined,
      },
      usage: {
        inputTokens: json.usage?.prompt_tokens ?? 0,
        outputTokens: json.usage?.completion_tokens ?? 0,
      },
      stopReason,
    };
  }
}
