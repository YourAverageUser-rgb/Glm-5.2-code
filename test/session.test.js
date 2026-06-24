import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Session, estimateTokens, needsCompaction } from "../src/agent/session.js";

function mkTmpProjectConfig() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ucode-session-test-"));
  return { projectRoot: dir, sessionsDir: ".ucode/sessions", model: "fake-model", provider: "glm" };
}

test("Session save/load round-trips messages to disk", () => {
  const config = mkTmpProjectConfig();
  const session = new Session(config);
  const messages = [{ role: "user", content: "hello" }, { role: "assistant", content: "hi there" }];
  session.save({ messages, usage: { inputTokens: 1, outputTokens: 1 } });

  const reloaded = new Session(config, session.id);
  const loaded = reloaded.load();
  assert.deepEqual(loaded.messages, messages);
});

test("estimateTokens grows with content length", () => {
  const small = estimateTokens([{ role: "user", content: "hi" }]);
  const large = estimateTokens([{ role: "user", content: "x".repeat(4000) }]);
  assert.ok(large > small);
});

test("needsCompaction trips once estimated tokens cross the threshold", () => {
  const config = { contextWindowTokens: 1000, compactAtFraction: 0.5 }; // trip at ~500 tokens (~2000 chars)
  const short = [{ role: "user", content: "hi" }];
  const long = [{ role: "user", content: "x".repeat(3000) }];
  assert.equal(needsCompaction(short, config), false);
  assert.equal(needsCompaction(long, config), true);
});
