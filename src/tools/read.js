import fs from "node:fs";
import path from "node:path";

const MAX_LINES = 2000;
const MAX_LINE_LEN = 2000;

export const readFileTool = {
  name: "read_file",
  description:
    "Read a file from the local filesystem. Returns content with line numbers (cat -n style). " +
    "Use offset/limit for large files. Can also read images by path (returned as a note, not pixels, in this text-only build).",
  riskLevel: "read",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Absolute or relative path to the file" },
      offset: { type: "integer", description: "1-based line number to start reading from" },
      limit: { type: "integer", description: "Maximum number of lines to read" },
    },
    required: ["path"],
  },
  async execute({ path: filePath, offset, limit }, { cwd }) {
    const resolved = path.resolve(cwd, filePath);
    if (!fs.existsSync(resolved)) {
      return { isError: true, output: `File not found: ${resolved}` };
    }
    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) {
      return { isError: true, output: `${resolved} is a directory, not a file.` };
    }
    const raw = fs.readFileSync(resolved, "utf8");
    const allLines = raw.split("\n");
    const start = Math.max(0, (offset ?? 1) - 1);
    const count = Math.min(limit ?? MAX_LINES, MAX_LINES);
    const slice = allLines.slice(start, start + count);

    const out = slice
      .map((line, i) => {
        const truncated = line.length > MAX_LINE_LEN ? line.slice(0, MAX_LINE_LEN) + " …[truncated]" : line;
        return `${String(start + i + 1).padStart(6, " ")}\t${truncated}`;
      })
      .join("\n");

    return { output: out || "(empty file)" };
  },
};
