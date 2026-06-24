import fs from "node:fs";
import path from "node:path";

export const rememberTool = {
  name: "remember",
  description:
    "Append a short fact, preference, or convention to persistent memory so future sessions know it automatically. " +
    "Use project scope for repo-specific facts, global scope for things true across all projects.",
  riskLevel: "write",
  parameters: {
    type: "object",
    properties: {
      content: { type: "string", description: "One bullet point worth remembering" },
      scope: { type: "string", enum: ["project", "global"], description: "Defaults to project" },
    },
    required: ["content"],
  },
  async execute({ content, scope }, { cwd, config }) {
    const isGlobal = scope === "global";
    const targetDir = isGlobal ? config.globalDir : path.join(cwd, ".ucode");
    const targetFile = isGlobal
      ? path.join(targetDir, config.globalMemoryFile)
      : path.join(cwd, config.memoryFileNames[0]);

    fs.mkdirSync(path.dirname(targetFile), { recursive: true });
    const line = `- ${content.trim()}\n`;
    fs.appendFileSync(targetFile, line, "utf8");
    return { output: `Remembered to ${targetFile}.` };
  },
};
