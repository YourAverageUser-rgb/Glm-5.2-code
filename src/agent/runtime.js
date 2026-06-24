import { loadConfig, validateConfig } from "../config/index.js";
import { createProvider } from "../providers/index.js";
import { buildAllTools } from "../tools/index.js";
import { loadMemory } from "../memory/index.js";
import { PermissionGate } from "./permissions.js";
import { listPresets } from "../config/presets.js";
import { loadSkills } from "../skills/index.js";
import { resolveSubagentTypes } from "./subagentTypes.js";
import { runHooks } from "../hooks/index.js";
import { ensureCalibrated } from "./calibrate.js";

export async function buildRuntime({ cwd = process.cwd(), flags = {}, confirm } = {}) {
  const config = loadConfig({ cwd, flags });
  const problems = validateConfig(config);

  const provider = problems.length ? null : createProvider(config);
  const skills = loadSkills(config);
  const subagentTypes = resolveSubagentTypes(config);
  const tools = buildAllTools({ maxSubagentDepth: 1, skills, subagentTypes });
  const memory = loadMemory(config);
  const permissionGate = new PermissionGate({
    mode: config.permissionMode,
    allowTools: config.allowTools,
    denyTools: config.denyTools,
    confirm,
  });

  const preset = listPresets().find((p) => p.name === config.provider);
  const providerLabel = preset?.label ?? config.provider;

  let calibration = null;
  if (!problems.length) {
    runHooks("SessionStart", config.hooks?.SessionStart, { tool: "SessionStart", cwd: config.projectRoot ?? cwd }).catch(() => {});
    if (!config.skipCalibration) {
      calibration = await ensureCalibrated({ provider, config, globalDir: config.globalDir, force: Boolean(flags.recalibrate) });
    }
  }

  return { config, problems, provider, tools, memory, permissionGate, providerLabel, skills, subagentTypes, calibration, cwd: config.projectRoot ?? cwd };
}
