import path from "node:path";
import { parseSkillEntry, readMdEntriesFromDir } from "../util/resourceFiles.js";
import { loadPlugins } from "../plugins/index.js";

export function loadSkills(config) {
  const projectSkills = readMdEntriesFromDir(path.join(config.projectRoot ?? process.cwd(), config.skillsDir ?? ".ucode/skills"), parseSkillEntry);
  const seen = new Set(projectSkills.map((s) => s.name));
  const pluginSkills = loadPlugins(config)
    .flatMap((p) => p.skills)
    .filter((s) => !seen.has(s.name));
  return [...projectSkills, ...pluginSkills];
}

export function renderSkill(skill, args) {
  if (!args) return skill.body;
  return skill.body.replaceAll("{{args}}", args);
}
