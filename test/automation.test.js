import test from "node:test";
import assert from "node:assert/strict";
import { parseInterval, startLoopRunner } from "../src/automation/loop.js";
import { runAutoFix } from "../src/automation/autoFix.js";
import { PermissionGate } from "../src/agent/permissions.js";

function baseConfig() {
  return {
    model: "fake-model",
    temperature: 0,
    maxOutputTokens: 100,
    maxAgentIterations: 10,
    contextWindowTokens: 128000,
    compactAtFraction: 0.85,
    projectRoot: process.cwd(),
    globalDir: "/tmp",
  };
}

function baseRuntime(provider) {
  return {
    config: baseConfig(),
    provider,
    tools: [],
    memory: {},
    permissionGate: new PermissionGate({ mode: "bypassPermissions" }),
    providerLabel: "fake",
    cwd: process.cwd(),
  };
}

test("parseInterval supports seconds, minutes, hours, and bare numbers (default minutes)", () => {
  assert.equal(parseInterval("30s"), 30_000);
  assert.equal(parseInterval("10m"), 600_000);
  assert.equal(parseInterval("1h"), 3_600_000);
  assert.equal(parseInterval("5"), 300_000);
  assert.equal(parseInterval("2hr"), 7_200_000);
});

test("parseInterval rejects invalid strings", () => {
  assert.throws(() => parseInterval("banana"), /Invalid interval/);
  assert.throws(() => parseInterval(""), /Invalid interval/);
});

test("startLoopRunner stops as soon as the response includes the stop sentinel", async () => {
  const provider = {
    async chat() {
      return { message: { role: "assistant", content: "all done <<LOOP_DONE>>", toolCalls: undefined }, usage: {}, stopReason: "stop" };
    },
  };
  const { runs } = await startLoopRunner({ runtime: baseRuntime(provider), prompt: "check status", intervalMs: 50, maxRuns: 10, ui: { log: () => {} } });
  assert.equal(runs, 1);
});

test("startLoopRunner stops after maxRuns when the sentinel never appears", async () => {
  const provider = {
    async chat() {
      return { message: { role: "assistant", content: "still working", toolCalls: undefined }, usage: {}, stopReason: "stop" };
    },
  };
  const { runs } = await startLoopRunner({ runtime: baseRuntime(provider), prompt: "check status", intervalMs: 10, maxRuns: 3, ui: { log: () => {} } });
  assert.equal(runs, 3);
});

test("startLoopRunner respects an external stop signal between runs", async () => {
  let stopped = false;
  const provider = {
    async chat() {
      stopped = true; // simulate Ctrl+C arriving while the first run is in flight
      return { message: { role: "assistant", content: "still working", toolCalls: undefined }, usage: {}, stopReason: "stop" };
    },
  };
  const { runs } = await startLoopRunner({
    runtime: baseRuntime(provider),
    prompt: "check status",
    intervalMs: 10,
    maxRuns: Infinity,
    ui: { log: () => {} },
    isStopped: () => stopped,
  });
  assert.equal(runs, 1);
});

test("startLoopRunner re-evaluates a prompt function fresh on every tick", async () => {
  const seenPrompts = [];
  const provider = {
    async chat({ messages }) {
      seenPrompts.push(messages[0].content);
      return { message: { role: "assistant", content: "still working", toolCalls: undefined }, usage: {}, stopReason: "stop" };
    },
  };
  let tick = 0;
  const { runs } = await startLoopRunner({
    runtime: baseRuntime(provider),
    prompt: () => `tick-${++tick}`,
    intervalMs: 10,
    maxRuns: 3,
    ui: { log: () => {} },
  });
  assert.equal(runs, 3);
  assert.ok(seenPrompts[0].startsWith("tick-1"));
  assert.ok(seenPrompts[1].startsWith("tick-2"));
  assert.ok(seenPrompts[2].startsWith("tick-3"));
});

test("runAutoFix returns success immediately when the command passes on the first try", async () => {
  const provider = { async chat() { throw new Error("should not be called"); } };
  const result = await runAutoFix({ runtime: baseRuntime(provider), command: "exit 0", maxAttempts: 3, ui: { log: () => {} } });
  assert.deepEqual(result, { success: true, attempts: 1 });
});

test("runAutoFix asks the agent to diagnose on each failure and gives up after maxAttempts", async () => {
  let chatCalls = 0;
  const provider = {
    async chat() {
      chatCalls++;
      return { message: { role: "assistant", content: "I attempted a fix.", toolCalls: undefined }, usage: {}, stopReason: "stop" };
    },
  };
  const result = await runAutoFix({ runtime: baseRuntime(provider), command: "exit 1", maxAttempts: 2, ui: { log: () => {} } });
  assert.deepEqual(result, { success: false, attempts: 2 });
  assert.equal(chatCalls, 2);
});
