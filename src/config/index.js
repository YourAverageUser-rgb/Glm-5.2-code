import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { DEFAULT_CONFIG } from "./defaults.js";
import { resolvePreset } from "./presets.js";

const GLOBAL_DIR = path.join(os.homedir(), ".ucode");
const GLOBAL_CONFIG_PATH = path.join(GLOBAL_DIR, "config.json");

function readJsonIfExists(filePath) {
  try {
    if (!fs.existsSync(filePath)) return {};
    const raw = fs.readFileSync(filePath, "utf8");
    return raw.trim() ? JSON.parse(raw) : {};
  } catch (err) {
    throw new Error(`Failed to parse JSON config at ${filePath}: ${err.message}`);
  }
}

function findProjectSettings(startDir, settingsRelPath) {
  let dir = path.resolve(startDir);
  while (true) {
    const candidate = path.join(dir, settingsRelPath);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function deepMerge(base, override) {
  if (override === undefined || override === null) return base;
  if (Array.isArray(base) || Array.isArray(override)) return override;
  if (typeof base === "object" && base !== null && typeof override === "object") {
    const out = { ...base };
    for (const key of Object.keys(override)) {
      out[key] = deepMerge(base[key], override[key]);
    }
    return out;
  }
  return override;
}

function fromEnv() {
  const env = process.env;
  const cfg = {};
  if (env.UCODE_PROVIDER) cfg.provider = env.UCODE_PROVIDER;
  if (env.UCODE_MODEL) cfg.model = env.UCODE_MODEL;
  if (env.UCODE_BASE_URL) cfg.baseURL = env.UCODE_BASE_URL;
  if (env.UCODE_API_KEY) cfg.apiKey = env.UCODE_API_KEY;
  if (env.UCODE_API_KEY_ENV) cfg.apiKeyEnv = env.UCODE_API_KEY_ENV;
  if (env.UCODE_PERMISSION_MODE) cfg.permissionMode = env.UCODE_PERMISSION_MODE;
  if (env.UCODE_SKIP_CALIBRATION) cfg.skipCalibration = /^(1|true|yes)$/i.test(env.UCODE_SKIP_CALIBRATION);
  if (env.UCODE_THEME) cfg.theme = env.UCODE_THEME;
  return cfg;
}

function fromCliFlags(flags = {}) {
  const cfg = {};
  if (flags.provider) cfg.provider = flags.provider;
  if (flags.model) cfg.model = flags.model;
  if (flags.baseUrl) cfg.baseURL = flags.baseUrl;
  if (flags.apiKey) cfg.apiKey = flags.apiKey;
  if (flags.apiKeyEnv) cfg.apiKeyEnv = flags.apiKeyEnv;
  if (flags.permissionMode) cfg.permissionMode = flags.permissionMode;
  if (flags.noCalibrate) cfg.skipCalibration = true;
  if (flags.theme) cfg.theme = flags.theme;
  return cfg;
}

/**
 * Resolve the final, layered config:
 * defaults < global ~/.ucode/config.json < project .ucode/settings.json < env vars < CLI flags
 */
export function loadConfig({ cwd = process.cwd(), flags = {} } = {}) {
  const globalCfg = readJsonIfExists(GLOBAL_CONFIG_PATH);

  const settingsRelPath = DEFAULT_CONFIG.settingsFile;
  const projectSettingsPath = findProjectSettings(cwd, settingsRelPath);
  const projectCfg = projectSettingsPath ? readJsonIfExists(projectSettingsPath) : {};

  let merged = deepMerge(DEFAULT_CONFIG, globalCfg);
  merged = deepMerge(merged, projectCfg);
  merged = deepMerge(merged, fromEnv());
  merged = deepMerge(merged, fromCliFlags(flags));

  // Resolve provider preset for any field the user didn't explicitly override.
  const preset = resolvePreset(merged.provider) ?? {};
  merged.kind = merged.kind ?? preset.kind ?? "openai-compatible";
  merged.model = merged.model ?? preset.model ?? null;
  merged.baseURL = merged.baseURL ?? preset.baseURL ?? null;
  merged.apiKeyEnv = merged.apiKeyEnv ?? preset.apiKeyEnv ?? null;

  // Resolve the actual API key value: explicit > env var named by apiKeyEnv.
  if (!merged.apiKey && merged.apiKeyEnv) {
    merged.apiKey = process.env[merged.apiKeyEnv] || null;
  }
  merged.apiKeyOptional = Boolean(preset.apiKeyOptional);

  merged.projectRoot = projectSettingsPath ? path.dirname(path.dirname(projectSettingsPath)) : cwd;
  merged.globalDir = GLOBAL_DIR;

  return merged;
}

export function ensureGlobalDir() {
  if (!fs.existsSync(GLOBAL_DIR)) fs.mkdirSync(GLOBAL_DIR, { recursive: true });
  return GLOBAL_DIR;
}

export function writeGlobalConfig(partial) {
  ensureGlobalDir();
  const existing = readJsonIfExists(GLOBAL_CONFIG_PATH);
  const next = deepMerge(existing, partial);
  fs.writeFileSync(GLOBAL_CONFIG_PATH, JSON.stringify(next, null, 2) + "\n");
  return next;
}

export function validateConfig(cfg) {
  const problems = [];
  if (!cfg.model) problems.push("No model configured (set provider/model in .ucode/settings.json, ~/.ucode/config.json, UCODE_MODEL, or --model).");
  if (!cfg.baseURL) problems.push("No baseURL configured for provider.");
  if (!cfg.apiKey && !cfg.apiKeyOptional) {
    problems.push(
      cfg.apiKeyEnv
        ? `No API key found. Set the ${cfg.apiKeyEnv} environment variable, or pass --api-key.`
        : "No API key configured, and no apiKeyEnv is set for this provider."
    );
  }
  return problems;
}

export { GLOBAL_DIR, GLOBAL_CONFIG_PATH };
