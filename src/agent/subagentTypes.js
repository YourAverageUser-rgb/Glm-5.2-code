import fs from "node:fs";
import path from "node:path";

const READ_ONLY_TOOL_NAMES = ["read_file", "glob_files", "grep", "web_fetch"];

const BUILTIN_TYPES = {
  general: {
    description: "Default subagent with the full tool set minus dispatch_agent (no further nesting).",
    toolFilter: (tools) => tools.filter((t) => t.name !== "dispatch_agent"),
  },
  explore: {
    description: "Read-only codebase search/exploration. Cannot edit files or run commands.",
    toolFilter: (tools) => tools.filter((t) => READ_ONLY_TOOL_NAMES.includes(t.name)),
  },
  plan: {
    description: "Read-only investigation that ends with a proposed plan; cannot make changes.",
    toolFilter: (tools) => tools.filter((t) => READ_ONLY_TOOL_NAMES.includes(t.name) || t.name === "todo_write"),
  },
};

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

// Custom types live in .ucode/agents/*.md: frontmatter `name`, `description`,
// optional `tools: read_file,grep,web_fetch` (comma list); body becomes the
// subagent's extra system-prompt instructions on top of the base subagent prompt.
export function loadCustomSubagentTypes(config) {
  const dir = path.join(config.projectRoot ?? process.cwd(), ".ucode/agents");
  if (!fs.existsSync(dir)) return {};
  const out = {};
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".md"))) {
    const { meta, body } = parseFrontmatter(fs.readFileSync(path.join(dir, f), "utf8"));
    const name = meta.name || f.replace(/\.md$/, "");
    const allowed = meta.tools ? meta.tools.split(",").map((s) => s.trim()) : null;
    out[name] = {
      description: meta.description || "",
      extraInstructions: body,
      toolFilter: (tools) => (allowed ? tools.filter((t) => allowed.includes(t.name)) : tools.filter((t) => t.name !== "dispatch_agent")),
    };
  }
  return out;
}

export function resolveSubagentTypes(config) {
  return { ...BUILTIN_TYPES, ...loadCustomSubagentTypes(config) };
}
