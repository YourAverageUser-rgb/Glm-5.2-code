import { readFileTool } from "./read.js";
import { writeFileTool } from "./write.js";
import { editFileTool } from "./edit.js";
import { globTool } from "./glob.js";
import { grepTool } from "./grep.js";
import { bashTool, bashOutputTool, bashKillTool } from "./bash.js";
import { todoWriteTool } from "./todo.js";
import { askUserTool } from "./askUser.js";
import { webFetchTool } from "./webFetch.js";
import { rememberTool } from "./memoryWrite.js";
import { createTaskTool } from "./task.js";

export function buildCoreTools() {
  return [
    readFileTool,
    writeFileTool,
    editFileTool,
    globTool,
    grepTool,
    bashTool,
    bashOutputTool,
    bashKillTool,
    todoWriteTool,
    askUserTool,
    webFetchTool,
    rememberTool,
  ];
}

// Core tools + the subagent dispatcher (kept separate because dispatch_agent
// needs to know about the full tool set in order to hand a subset to subagents).
export function buildAllTools({ maxSubagentDepth = 1 } = {}) {
  const core = buildCoreTools();
  const taskTool = createTaskTool({ allTools: core, defaultDepthRemaining: maxSubagentDepth });
  return [...core, taskTool];
}

export function toolsByName(tools) {
  return new Map(tools.map((t) => [t.name, t]));
}
