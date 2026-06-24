import { loadConfig, validateConfig } from "../config/index.js";
import { createProvider } from "../providers/index.js";
import { buildAllTools } from "../tools/index.js";
import { loadMemory } from "../memory/index.js";
import { PermissionGate } from "./permissions.js";
import { listPresets } from "../config/presets.js";

export function buildRuntime({ cwd = process.cwd(), flags = {}, confirm } = {}) {
  const config = loadConfig({ cwd, flags });
  const problems = validateConfig(config);

  const provider = problems.length ? null : createProvider(config);
  const tools = buildAllTools({ maxSubagentDepth: 1 });
  const memory = loadMemory(config);
  const permissionGate = new PermissionGate({
    mode: config.permissionMode,
    allowTools: config.allowTools,
    denyTools: config.denyTools,
    confirm,
  });

  const preset = listPresets().find((p) => p.name === config.provider);
  const providerLabel = preset?.label ?? config.provider;

  return { config, problems, provider, tools, memory, permissionGate, providerLabel, cwd: config.projectRoot ?? cwd };
}
