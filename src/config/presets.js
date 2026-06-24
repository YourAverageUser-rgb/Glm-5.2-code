// Named provider presets. Any of these can be selected by name, or fully
// overridden/ignored by supplying custom provider/baseURL/model/apiKeyEnv.
// "kind" selects which adapter in src/providers handles the wire protocol.
export const PRESETS = {
  glm: {
    kind: "openai-compatible",
    label: "Zhipu AI / Z.ai GLM",
    baseURL: "https://api.z.ai/api/paas/v4",
    model: "glm-5.2",
    apiKeyEnv: "GLM_API_KEY",
  },
  "glm-mainland": {
    kind: "openai-compatible",
    label: "Zhipu AI (bigmodel.cn mainland endpoint)",
    baseURL: "https://open.bigmodel.cn/api/paas/v4",
    model: "glm-5.2",
    apiKeyEnv: "GLM_API_KEY",
  },
  openai: {
    kind: "openai-compatible",
    label: "OpenAI",
    baseURL: "https://api.openai.com/v1",
    model: "gpt-4.1",
    apiKeyEnv: "OPENAI_API_KEY",
  },
  anthropic: {
    kind: "anthropic",
    label: "Anthropic Claude",
    baseURL: "https://api.anthropic.com/v1",
    model: "claude-sonnet-4-6",
    apiKeyEnv: "ANTHROPIC_API_KEY",
  },
  deepseek: {
    kind: "openai-compatible",
    label: "DeepSeek",
    baseURL: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
    apiKeyEnv: "DEEPSEEK_API_KEY",
  },
  groq: {
    kind: "openai-compatible",
    label: "Groq",
    baseURL: "https://api.groq.com/openai/v1",
    model: "llama-3.3-70b-versatile",
    apiKeyEnv: "GROQ_API_KEY",
  },
  mistral: {
    kind: "openai-compatible",
    label: "Mistral",
    baseURL: "https://api.mistral.ai/v1",
    model: "mistral-large-latest",
    apiKeyEnv: "MISTRAL_API_KEY",
  },
  openrouter: {
    kind: "openai-compatible",
    label: "OpenRouter (proxies most hosted models)",
    baseURL: "https://openrouter.ai/api/v1",
    model: "openrouter/auto",
    apiKeyEnv: "OPENROUTER_API_KEY",
  },
  ollama: {
    kind: "openai-compatible",
    label: "Ollama (local models, no key required)",
    baseURL: "http://localhost:11434/v1",
    model: "llama3.1",
    apiKeyEnv: null,
    apiKeyOptional: true,
  },
  "lm-studio": {
    kind: "openai-compatible",
    label: "LM Studio (local models, no key required)",
    baseURL: "http://localhost:1234/v1",
    model: "local-model",
    apiKeyEnv: null,
    apiKeyOptional: true,
  },
};

export function resolvePreset(name) {
  return PRESETS[name] ?? null;
}

export function listPresets() {
  return Object.entries(PRESETS).map(([name, p]) => ({ name, ...p }));
}
