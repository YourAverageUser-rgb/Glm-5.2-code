import fs from "node:fs";
import path from "node:path";

/** Shared `--- key: value ---` frontmatter parser used by skills, agents, and plugins. */
export function parseFrontmatter(raw) {
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

export function parseSkillEntry(raw, filename) {
  const { meta, body } = parseFrontmatter(raw);
  return { name: meta.name || filename.replace(/\.md$/, ""), description: meta.description || "", body };
}

export function parseAgentEntry(raw, filename) {
  const { meta, body } = parseFrontmatter(raw);
  const allowed = meta.tools ? meta.tools.split(",").map((s) => s.trim()) : null;
  return {
    name: meta.name || filename.replace(/\.md$/, ""),
    description: meta.description || "",
    extraInstructions: body,
    toolFilter: (tools) => (allowed ? tools.filter((t) => allowed.includes(t.name)) : tools.filter((t) => t.name !== "dispatch_agent")),
  };
}

/** Read every *.json file in a directory as a named definition (e.g. themes); malformed files are skipped. */
export function readJsonDefsFromDir(dir) {
  if (!fs.existsSync(dir)) return {};
  const out = {};
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    try {
      const def = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      out[def.name || f.replace(/\.json$/, "")] = def;
    } catch {
      // skip malformed definition file
    }
  }
  return out;
}

export function readMdEntriesFromDir(dir, parse) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => parse(fs.readFileSync(path.join(dir, f), "utf8"), f));
}
