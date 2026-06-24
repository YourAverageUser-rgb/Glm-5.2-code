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
import { createSkillTool } from "./skill.js";

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

// Core tools + subagent dispatcher + (optionally) skills, all wired together
// because dispatch_agent needs the full tool set to hand subsets to subagents,
// and run_skill needs the loaded skill list.
export function buildAllTools({ maxSubagentDepth = 1, skills = [], subagentTypes = { general: { description: "default", toolFilter: (t) => t } } } = {}) {
  const core = buildCoreTools();
  const withSkills = skills.length ? [...core, createSkillTool(skills)] : core;
  const taskTool = createTaskTool({ allTools: withSkills, subagentTypes, defaultDepthRemaining: maxSubagentDepth });
  return [...withSkills, taskTool];
}

export function toolsByName(tools) {
  return new Map(tools.map((t) => [t.name, t]));
}
