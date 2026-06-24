import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadSkills, renderSkill } from "../src/skills/index.js";

function mkTmpProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ucode-skills-test-"));
  fs.mkdirSync(path.join(root, ".ucode/skills"), { recursive: true });
  return root;
}

test("loadSkills returns an empty list when the skills directory doesn't exist", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ucode-skills-test-"));
  const skills = loadSkills({ projectRoot: root });
  assert.deepEqual(skills, []);
});

test("loadSkills parses frontmatter (name/description) and falls back to the filename", () => {
  const root = mkTmpProject();
  fs.writeFileSync(
    path.join(root, ".ucode/skills/deploy.md"),
    "---\nname: deploy\ndescription: Deploy the app\n---\nRun the deploy steps for {{args}}.\n"
  );
  fs.writeFileSync(path.join(root, ".ucode/skills/no-frontmatter.md"), "Just plain instructions.");

  const skills = loadSkills({ projectRoot: root });
  const byName = Object.fromEntries(skills.map((s) => [s.name, s]));

  assert.equal(byName.deploy.description, "Deploy the app");
  assert.equal(byName.deploy.body, "Run the deploy steps for {{args}}.");
  assert.equal(byName["no-frontmatter"].description, "");
  assert.equal(byName["no-frontmatter"].body, "Just plain instructions.");
});

test("renderSkill substitutes {{args}} and returns the raw body when no args are given", () => {
  const skill = { body: "Run the deploy steps for {{args}}." };
  assert.equal(renderSkill(skill, "production"), "Run the deploy steps for production.");
  assert.equal(renderSkill(skill), "Run the deploy steps for {{args}}.");
});
