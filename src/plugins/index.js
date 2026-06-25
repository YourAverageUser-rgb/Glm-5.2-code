import fs from "node:fs";
import path from "node:path";
import { parseSkillEntry, parseAgentEntry, readJsonDefsFromDir, readMdEntriesFromDir } from "../util/resourceFiles.js";

function pluginRootDirs(config) {
  const dirs = [];
  if (config.globalDir) {
    const globalDir = path.join(config.globalDir, "plugins");
    if (fs.existsSync(globalDir)) dirs.push({ base: globalDir, source: "global" });
  }
  const projectDir = path.join(config.projectRoot ?? process.cwd(), config.pluginsDir ?? ".ucode/plugins");
  if (fs.existsSync(projectDir)) dirs.push({ base: projectDir, source: "project" });
  return dirs;
}

function readManifest(pluginDir, fallbackName) {
  const manifestPath = path.join(pluginDir, "plugin.json");
  if (!fs.existsSync(manifestPath)) return { name: fallbackName, description: "", version: null };
  try {
    const raw = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    return { name: raw.name || fallbackName, description: raw.description || "", version: raw.version || null };
  } catch (err) {
    return { name: fallbackName, description: `(invalid plugin.json: ${err.message})`, version: null };
  }
}

function readHooks(pluginDir) {
  const hooksPath = path.join(pluginDir, "hooks.json");
  if (!fs.existsSync(hooksPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(hooksPath, "utf8"));
  } catch {
    return {};
  }
}

/**
 * A plugin is a directory under .ucode/plugins/<name>/ (project) or
 * ~/.ucode/plugins/<name>/ (global) bundling skills/agents/themes/hooks for
 * distribution as one unit, using the same file conventions as standalone
 * .ucode/skills, .ucode/agents, .ucode/themes, and settings.json hooks:
 *
 *   <name>/plugin.json     { "name": "...", "description": "...", "version": "..." } (optional)
 *   <name>/skills/*.md      same shape as .ucode/skills/*.md
 *   <name>/agents/*.md      same shape as .ucode/agents/*.md
 *   <name>/themes/*.json    same shape as .ucode/themes/*.json
 *   <name>/hooks.json       { "PreToolUse": [...], "PostToolUse": [...], "SessionStart": [...] }
 */
export function loadPlugins(config) {
  const plugins = [];
  for (const { base, source } of pluginRootDirs(config)) {
    for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const pluginDir = path.join(base, entry.name);
      const manifest = readManifest(pluginDir, entry.name);
      const agents = {};
      for (const a of readMdEntriesFromDir(path.join(pluginDir, "agents"), parseAgentEntry)) agents[a.name] = a;
      plugins.push({
        ...manifest,
        source,
        path: pluginDir,
        skills: readMdEntriesFromDir(path.join(pluginDir, "skills"), parseSkillEntry),
        agents,
        themes: readJsonDefsFromDir(path.join(pluginDir, "themes")),
        hooks: readHooks(pluginDir),
      });
    }
  }
  return plugins;
}
