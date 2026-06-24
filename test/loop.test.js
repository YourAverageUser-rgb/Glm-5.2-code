import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runAgentLoop } from "../src/agent/loop.js";
import { writeFileTool } from "../src/tools/write.js";
import { PermissionGate } from "../src/agent/permissions.js";

function mkTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ucode-loop-test-"));
}

function baseConfig() {
  return { model: "fake-model", temperature: 0, maxOutputTokens: 100, maxAgentIterations: 10, contextWindowTokens: 128000, compactAtFraction: 0.85, projectRoot: process.cwd(), globalDir: "/tmp" };
}

// Scripted fake provider: returns queued responses in order, regardless of input.
function makeFakeProvider(responses) {
  let i = 0;
  return {
    async chat() {
      const r = responses[Math.min(i, responses.length - 1)];
      i++;
      return r;
    },
  };
}

test("agent loop executes a requested tool call and returns the final text", async () => {
  const dir = mkTmpDir();
  const provider = makeFakeProvider([
    {
      message: { role: "assistant", content: null, toolCalls: [{ id: "1", name: "write_file", arguments: { path: "out.txt", content: "hi" } }] },
      usage: { inputTokens: 10, outputTokens: 5 },
      stopReason: "tool_use",
    },
    {
      message: { role: "assistant", content: "Done.", toolCalls: undefined },
      usage: { inputTokens: 10, outputTokens: 2 },
      stopReason: "stop",
    },
  ]);

  const permissionGate = new PermissionGate({ mode: "bypassPermissions" });
  const result = await runAgentLoop({
    config: baseConfig(),
    provider,
    tools: [writeFileTool],
    initialMessages: [{ role: "user", content: "write a file" }],
    cwd: dir,
    permissionGate,
    ui: { log: () => {} },
  });

  assert.equal(result.finalText, "Done.");
  assert.equal(fs.readFileSync(path.join(dir, "out.txt"), "utf8"), "hi");
});

test("agent loop records a denial instead of executing the tool when blocked", async () => {
  const dir = mkTmpDir();
  const provider = makeFakeProvider([
    {
      message: { role: "assistant", content: null, toolCalls: [{ id: "1", name: "write_file", arguments: { path: "out.txt", content: "hi" } }] },
      usage: { inputTokens: 10, outputTokens: 5 },
      stopReason: "tool_use",
    },
    { message: { role: "assistant", content: "Acknowledged.", toolCalls: undefined }, usage: { inputTokens: 5, outputTokens: 2 }, stopReason: "stop" },
  ]);

  const permissionGate = new PermissionGate({ mode: "plan" }); // writes denied in plan mode
  const result = await runAgentLoop({
    config: baseConfig(),
    provider,
    tools: [writeFileTool],
    initialMessages: [{ role: "user", content: "write a file" }],
    cwd: dir,
    permissionGate,
    ui: { log: () => {} },
  });

  assert.equal(fs.existsSync(path.join(dir, "out.txt")), false);
  const toolResultMsg = result.messages.find((m) => m.role === "tool");
  assert.match(toolResultMsg.content, /Denied/);
});

test("agent loop stops after maxAgentIterations to avoid runaway loops", async () => {
  const dir = mkTmpDir();
  const provider = makeFakeProvider([
    {
      message: { role: "assistant", content: null, toolCalls: [{ id: "1", name: "write_file", arguments: { path: "out.txt", content: "x" } }] },
      usage: { inputTokens: 1, outputTokens: 1 },
      stopReason: "tool_use",
    },
  ]); // always returns a tool call, never stops on its own

  const permissionGate = new PermissionGate({ mode: "bypassPermissions" });
  const result = await runAgentLoop({
    config: { ...baseConfig(), maxAgentIterations: 3 },
    provider,
    tools: [writeFileTool],
    initialMessages: [{ role: "user", content: "loop forever" }],
    cwd: dir,
    permissionGate,
    ui: { log: () => {} },
  });

  assert.equal(result.iterations, 3);
  assert.match(result.finalText, /max agent iterations/);
});
