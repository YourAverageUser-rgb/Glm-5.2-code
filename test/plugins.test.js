import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadPlugins } from "../src/plugins/index.js";
import { loadSkills } from "../src/skills/index.js";
import { resolveSubagentTypes } from "../src/agent/subagentTypes.js";

function mkTmpProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ucode-plugins-test-"));
}

function writePlugin(root, name, { manifest, skill, agent, theme, hooks } = {}) {
  const dir = path.join(root, ".ucode/plugins", name);
  fs.mkdirSync(dir, { recursive: true });
  if (manifest) fs.writeFileSync(path.join(dir, "plugin.json"), JSON.stringify(manifest));
  if (skill) {
    fs.mkdirSync(path.join(dir, "skills"), { recursive: true });
    fs.writeFileSync(path.join(dir, "skills", "skill.md"), skill);
  }
  if (agent) {
    fs.mkdirSync(path.join(dir, "agents"), { recursive: true });
    fs.writeFileSync(path.join(dir, "agents", "agent.md"), agent);
  }
  if (theme) {
    fs.mkdirSync(path.join(dir, "themes"), { recursive: true });
    fs.writeFileSync(path.join(dir, "themes", "theme.json"), JSON.stringify(theme));
  }
  if (hooks) fs.writeFileSync(path.join(dir, "hooks.json"), JSON.stringify(hooks));
  return dir;
}

test("loadPlugins returns an empty list when no plugins directory exists", () => {
  assert.deepEqual(loadPlugins({ projectRoot: mkTmpProject() }), []);
});

test("loadPlugins reads the manifest and bundled resources", () => {
  const root = mkTmpProject();
  writePlugin(root, "demo", {
    manifest: { name: "demo", description: "A demo plugin", version: "1.0.0" },
    skill: "---\nname: demo-skill\ndescription: Demo skill\n---\nDo the demo thing.",
    agent: "---\nname: demo-agent\ndescription: Demo agent\ntools: read_file\n---\nBe a demo agent.",
    theme: { name: "demo-theme", colors: { red: "#112233" } },
    hooks: { PreToolUse: [{ matcher: "run_command", command: "echo hi" }] },
  });

  const [plugin] = loadPlugins({ projectRoot: root });
  assert.equal(plugin.name, "demo");
  assert.equal(plugin.description, "A demo plugin");
  assert.equal(plugin.version, "1.0.0");
  assert.equal(plugin.source, "project");
  assert.equal(plugin.skills[0].name, "demo-skill");
  assert.equal(plugin.agents["demo-agent"].description, "Demo agent");
  assert.equal(plugin.themes["demo-theme"].colors.red, "#112233");
  assert.equal(plugin.hooks.PreToolUse[0].command, "echo hi");
});

test("loadPlugins falls back to the directory name when plugin.json is missing", () => {
  const root = mkTmpProject();
  writePlugin(root, "no-manifest", {});
  const [plugin] = loadPlugins({ projectRoot: root });
  assert.equal(plugin.name, "no-manifest");
  assert.equal(plugin.version, null);
});

test("loadSkills merges plugin skills, project skills winning on name collision", () => {
  const root = mkTmpProject();
  writePlugin(root, "demo", { skill: "---\nname: shared\ndescription: from plugin\n---\nplugin body" });
  fs.mkdirSync(path.join(root, ".ucode/skills"), { recursive: true });
  fs.writeFileSync(path.join(root, ".ucode/skills/shared.md"), "---\nname: shared\ndescription: from project\n---\nproject body");

  const skills = loadSkills({ projectRoot: root });
  const shared = skills.find((s) => s.name === "shared");
  assert.equal(shared.description, "from project");
  assert.equal(skills.length, 1);
});

test("resolveSubagentTypes merges plugin agents, project agents winning on name collision", () => {
  const root = mkTmpProject();
  writePlugin(root, "demo", { agent: "---\nname: shared-agent\ndescription: from plugin\n---\nplugin instructions" });
  fs.mkdirSync(path.join(root, ".ucode/agents"), { recursive: true });
  fs.writeFileSync(path.join(root, ".ucode/agents/shared-agent.md"), "---\nname: shared-agent\ndescription: from project\n---\nproject instructions");

  const types = resolveSubagentTypes({ projectRoot: root });
  assert.equal(types["shared-agent"].description, "from project");
});
