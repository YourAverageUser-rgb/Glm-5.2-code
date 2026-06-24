import fs from "node:fs";
import path from "node:path";

export function loadProjectMemory(cwd, memoryFileNames) {
  for (const name of memoryFileNames) {
    const candidate = path.join(cwd, name);
    if (fs.existsSync(candidate)) {
      return { path: candidate, content: fs.readFileSync(candidate, "utf8") };
    }
  }
  return null;
}

export function loadGlobalMemory(globalDir, globalMemoryFile) {
  const candidate = path.join(globalDir, globalMemoryFile);
  if (fs.existsSync(candidate)) {
    return { path: candidate, content: fs.readFileSync(candidate, "utf8") };
  }
  return null;
}

export function loadMemory(config) {
  const project = loadProjectMemory(config.projectRoot ?? process.cwd(), config.memoryFileNames);
  const global = loadGlobalMemory(config.globalDir, config.globalMemoryFile);
  return { project, global };
}

export function formatMemoryForPrompt({ project, global }) {
  const parts = [];
  if (global?.content?.trim()) {
    parts.push(`# Global memory (${global.path})\n${global.content.trim()}`);
  }
  if (project?.content?.trim()) {
    parts.push(`# Project memory (${project.path})\n${project.content.trim()}`);
  }
  return parts.join("\n\n");
}
