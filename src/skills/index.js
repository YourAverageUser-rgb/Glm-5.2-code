import fs from "node:fs";
import path from "node:path";

function parseFrontmatter(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: raw };
  const meta = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return { meta, body: match[2].trim() };
}

export function loadSkills(config) {
  const dir = path.join(config.projectRoot ?? process.cwd(), config.skillsDir ?? ".ucode/skills");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const raw = fs.readFileSync(path.join(dir, f), "utf8");
      const { meta, body } = parseFrontmatter(raw);
      const name = meta.name || f.replace(/\.md$/, "");
      return { name, description: meta.description || "", body };
    });
}

export function renderSkill(skill, args) {
  if (!args) return skill.body;
  return skill.body.replaceAll("{{args}}", args);
}
