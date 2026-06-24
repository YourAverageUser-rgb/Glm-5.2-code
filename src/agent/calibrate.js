import fs from "node:fs";
import path from "node:path";
import { ProviderError } from "../providers/base.js";

const CALIBRATION_FILE = "calibration.json";
const CALIBRATION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // re-check a given provider/model once a month
const ECHO_VALUE = "ucode-calibration-ok";

const PING_TOOL = {
  name: "ucode_ping",
  description: "Internal calibration check. Call this tool immediately with the exact value requested, and nothing else.",
  parameters: {
    type: "object",
    properties: {
      echo: { type: "string", description: 'Echo this exact string back unchanged.' },
    },
    required: ["echo"],
  },
};

function cacheKey(config) {
  return `${config.provider}::${config.model}::${config.baseURL}`;
}

function cachePath(globalDir) {
  return path.join(globalDir, CALIBRATION_FILE);
}

function readCache(globalDir) {
  try {
    const raw = fs.readFileSync(cachePath(globalDir), "utf8");
    return raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeCache(globalDir, cache) {
  try {
    fs.mkdirSync(globalDir, { recursive: true });
    fs.writeFileSync(cachePath(globalDir), JSON.stringify(cache, null, 2) + "\n");
  } catch {
    // Calibration is informational; failing to persist the cache isn't fatal.
  }
}

/**
 * Sends one throwaway request with a single synthetic tool, to check the
 * configured model/endpoint actually emits well-formed tool calls before the
 * agent loop trusts it with a real task. Never throws: a calibration failure
 * is a signal to surface to the user, not a reason to abort.
 */
export async function runCalibration({ provider, config }) {
  try {
    const response = await provider.chat({
      model: config.model,
      system: "You are being calibrated for tool-use support. Respond only by calling the requested tool.",
      messages: [{ role: "user", content: `Call the ucode_ping tool now, with "echo" set to exactly "${ECHO_VALUE}".` }],
      tools: [PING_TOOL],
      temperature: 0,
      maxOutputTokens: 256,
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    });

    const call = response.message?.toolCalls?.find((c) => c.name === PING_TOOL.name);
    if (!call) {
      return { ok: false, reason: "Model responded without calling the test tool — tool-calling may not work reliably with this model/provider." };
    }
    if (call.arguments?.echo !== ECHO_VALUE) {
      return { ok: false, reason: "Model called the test tool but with unexpected arguments — tool-call argument parsing may be unreliable with this model/provider." };
    }
    return { ok: true };
  } catch (err) {
    const reason = err instanceof ProviderError ? err.message : `Unexpected error during calibration: ${err.message}`;
    return { ok: false, reason };
  }
}

/**
 * Runs calibration at most once per provider+model+baseURL, caching the
 * result in <globalDir>/calibration.json for CALIBRATION_TTL_MS. Pass
 * force:true to bypass the cache and re-check.
 */
export async function ensureCalibrated({ provider, config, globalDir, force = false }) {
  const key = cacheKey(config);
  const cache = readCache(globalDir);
  const cached = cache[key];

  if (!force && cached && Date.now() - cached.at < CALIBRATION_TTL_MS) {
    return { ...cached.result, cached: true };
  }

  const result = await runCalibration({ provider, config });
  cache[key] = { at: Date.now(), result };
  writeCache(globalDir, cache);
  return { ...result, cached: false };
}
