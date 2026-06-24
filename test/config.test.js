import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadConfig } from "../src/config/index.js";

function mkTmpProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ucode-test-"));
}

test("loadConfig resolves the glm preset by default", () => {
  const dir = mkTmpProject();
  const cfg = loadConfig({ cwd: dir, flags: {} });
  assert.equal(cfg.provider, "glm");
  assert.equal(cfg.kind, "openai-compatible");
  assert.equal(cfg.model, "glm-5.2");
  assert.match(cfg.baseURL, /z\.ai|bigmodel/);
});

test("CLI flags override provider, model, and base URL", () => {
  const dir = mkTmpProject();
  const cfg = loadConfig({ cwd: dir, flags: { provider: "openai", model: "gpt-4o-mini", baseUrl: "https://example.test/v1" } });
  assert.equal(cfg.provider, "openai");
  assert.equal(cfg.model, "gpt-4o-mini");
  assert.equal(cfg.baseURL, "https://example.test/v1");
});

test("project .ucode/settings.json overrides global defaults", () => {
  const dir = mkTmpProject();
  fs.mkdirSync(path.join(dir, ".ucode"));
  fs.writeFileSync(path.join(dir, ".ucode", "settings.json"), JSON.stringify({ provider: "anthropic", permissionMode: "plan" }));
  const cfg = loadConfig({ cwd: dir, flags: {} });
  assert.equal(cfg.provider, "anthropic");
  assert.equal(cfg.permissionMode, "plan");
  assert.equal(cfg.kind, "anthropic");
});

test("env var UCODE_MODEL overrides preset model but not provider", () => {
  const dir = mkTmpProject();
  process.env.UCODE_MODEL = "glm-5.2-air";
  try {
    const cfg = loadConfig({ cwd: dir, flags: {} });
    assert.equal(cfg.provider, "glm");
    assert.equal(cfg.model, "glm-5.2-air");
  } finally {
    delete process.env.UCODE_MODEL;
  }
});

test("a fully custom provider works without a preset", () => {
  const dir = mkTmpProject();
  fs.mkdirSync(path.join(dir, ".ucode"));
  fs.writeFileSync(
    path.join(dir, ".ucode", "settings.json"),
    JSON.stringify({ provider: "my-custom-thing", kind: "openai-compatible", model: "whatever-model", baseURL: "https://my.endpoint/v1", apiKeyEnv: "MY_KEY" })
  );
  const cfg = loadConfig({ cwd: dir, flags: {} });
  assert.equal(cfg.model, "whatever-model");
  assert.equal(cfg.baseURL, "https://my.endpoint/v1");
  assert.equal(cfg.apiKeyEnv, "MY_KEY");
});
