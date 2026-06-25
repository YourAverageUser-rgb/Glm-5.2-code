import test from "node:test";
import assert from "node:assert/strict";
import { OpenAICompatibleProvider } from "../src/providers/openaiCompatible.js";
import { AnthropicProvider } from "../src/providers/anthropic.js";

function withFakeFetch(jsonBody, fn) {
  const original = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(jsonBody),
  });
  return fn().finally(() => {
    global.fetch = original;
  });
}

test("OpenAICompatibleProvider surfaces reasoning_content as message.reasoning", () =>
  withFakeFetch(
    {
      choices: [{ message: { content: "the answer", reasoning_content: "step by step thoughts" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    },
    async () => {
      const provider = new OpenAICompatibleProvider({});
      const result = await provider.chat({ model: "m", system: "", messages: [], baseURL: "https://example.com" });
      assert.equal(result.message.content, "the answer");
      assert.equal(result.message.reasoning, "step by step thoughts");
    }
  ));

test("OpenAICompatibleProvider leaves reasoning undefined when absent", () =>
  withFakeFetch(
    { choices: [{ message: { content: "ok" }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1 } },
    async () => {
      const provider = new OpenAICompatibleProvider({});
      const result = await provider.chat({ model: "m", system: "", messages: [], baseURL: "https://example.com" });
      assert.equal(result.message.reasoning, undefined);
    }
  ));

test("AnthropicProvider collects thinking blocks into message.reasoning", () =>
  withFakeFetch(
    {
      content: [
        { type: "thinking", thinking: "first I consider..." },
        { type: "text", text: "the answer" },
      ],
      stop_reason: "end_turn",
      usage: { input_tokens: 1, output_tokens: 1 },
    },
    async () => {
      const provider = new AnthropicProvider({});
      const result = await provider.chat({ model: "m", system: "", messages: [], baseURL: "https://example.com" });
      assert.equal(result.message.content, "the answer");
      assert.equal(result.message.reasoning, "first I consider...");
    }
  ));

test("AnthropicProvider leaves reasoning undefined when there are no thinking blocks", () =>
  withFakeFetch(
    { content: [{ type: "text", text: "the answer" }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } },
    async () => {
      const provider = new AnthropicProvider({});
      const result = await provider.chat({ model: "m", system: "", messages: [], baseURL: "https://example.com" });
      assert.equal(result.message.reasoning, undefined);
    }
  ));
