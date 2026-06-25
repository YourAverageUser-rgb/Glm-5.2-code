import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { BUILTIN_THEMES, resolveThemes, compileTheme } from "../src/ui/themes.js";

function mkTmpProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ucode-themes-test-"));
}

test("BUILTIN_THEMES includes the expected named palettes", () => {
  assert.deepEqual(Object.keys(BUILTIN_THEMES).sort(), ["default", "dracula", "monochrome", "nord", "solarized-dark"].sort());
});

test("compileTheme converts a numeric SGR code to a basic escape sequence", () => {
  const compiled = compileTheme(BUILTIN_THEMES.default);
  assert.equal(compiled.red, "\x1b[31m");
});

test("compileTheme converts a hex color to a 24-bit truecolor escape sequence", () => {
  const compiled = compileTheme({ colors: { red: "#ff5555" } });
  assert.equal(compiled.red, "\x1b[38;2;255;85;85m");
});

test("compileTheme renders null as no escape at all (monochrome)", () => {
  const compiled = compileTheme(BUILTIN_THEMES.monochrome);
  assert.equal(compiled.red, "");
  assert.equal(compiled.bold, "\x1b[1m");
});

test("compileTheme fills in slots missing from a partial theme using the default palette", () => {
  const compiled = compileTheme({ colors: { red: "#ff5555" } });
  assert.equal(compiled.green, "\x1b[32m");
});

test("resolveThemes returns only built-ins when there are no custom/plugin themes", () => {
  const themes = resolveThemes({ projectRoot: mkTmpProject() });
  assert.equal(themes.default.source, "built-in");
  assert.equal(themes.dracula.source, "built-in");
});

test("resolveThemes picks up a project-level custom theme from .ucode/themes/*.json", () => {
  const root = mkTmpProject();
  fs.mkdirSync(path.join(root, ".ucode/themes"), { recursive: true });
  fs.writeFileSync(path.join(root, ".ucode/themes/sunset.json"), JSON.stringify({ description: "Custom sunset", colors: { red: "#ff0000" } }));

  const themes = resolveThemes({ projectRoot: root });
  assert.equal(themes.sunset.description, "Custom sunset");
  assert.equal(themes.sunset.source, "project");
});

test("resolveThemes lets a project custom theme override a built-in name", () => {
  const root = mkTmpProject();
  fs.mkdirSync(path.join(root, ".ucode/themes"), { recursive: true });
  fs.writeFileSync(path.join(root, ".ucode/themes/dracula.json"), JSON.stringify({ colors: { red: "#000000" } }));

  const themes = resolveThemes({ projectRoot: root });
  assert.equal(themes.dracula.source, "project");
  assert.equal(themes.dracula.colors.red, "#000000");
});

test("resolveThemes includes a plugin-provided theme", () => {
  const root = mkTmpProject();
  const themeDir = path.join(root, ".ucode/plugins/demo/themes");
  fs.mkdirSync(themeDir, { recursive: true });
  fs.writeFileSync(path.join(themeDir, "plugin-theme.json"), JSON.stringify({ name: "plugin-theme", colors: { blue: "#0000ff" } }));

  const themes = resolveThemes({ projectRoot: root });
  assert.equal(themes["plugin-theme"].source, "plugin:demo");
});
