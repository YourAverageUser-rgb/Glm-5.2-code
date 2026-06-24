import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runHooks } from "../src/hooks/index.js";

test("runHooks does nothing when no hooks are configured", async () => {
  const result = await runHooks("PreToolUse", undefined, { tool: "write_file" });
  assert.deepEqual(result, { blocked: false });
});

test("runHooks only runs hooks whose matcher matches the tool name (exact, wildcard, prefix)", async () => {
  const hooks = [
    { matcher: "read_file", command: "exit 1" }, // doesn't match write_file, never runs
    { matcher: "write_*", command: "exit 0" }, // prefix match, runs but succeeds
  ];
  const result = await runHooks("PreToolUse", hooks, { tool: "write_file" });
  assert.deepEqual(result, { blocked: false });
});

test("runHooks blocks PreToolUse when a matching hook exits non-zero, using stderr as the reason", async () => {
  const hooks = [{ matcher: "*", command: "echo 'no can do' >&2; exit 1" }];
  const result = await runHooks("PreToolUse", hooks, { tool: "run_command" });
  assert.equal(result.blocked, true);
  assert.equal(result.reason, "no can do");
});

test("runHooks does not block PostToolUse even if the hook command fails", async () => {
  const hooks = [{ matcher: "*", command: "exit 1" }];
  const result = await runHooks("PostToolUse", hooks, { tool: "run_command" });
  assert.deepEqual(result, { blocked: false });
});

test("runHooks stops at the first blocking PreToolUse hook and skips subsequent hooks", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ucode-hooks-test-"));
  const marker = path.join(dir, "marker.txt");
  const hooks = [
    { matcher: "*", command: "exit 1" },
    { matcher: "*", command: `touch ${marker}` },
  ];
  const result = await runHooks("PreToolUse", hooks, { tool: "run_command" });
  assert.equal(result.blocked, true);
  assert.equal(fs.existsSync(marker), false);
});
