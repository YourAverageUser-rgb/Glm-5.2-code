import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveSubagentTypes } from "../src/agent/subagentTypes.js";

const FAKE_TOOLS = [
  { name: "read_file" },
  { name: "glob_files" },
  { name: "grep" },
  { name: "web_fetch" },
  { name: "write_file" },
  { name: "run_command" },
  { name: "todo_write" },
  { name: "dispatch_agent" },
];

function mkTmpProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ucode-agents-test-"));
}

test("builtin 'general' type strips dispatch_agent but keeps everything else", () => {
  const types = resolveSubagentTypes({ projectRoot: mkTmpProject() });
  const filtered = types.general.toolFilter(FAKE_TOOLS).map((t) => t.name);
  assert.ok(!filtered.includes("dispatch_agent"));
  assert.ok(filtered.includes("write_file"));
});

test("builtin 'explore' type only keeps read-only tools", () => {
  const types = resolveSubagentTypes({ projectRoot: mkTmpProject() });
  const filtered = types.explore.toolFilter(FAKE_TOOLS).map((t) => t.name);
  assert.deepEqual(filtered.sort(), ["glob_files", "grep", "read_file", "web_fetch"].sort());
});

test("builtin 'plan' type is read-only plus todo_write", () => {
  const types = resolveSubagentTypes({ projectRoot: mkTmpProject() });
  const filtered = types.plan.toolFilter(FAKE_TOOLS).map((t) => t.name);
  assert.deepEqual(filtered.sort(), ["glob_files", "grep", "read_file", "todo_write", "web_fetch"].sort());
});

test("custom subagent types load from .ucode/agents/*.md with a restricted tool list", () => {
  const root = mkTmpProject();
  fs.mkdirSync(path.join(root, ".ucode/agents"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".ucode/agents/reviewer.md"),
    "---\nname: reviewer\ndescription: Reviews code for issues\ntools: read_file, grep\n---\nFocus on correctness and security.\n"
  );

  const types = resolveSubagentTypes({ projectRoot: root });
  assert.equal(types.reviewer.description, "Reviews code for issues");
  assert.equal(types.reviewer.extraInstructions, "Focus on correctness and security.");
  const filtered = types.reviewer.toolFilter(FAKE_TOOLS).map((t) => t.name);
  assert.deepEqual(filtered.sort(), ["grep", "read_file"]);
});

test("custom subagent types without a tools list default to everything except dispatch_agent", () => {
  const root = mkTmpProject();
  fs.mkdirSync(path.join(root, ".ucode/agents"), { recursive: true });
  fs.writeFileSync(path.join(root, ".ucode/agents/helper.md"), "---\nname: helper\ndescription: General helper\n---\nBe helpful.\n");

  const types = resolveSubagentTypes({ projectRoot: root });
  const filtered = types.helper.toolFilter(FAKE_TOOLS).map((t) => t.name);
  assert.ok(!filtered.includes("dispatch_agent"));
  assert.ok(filtered.includes("write_file"));
});
