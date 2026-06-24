import fs from "node:fs";
import path from "node:path";

export const writeFileTool = {
  name: "write_file",
  description: "Create a new file or overwrite an existing file with the given content. Prefer edit_file for small changes to existing files.",
  riskLevel: "write",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Absolute or relative path to the file" },
      content: { type: "string", description: "Full content to write to the file" },
    },
    required: ["path", "content"],
  },
  async execute({ path: filePath, content }, { cwd }) {
    const resolved = path.resolve(cwd, filePath);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    const existed = fs.existsSync(resolved);
    fs.writeFileSync(resolved, content, "utf8");
    return { output: `${existed ? "Overwrote" : "Created"} ${resolved} (${content.length} bytes).` };
  },
};
