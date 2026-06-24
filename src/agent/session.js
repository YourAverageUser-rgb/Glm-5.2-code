import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

function sessionsDirFor(config) {
  return path.join(config.projectRoot ?? process.cwd(), config.sessionsDir ?? ".ucode/sessions");
}

export function newSessionId() {
  return `${new Date().toISOString().replace(/[:.]/g, "-")}-${crypto.randomBytes(3).toString("hex")}`;
}

export class Session {
  constructor(config, id = newSessionId()) {
    this.config = config;
    this.id = id;
    this.dir = sessionsDirFor(config);
    this.filePath = path.join(this.dir, `${id}.json`);
  }

  exists() {
    return fs.existsSync(this.filePath);
  }

  load() {
    if (!this.exists()) return { messages: [], usage: { inputTokens: 0, outputTokens: 0 }, createdAt: Date.now() };
    return JSON.parse(fs.readFileSync(this.filePath, "utf8"));
  }

  save({ messages, usage }) {
    fs.mkdirSync(this.dir, { recursive: true });
    const existing = this.exists() ? this.load() : { createdAt: Date.now() };
    const payload = {
      ...existing,
      id: this.id,
      model: this.config.model,
      provider: this.config.provider,
      messages,
      usage,
      updatedAt: Date.now(),
    };
    fs.writeFileSync(this.filePath, JSON.stringify(payload, null, 2));
    return payload;
  }
}

export function listSessions(config) {
  const dir = sessionsDirFor(config);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const full = path.join(dir, f);
      const stat = fs.statSync(full);
      return { id: f.replace(/\.json$/, ""), path: full, mtime: stat.mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
}

export function latestSession(config) {
  return listSessions(config)[0] ?? null;
}

// Rough token estimate (no tokenizer dependency): ~4 chars/token in English text.
export function estimateTokens(messages) {
  let chars = 0;
  for (const m of messages) {
    chars += (m.content ?? "").length;
    for (const tc of m.toolCalls ?? []) chars += JSON.stringify(tc.arguments ?? {}).length + tc.name.length;
  }
  return Math.ceil(chars / 4);
}

export function needsCompaction(messages, config) {
  const estimate = estimateTokens(messages);
  const threshold = (config.contextWindowTokens ?? 128000) * (config.compactAtFraction ?? 0.85);
  return estimate > threshold;
}

const SUMMARY_PROMPT =
  "Summarize this conversation so it can replace the full history. Preserve: the user's original goal, " +
  "key decisions made, files created/modified and why, commands run and their outcomes, and any open TODOs " +
  "or unresolved issues. Be dense and factual, no filler. Output plain text, not JSON.";

const KEEP_RECENT = 6; // number of most-recent raw messages to keep verbatim after compaction

/**
 * Collapse older history into a model-generated summary, keeping the most
 * recent messages verbatim so the agent doesn't lose immediate context.
 */
export async function compactMessages({ messages, provider, config }) {
  if (messages.length <= KEEP_RECENT + 1) return messages;

  const recent = messages.slice(-KEEP_RECENT);
  const older = messages.slice(0, -KEEP_RECENT);

  const transcript = older
    .map((m) => {
      if (m.role === "tool") return `[tool result for ${m.name}]: ${(m.content ?? "").slice(0, 500)}`;
      if (m.toolCalls?.length) return `[assistant called tools: ${m.toolCalls.map((t) => t.name).join(", ")}] ${m.content ?? ""}`;
      return `[${m.role}]: ${(m.content ?? "").slice(0, 2000)}`;
    })
    .join("\n");

  let summary;
  try {
    const response = await provider.chat({
      model: config.model,
      system: "You compress agent conversation transcripts into faithful, dense summaries.",
      messages: [{ role: "user", content: `${SUMMARY_PROMPT}\n\nTranscript:\n${transcript}` }],
      temperature: 0,
      maxOutputTokens: 1024,
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    });
    summary = response.message.content ?? "(summary generation returned no content)";
  } catch (err) {
    summary = `(automatic summary failed: ${err.message}; ${older.length} earlier messages were dropped)`;
  }

  return [{ role: "user", content: `[Earlier conversation was compacted to save context.]\n\n${summary}` }, ...recent];
}
