export const DEFAULT_CONFIG = {
  // Which preset to start from. "glm" -> Zhipu/Z.ai GLM-5.2, but every field
  // below can be overridden independently to point at literally any model.
  provider: "glm",
  kind: null, // resolved from preset unless explicitly set ("openai-compatible" | "anthropic")
  model: null, // resolved from preset unless explicitly set
  baseURL: null, // resolved from preset unless explicitly set
  apiKey: null, // never stored on disk; resolved at runtime from apiKeyEnv or --api-key
  apiKeyEnv: null, // resolved from preset unless explicitly set

  temperature: 0.3,
  maxOutputTokens: 8192,
  contextWindowTokens: 128000,
  compactAtFraction: 0.85, // trigger history compaction once usage crosses this

  permissionMode: "default", // default | acceptEdits | plan | bypassPermissions
  maxAgentIterations: 100,
  toolTimeoutMs: 10 * 60 * 1000,

  // First file found (project root, searched upward) is used as project memory.
  memoryFileNames: ["UCODE.md", "AGENTS.md", "CLAUDE.md"],
  globalMemoryFile: "MEMORY.md", // under ~/.ucode/

  skillsDir: ".ucode/skills",
  settingsFile: ".ucode/settings.json",
  sessionsDir: ".ucode/sessions",

  allowTools: null, // null = all tools allowed (subject to permissionMode); else array of tool names
  denyTools: [],

  // Skip the first-run model calibration check (a throwaway tool-call probe
  // run once per provider+model+baseURL, cached in ~/.ucode/calibration.json).
  skipCalibration: false,

  hooks: {}, // populated from settings.json: { PreToolUse: [...], PostToolUse: [...], SessionStart: [...] }
};
