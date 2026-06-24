import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runCalibration, ensureCalibrated } from "../src/agent/calibrate.js";
import { ProviderError } from "../src/providers/base.js";

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ucode-calibrate-test-"));
}

function baseConfig(overrides = {}) {
  return { provider: "fake", model: "fake-model", baseURL: "https://example.invalid", apiKey: "k", ...overrides };
}

test("runCalibration succeeds when the model calls the test tool with the expected echo", async () => {
  const provider = {
    async chat({ tools }) {
      const call = { id: "1", name: tools[0].name, arguments: { echo: "ucode-calibration-ok" } };
      return { message: { role: "assistant", content: null, toolCalls: [call] }, usage: {}, stopReason: "tool_use" };
    },
  };
  const result = await runCalibration({ provider, config: baseConfig() });
  assert.deepEqual(result, { ok: true });
});

test("runCalibration fails when the model never calls the test tool", async () => {
  const provider = {
    async chat() {
      return { message: { role: "assistant", content: "sure, done!", toolCalls: undefined }, usage: {}, stopReason: "stop" };
    },
  };
  const result = await runCalibration({ provider, config: baseConfig() });
  assert.equal(result.ok, false);
  assert.match(result.reason, /without calling the test tool/);
});

test("runCalibration fails when the tool call has the wrong arguments", async () => {
  const provider = {
    async chat({ tools }) {
      const call = { id: "1", name: tools[0].name, arguments: { echo: "something-else" } };
      return { message: { role: "assistant", content: null, toolCalls: [call] }, usage: {}, stopReason: "tool_use" };
    },
  };
  const result = await runCalibration({ provider, config: baseConfig() });
  assert.equal(result.ok, false);
  assert.match(result.reason, /unexpected arguments/);
});

test("runCalibration reports provider errors instead of throwing", async () => {
  const provider = {
    async chat() {
      throw new ProviderError("chat completion failed (401): bad key", { status: 401 });
    },
  };
  const result = await runCalibration({ provider, config: baseConfig() });
  assert.equal(result.ok, false);
  assert.match(result.reason, /bad key/);
});

test("ensureCalibrated caches a passing result and skips re-checking on the next call", async () => {
  let calls = 0;
  const provider = {
    async chat({ tools }) {
      calls++;
      return { message: { role: "assistant", content: null, toolCalls: [{ id: "1", name: tools[0].name, arguments: { echo: "ucode-calibration-ok" } }] }, usage: {}, stopReason: "tool_use" };
    },
  };
  const globalDir = tmpDir();
  const config = baseConfig();

  const first = await ensureCalibrated({ provider, config, globalDir });
  assert.deepEqual(first, { ok: true, cached: false });
  assert.equal(calls, 1);

  const second = await ensureCalibrated({ provider, config, globalDir });
  assert.deepEqual(second, { ok: true, cached: true });
  assert.equal(calls, 1, "second call should be served from cache, not re-probe the provider");
});

test("ensureCalibrated with force:true bypasses the cache and re-checks", async () => {
  let calls = 0;
  const provider = {
    async chat({ tools }) {
      calls++;
      return { message: { role: "assistant", content: null, toolCalls: [{ id: "1", name: tools[0].name, arguments: { echo: "ucode-calibration-ok" } }] }, usage: {}, stopReason: "tool_use" };
    },
  };
  const globalDir = tmpDir();
  const config = baseConfig();

  await ensureCalibrated({ provider, config, globalDir });
  assert.equal(calls, 1);

  await ensureCalibrated({ provider, config, globalDir, force: true });
  assert.equal(calls, 2);
});

test("ensureCalibrated keys the cache by provider+model+baseURL so switching models re-checks", async () => {
  let calls = 0;
  const provider = {
    async chat({ tools }) {
      calls++;
      return { message: { role: "assistant", content: null, toolCalls: [{ id: "1", name: tools[0].name, arguments: { echo: "ucode-calibration-ok" } }] }, usage: {}, stopReason: "tool_use" };
    },
  };
  const globalDir = tmpDir();

  await ensureCalibrated({ provider, config: baseConfig({ model: "model-a" }), globalDir });
  await ensureCalibrated({ provider, config: baseConfig({ model: "model-b" }), globalDir });
  assert.equal(calls, 2);
});
