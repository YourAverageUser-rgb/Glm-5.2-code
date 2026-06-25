import fs from "node:fs";
import path from "node:path";

export const writeFileTool = {
  name: "write_file",
  description:
    "Create a new file or overwrite an existing file with the given content. Prefer edit_file for small changes to existing files. " +
    "For large files, don't try to produce everything in one call: write an initial chunk, then call again with append:true to add more " +
    "— you have a large iteration budget, so it's fine to build up a big file across many calls instead of cramming it into one.",
  riskLevel: "write",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Absolute or relative path to the file" },
      content: { type: "string", description: "Content to write. With append:true, this is appended rather than replacing the file." },
      append: { type: "boolean", description: "If true, append content to the end of the file instead of overwriting it (creates the file if it doesn't exist)." },
    },
    required: ["path", "content"],
  },
  async execute({ path: filePath, content, append }, { cwd }) {
    const resolved = path.resolve(cwd, filePath);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    const existed = fs.existsSync(resolved);
    if (append && existed) {
      fs.appendFileSync(resolved, content, "utf8");
      const { size } = fs.statSync(resolved);
      return { output: `Appended ${content.length} bytes to ${resolved} (now ${size} bytes total).` };
    }
    fs.writeFileSync(resolved, content, "utf8");
    return { output: `${existed ? "Overwrote" : "Created"} ${resolved} (${content.length} bytes).` };
  },
};
