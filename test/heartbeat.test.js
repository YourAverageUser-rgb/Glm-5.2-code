import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { findHeartbeatFile, readHeartbeat, scaffoldHeartbeat } from "../src/automation/heartbeat.js";

function projectDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ucode-heartbeat-test-"));
}

function configFor(projectRoot, globalDir) {
  return { projectRoot, globalDir };
}

test("findHeartbeatFile returns null when neither project nor global file exists", () => {
  const projectRoot = projectDir();
  const globalDir = projectDir();
  assert.equal(findHeartbeatFile(configFor(projectRoot, globalDir)), null);
  assert.equal(readHeartbeat(configFor(projectRoot, globalDir)), null);
});

test("findHeartbeatFile prefers the project file over the global fallback", () => {
  const projectRoot = projectDir();
  const globalDir = projectDir();
  fs.mkdirSync(path.join(projectRoot, ".ucode"), { recursive: true });
  fs.writeFileSync(path.join(projectRoot, ".ucode", "HEARTBEAT.md"), "project instructions");
  fs.writeFileSync(path.join(globalDir, "HEARTBEAT.md"), "global instructions");

  const found = findHeartbeatFile(configFor(projectRoot, globalDir));
  assert.equal(found, path.join(projectRoot, ".ucode", "HEARTBEAT.md"));
  assert.equal(readHeartbeat(configFor(projectRoot, globalDir)), "project instructions");
});

test("findHeartbeatFile falls back to the global file when no project file exists", () => {
  const projectRoot = projectDir();
  const globalDir = projectDir();
  fs.writeFileSync(path.join(globalDir, "HEARTBEAT.md"), "global instructions");

  assert.equal(readHeartbeat(configFor(projectRoot, globalDir)), "global instructions");
});

test("scaffoldHeartbeat writes a starter file under .ucode/ and it's then readable", () => {
  const projectRoot = projectDir();
  const globalDir = projectDir();
  const file = scaffoldHeartbeat(configFor(projectRoot, globalDir));

  assert.equal(file, path.join(projectRoot, ".ucode", "HEARTBEAT.md"));
  assert.ok(fs.existsSync(file));
  assert.match(readHeartbeat(configFor(projectRoot, globalDir)), /Heartbeat/);
});
