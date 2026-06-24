import fs from "node:fs";
import path from "node:path";

const IGNORE_DIRS = new Set(["node_modules", ".git", "dist", "build", ".ucode"]);
const MAX_RESULTS = 200;

function walk(dir, results) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, results);
    else results.push(full);
  }
}

export const grepTool = {
  name: "grep",
  description: "Search file contents for a regular expression across a directory tree. Returns matching file:line:text triples, capped at 200 matches.",
  riskLevel: "read",
  parameters: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "Regular expression to search for" },
      path: { type: "string", description: "Directory to search within (default: current working directory)" },
      glob: { type: "string", description: "Only search files whose name matches this glob suffix, e.g. '*.ts'" },
      ignore_case: { type: "boolean" },
    },
    required: ["pattern"],
  },
  async execute({ pattern, path: searchPath, glob, ignore_case }, { cwd }) {
    const root = path.resolve(cwd, searchPath || ".");
    const all = [];
    walk(root, all);

    let regex;
    try {
      regex = new RegExp(pattern, ignore_case ? "i" : "");
    } catch (err) {
      return { isError: true, output: `Invalid regular expression: ${err.message}` };
    }

    const extSuffix = glob ? glob.replace(/^\*/, "") : null;
    const results = [];
    outer: for (const file of all) {
      if (extSuffix && !file.endsWith(extSuffix)) continue;
      let content;
      try {
        content = fs.readFileSync(file, "utf8");
      } catch {
        continue; // binary or unreadable
      }
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (regex.test(lines[i])) {
          results.push(`${file}:${i + 1}:${lines[i].slice(0, 300)}`);
          if (results.length >= MAX_RESULTS) break outer;
        }
      }
    }

    if (!results.length) return { output: "No matches found." };
    return { output: results.join("\n") };
  },
};
