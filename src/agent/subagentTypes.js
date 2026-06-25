import path from "node:path";
import { parseAgentEntry, readMdEntriesFromDir } from "../util/resourceFiles.js";
import { loadPlugins } from "../plugins/index.js";

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

// Custom types live in .ucode/agents/*.md: frontmatter `name`, `description`,
// optional `tools: read_file,grep,web_fetch` (comma list); body becomes the
// subagent's extra system-prompt instructions on top of the base subagent prompt.
export function loadCustomSubagentTypes(config) {
  const dir = path.join(config.projectRoot ?? process.cwd(), ".ucode/agents");
  const out = {};
  for (const entry of readMdEntriesFromDir(dir, parseAgentEntry)) out[entry.name] = entry;
  return out;
}

function loadPluginSubagentTypes(config) {
  const out = {};
  for (const plugin of loadPlugins(config)) {
    for (const [name, def] of Object.entries(plugin.agents)) {
      if (!(name in out)) out[name] = def;
    }
  }
  return out;
}

export function resolveSubagentTypes(config) {
  return { ...BUILTIN_TYPES, ...loadPluginSubagentTypes(config), ...loadCustomSubagentTypes(config) };
}
