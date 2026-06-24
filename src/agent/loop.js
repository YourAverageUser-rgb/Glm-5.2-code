import { toolsByName } from "../tools/index.js";
import { buildSystemPrompt, buildSubagentSystemPrompt } from "./systemPrompt.js";
import { ProviderError } from "../providers/base.js";
import { needsCompaction, compactMessages } from "./session.js";

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

async function callWithRetry(provider, request, { retries = 3, log } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await provider.chat(request);
    } catch (err) {
      lastErr = err;
      const retryable = err instanceof ProviderError && (err.status === undefined || RETRYABLE_STATUSES.has(err.status));
      if (!retryable || attempt === retries) throw err;
      const delay = 2 ** attempt * 1000;
      log?.({ type: "retry", attempt: attempt + 1, delay, error: err.message });
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

/**
 * Drives the tool-calling loop: ask the model, execute any tool calls it
 * requests, feed results back, repeat until it produces a final answer with
 * no further tool calls, or limits are hit.
 */
export async function runAgentLoop({
  config,
  provider,
  tools,
  initialMessages,
  systemPromptOverride,
  description,
  cwd = process.cwd(),
  permissionGate,
  ui = {},
  memory,
  providerLabel,
  depthRemaining,
  sessionDir,
  isSubagent = false,
  onMessage, // optional callback(messages) for persistence after every turn
}) {
  const byName = toolsByName(tools);
  const system = systemPromptOverride ?? (isSubagent ? buildSubagentSystemPrompt({ config, description }) : buildSystemPrompt({ config, memory, providerLabel }));

  const messages = [...initialMessages];
  let finalText = null;
  let totalUsage = { inputTokens: 0, outputTokens: 0 };
  let iterations = 0;

  while (iterations < (config.maxAgentIterations ?? 100)) {
    iterations++;

    let response;
    try {
      response = await callWithRetry(
        provider,
        {
          model: config.model,
          system,
          messages,
          tools: tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })),
          temperature: config.temperature,
          maxOutputTokens: config.maxOutputTokens,
          apiKey: config.apiKey,
          baseURL: config.baseURL,
        },
        { log: ui.log }
      );
    } catch (err) {
      ui.log?.({ type: "error", message: err.message });
      finalText = `(agent loop stopped on provider error: ${err.message})`;
      break;
    }

    totalUsage.inputTokens += response.usage?.inputTokens ?? 0;
    totalUsage.outputTokens += response.usage?.outputTokens ?? 0;

    messages.push(response.message);
    onMessage?.(messages);

    if (response.message.content) {
      ui.log?.({ type: "assistant-text", text: response.message.content });
    }

    if (response.stopReason !== "tool_use" || !response.message.toolCalls?.length) {
      finalText = response.message.content ?? "";
      break;
    }

    for (const call of response.message.toolCalls) {
      const tool = byName.get(call.name);
      if (!tool) {
        messages.push({ role: "tool", toolCallId: call.id, name: call.name, content: `Unknown tool "${call.name}".` });
        continue;
      }

      ui.log?.({ type: "tool-call", name: tool.name, args: call.arguments });

      const verdict = await permissionGate.check(tool, call.arguments);
      if (!verdict.allowed) {
        ui.log?.({ type: "tool-denied", name: tool.name, reason: verdict.reason });
        messages.push({ role: "tool", toolCallId: call.id, name: call.name, content: `Denied: ${verdict.reason}` });
        continue;
      }

      let result;
      try {
        result = await tool.execute(call.arguments, {
          cwd,
          config,
          ui,
          provider,
          permissionGate,
          depthRemaining,
          sessionDir,
          buildSubagentSystemPrompt: (desc) => buildSubagentSystemPrompt({ config, description: desc }),
        });
      } catch (err) {
        result = { isError: true, output: `Tool "${tool.name}" threw: ${err.message}` };
      }

      ui.log?.({ type: "tool-result", name: tool.name, output: result.output, isError: Boolean(result.isError) });
      messages.push({ role: "tool", toolCallId: call.id, name: call.name, content: result.output ?? "" });
    }

    if (needsCompaction(messages, config)) {
      const compacted = await compactMessages({ messages, provider, config });
      messages.length = 0;
      messages.push(...compacted);
      ui.log?.({ type: "compacted", remaining: messages.length });
    }

    onMessage?.(messages);
  }

  if (finalText === null) {
    finalText = "(stopped: reached max agent iterations for this turn)";
    ui.log?.({ type: "iteration-limit" });
  }

  return { finalText, messages, usage: totalUsage, iterations };
}
