import { OpenAICompatibleProvider } from "./openaiCompatible.js";
import { AnthropicProvider } from "./anthropic.js";

const KINDS = {
  "openai-compatible": OpenAICompatibleProvider,
  anthropic: AnthropicProvider,
};

export function createProvider(config) {
  const Klass = KINDS[config.kind];
  if (!Klass) {
    throw new Error(`Unknown provider kind "${config.kind}". Supported: ${Object.keys(KINDS).join(", ")}`);
  }
  return new Klass(config);
}

export function registerProviderKind(kind, Klass) {
  KINDS[kind] = Klass;
}

export { OpenAICompatibleProvider, AnthropicProvider };
