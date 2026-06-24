import fs from "node:fs";
import path from "node:path";

const IGNORE_DIRS = new Set(["node_modules", ".git", "dist", "build", ".ucode"]);

function globToRegExp(glob) {
  // Minimal glob support: **, *, ?, and literal path segments. Good enough for
  // "src/**/*.test.js" style patterns without pulling in a dependency.
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        const isSlashed = glob[i + 2] === "/";
        re += isSlashed ? "(?:.*/)?" : ".*";
        i += isSlashed ? 2 : 1;
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") {
      re += "[^/]";
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${re}$`);
}

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
    if (entry.isDirectory()) {
      walk(full, results);
    } else {
      results.push(full);
    }
  }
}

export const globTool = {
  name: "glob_files",
  description: "Find files matching a glob pattern (supports **, *, ?). Returns matches sorted by most recently modified first.",
  riskLevel: "read",
  parameters: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "Glob pattern, e.g. 'src/**/*.js'" },
      path: { type: "string", description: "Directory to search within (default: current working directory)" },
    },
    required: ["pattern"],
  },
  async execute({ pattern, path: searchPath }, { cwd }) {
    const root = path.resolve(cwd, searchPath || ".");
    const all = [];
    walk(root, all);
    const rel = all.map((f) => path.relative(root, f));
    const regex = globToRegExp(pattern);
    const matched = rel.filter((r) => regex.test(r.split(path.sep).join("/")));

    const withStats = matched
      .map((r) => {
        const full = path.join(root, r);
        const stat = fs.statSync(full);
        return { full, mtime: stat.mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);

    if (!withStats.length) return { output: "No files matched." };
    return { output: withStats.map((f) => f.full).join("\n") };
  },
};
