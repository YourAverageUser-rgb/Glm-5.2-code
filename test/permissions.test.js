import test from "node:test";
import assert from "node:assert/strict";
import { decide, PermissionGate, MODES, nextMode } from "../src/agent/permissions.js";

test("nextMode cycles through all modes and wraps around", () => {
  for (let i = 0; i < MODES.length; i++) {
    assert.equal(nextMode(MODES[i]), MODES[(i + 1) % MODES.length]);
  }
});

test("plan mode allows reads, denies writes and exec", () => {
  assert.equal(decide({ toolName: "read_file", riskLevel: "read", mode: "plan" }), "allow");
  assert.equal(decide({ toolName: "write_file", riskLevel: "write", mode: "plan" }), "deny");
  assert.equal(decide({ toolName: "run_command", riskLevel: "exec", mode: "plan" }), "deny");
});

test("default mode allows reads, confirms writes and exec", () => {
  assert.equal(decide({ toolName: "read_file", riskLevel: "read", mode: "default" }), "allow");
  assert.equal(decide({ toolName: "write_file", riskLevel: "write", mode: "default" }), "confirm");
  assert.equal(decide({ toolName: "run_command", riskLevel: "exec", mode: "default" }), "confirm");
});

test("acceptEdits auto-allows writes but still confirms exec", () => {
  assert.equal(decide({ toolName: "edit_file", riskLevel: "write", mode: "acceptEdits" }), "allow");
  assert.equal(decide({ toolName: "run_command", riskLevel: "exec", mode: "acceptEdits" }), "confirm");
});

test("bypassPermissions (auto mode) allows everything", () => {
  assert.equal(decide({ toolName: "run_command", riskLevel: "exec", mode: "bypassPermissions" }), "allow");
});

test("explicit denyTools wins even over bypassPermissions", () => {
  assert.equal(decide({ toolName: "run_command", riskLevel: "exec", mode: "bypassPermissions", denyTools: ["run_command"] }), "deny");
});

test("explicit allowTools wins even in plan mode", () => {
  assert.equal(decide({ toolName: "write_file", riskLevel: "write", mode: "plan", allowTools: ["write_file"] }), "allow");
});

test("interactive risk level is always allowed", () => {
  assert.equal(decide({ toolName: "ask_user_question", riskLevel: "interactive", mode: "plan" }), "allow");
});

test("PermissionGate.check invokes confirm callback only for confirm verdicts", async () => {
  let calls = 0;
  const gate = new PermissionGate({ mode: "default", confirm: async () => { calls++; return true; } });
  const readResult = await gate.check({ name: "read_file", riskLevel: "read" }, {});
  assert.equal(readResult.allowed, true);
  assert.equal(calls, 0);

  const writeResult = await gate.check({ name: "write_file", riskLevel: "write" }, {});
  assert.equal(writeResult.allowed, true);
  assert.equal(calls, 1);
});

test("PermissionGate.check denies and reports reason when user declines", async () => {
  const gate = new PermissionGate({ mode: "default", confirm: async () => false });
  const result = await gate.check({ name: "run_command", riskLevel: "exec" }, {});
  assert.equal(result.allowed, false);
  assert.match(result.reason, /declined/);
});
